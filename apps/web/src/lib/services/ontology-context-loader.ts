// apps/web/src/lib/services/ontology-context-loader.ts
/**
 * Ontology Context Loader Service
 * Loads project ontology data (projects, tasks, goals, etc.) for chat context
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	OntologyContext,
	EntityRelationships,
	OntologyEntityType,
	ProjectHighlights,
	HighlightSection,
	ProjectHighlightGoal,
	ProjectHighlightRisk,
	ProjectHighlightRequirement,
	ProjectHighlightDocument,
	ProjectHighlightMilestone,
	ProjectHighlightPlan,
	ProjectHighlightSignal,
	ProjectHighlightInsight,
	ProjectHighlightTask,
	GraphSnapshot,
	DocumentTreeContext
} from '$lib/types/agent-chat-enhancement';
import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';
import type {
	EntityLinkedContext,
	LinkedEntityContext,
	LinkedEntityKind,
	LoadLinkedEntitiesOptions
} from '$lib/types/linked-entity-context.types';

type ProjectRow = Database['public']['Tables']['onto_projects']['Row'];
type ElementType = Exclude<OntologyEntityType, 'project'>;

type ElementRowMap = {
	task: Database['public']['Tables']['onto_tasks']['Row'];
	plan: Database['public']['Tables']['onto_plans']['Row'];
	goal: Database['public']['Tables']['onto_goals']['Row'];
	document: Database['public']['Tables']['onto_documents']['Row'];
	milestone: Database['public']['Tables']['onto_milestones']['Row'];
	risk: Database['public']['Tables']['onto_risks']['Row'];
	requirement: Database['public']['Tables']['onto_requirements']['Row'];
};

type ElementTableNameMap = {
	[K in ElementType]: `onto_${K extends 'document'
		? 'documents'
		: K extends 'goal'
			? 'goals'
			: K extends 'plan'
				? 'plans'
				: K extends 'task'
					? 'tasks'
					: K extends 'milestone'
						? 'milestones'
						: K extends 'risk'
							? 'risks'
							: 'requirements'}`;
};

type ContextEntityMap = Partial<Record<ElementType, ElementRowMap[ElementType]>> & {
	project?: ProjectRow;
};

type OntologyEntityRow = ProjectRow | ElementRowMap[ElementType];

type ProjectGraphDataLight = {
	project: Database['public']['Tables']['onto_projects']['Row'];
	tasks: Database['public']['Tables']['onto_tasks']['Row'][];
	goals: Database['public']['Tables']['onto_goals']['Row'][];
	plans: Database['public']['Tables']['onto_plans']['Row'][];
	documents: Database['public']['Tables']['onto_documents']['Row'][];
	milestones: Database['public']['Tables']['onto_milestones']['Row'][];
	risks: Database['public']['Tables']['onto_risks']['Row'][];
	requirements: Database['public']['Tables']['onto_requirements']['Row'][];
	signals: Database['public']['Tables']['onto_signals']['Row'][];
	insights: Database['public']['Tables']['onto_insights']['Row'][];
	edges: Database['public']['Tables']['onto_edges']['Row'][];
};

type ProjectGraphContextRpcPayload = {
	project: ProjectGraphDataLight['project'] | null;
	tasks?: ProjectGraphDataLight['tasks'] | null;
	goals?: ProjectGraphDataLight['goals'] | null;
	plans?: ProjectGraphDataLight['plans'] | null;
	documents?: ProjectGraphDataLight['documents'] | null;
	milestones?: ProjectGraphDataLight['milestones'] | null;
	risks?: ProjectGraphDataLight['risks'] | null;
	requirements?: ProjectGraphDataLight['requirements'] | null;
	signals?: ProjectGraphDataLight['signals'] | null;
	insights?: ProjectGraphDataLight['insights'] | null;
	edges?: ProjectGraphDataLight['edges'] | null;
};

const PROJECT_HIGHLIGHT_LIMITS = {
	goals: 10,
	risks: 6,
	requirements: 8,
	documents: 10,
	milestones: 6,
	plans: 6,
	signals: 6,
	insights: 6,
	tasksRecent: 10,
	tasksUpcoming: 5
} as const;

const PROJECT_HIGHLIGHT_TRUNCATION = {
	documentDescription: 180,
	requirementText: 160,
	signalPayload: 160,
	taskDescription: 120,
	goalDescription: 140,
	planDescription: 140,
	milestoneDescription: 140,
	riskContent: 160
} as const;

const GRAPH_SNAPSHOT_LIMITS = {
	maxDepth: 2,
	maxNodes: 60,
	maxEdges: 80,
	maxNodesPerKind: 10
} as const;

const DOCUMENT_TREE_LIMITS = {
	maxDepth: 4,
	maxNodes: 60,
	maxChildrenPerNode: 6,
	maxUnlinked: 8,
	descriptionPreview: 140
} as const;

export class OntologyContextLoader {
	// Simple in-memory cache with TTL
	private cache = new Map<string, { data: OntologyContext; timestamp: number }>();
	private readonly CACHE_TTL = 60000; // 1 minute cache

	constructor(
		private supabase: SupabaseClient<Database>,
		private actorId?: string
	) {}

	private requireActorId(): string {
		if (!this.actorId) {
			throw new Error('Actor ID is required to load ontology context');
		}
		return this.actorId;
	}

	private static readonly ELEMENT_TABLE_MAP: ElementTableNameMap = {
		task: 'onto_tasks',
		plan: 'onto_plans',
		goal: 'onto_goals',
		document: 'onto_documents',
		milestone: 'onto_milestones',
		risk: 'onto_risks',
		requirement: 'onto_requirements'
	} as const;

	/**
	 * Get cached data if still valid
	 */
	private getCached<T extends OntologyContext>(key: string): T | null {
		const cached = this.cache.get(key);
		if (!cached) return null;

		const now = Date.now();
		if (now - cached.timestamp > this.CACHE_TTL) {
			this.cache.delete(key);
			return null;
		}

		return cached.data as T;
	}

	/**
	 * Set cache with current timestamp
	 */
	private setCache(key: string, data: OntologyContext): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});

		// Cleanup old cache entries periodically
		if (this.cache.size > 100) {
			const now = Date.now();
			for (const [k, v] of this.cache.entries()) {
				if (now - v.timestamp > this.CACHE_TTL) {
					this.cache.delete(k);
				}
			}
		}
	}

	private createEmptyProjectHighlights(): ProjectHighlights {
		return {
			goals: { items: [] },
			risks: { items: [] },
			requirements: { items: [] },
			documents: { items: [] },
			milestones: { items: [] },
			plans: { items: [] },
			signals: { items: [] },
			insights: { items: [] },
			tasks: {
				recent: { items: [] },
				upcoming: { items: [] }
			}
		};
	}

	private buildHighlightSection<T>(items: T[], totalCount?: number): HighlightSection<T> {
		const more =
			typeof totalCount === 'number' && totalCount > items.length
				? totalCount - items.length
				: 0;
		return more > 0 ? { items, more } : { items };
	}

	private truncateText(value: string | null | undefined, limit: number): string | null {
		if (!value) return null;
		const trimmed = value.trim();
		if (trimmed.length <= limit) return trimmed;
		return `${trimmed.slice(0, limit).trimEnd()}...`;
	}

	private formatPayloadSummary(payload: unknown): string | null {
		if (payload === null || payload === undefined) return null;
		try {
			if (typeof payload === 'string') {
				return this.truncateText(payload, PROJECT_HIGHLIGHT_TRUNCATION.signalPayload);
			}
			return this.truncateText(
				JSON.stringify(payload),
				PROJECT_HIGHLIGHT_TRUNCATION.signalPayload
			);
		} catch {
			return this.truncateText(String(payload), PROJECT_HIGHLIGHT_TRUNCATION.signalPayload);
		}
	}

	private async loadProjectGraphDataForContext(
		projectId: string
	): Promise<ProjectGraphDataLight> {
		const { data, error } = await this.supabase.rpc('load_project_graph_context', {
			p_project_id: projectId
		});

		if (error) {
			throw new Error(
				`Failed to load project graph context for ${projectId}: ${error.message}`
			);
		}

		const payload = data as ProjectGraphContextRpcPayload | null;
		if (!payload?.project) {
			throw new Error(`Project ${projectId} not found or access denied`);
		}

		return {
			project: payload.project,
			tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
			goals: Array.isArray(payload.goals) ? payload.goals : [],
			plans: Array.isArray(payload.plans) ? payload.plans : [],
			documents: Array.isArray(payload.documents) ? payload.documents : [],
			milestones: Array.isArray(payload.milestones) ? payload.milestones : [],
			risks: Array.isArray(payload.risks) ? payload.risks : [],
			requirements: Array.isArray(payload.requirements) ? payload.requirements : [],
			signals: Array.isArray(payload.signals) ? payload.signals : [],
			insights: Array.isArray(payload.insights) ? payload.insights : [],
			edges: Array.isArray(payload.edges) ? payload.edges : []
		};
	}

	private buildDirectEdgeIdMap(
		projectId: string,
		edges: ProjectGraphDataLight['edges']
	): Record<string, Set<string>> {
		const map: Record<string, Set<string>> = {
			goal: new Set<string>(),
			risk: new Set<string>(),
			requirement: new Set<string>(),
			document: new Set<string>(),
			milestone: new Set<string>(),
			plan: new Set<string>(),
			signal: new Set<string>(),
			insight: new Set<string>(),
			task: new Set<string>()
		};

		for (const edge of edges) {
			if (edge.src_kind === 'project' && edge.src_id === projectId) {
				if (map[edge.dst_kind]) {
					map[edge.dst_kind].add(edge.dst_id);
				}
			} else if (edge.dst_kind === 'project' && edge.dst_id === projectId) {
				if (map[edge.src_kind]) {
					map[edge.src_kind].add(edge.src_id);
				}
			}
		}

		return map;
	}

	private getGraphEntityName(kind: string, entity: any): string {
		if (!entity) return 'Unnamed';
		if (kind === 'task') return entity.title || entity.name || entity.id;
		if (kind === 'document') return entity.title || entity.name || entity.id;
		if (kind === 'requirement') {
			return (
				this.truncateText(entity.text, PROJECT_HIGHLIGHT_TRUNCATION.requirementText) ||
				entity.id
			);
		}
		return (
			entity.name || entity.title || entity.summary || entity.goal || entity.text || entity.id
		);
	}

	private buildEntityIndex(
		graph: ProjectGraphDataLight
	): Map<string, { kind: string; row: any }> {
		const index = new Map<string, { kind: string; row: any }>();
		index.set(graph.project.id, { kind: 'project', row: graph.project });
		graph.tasks.forEach((row) => index.set(row.id, { kind: 'task', row }));
		graph.goals.forEach((row) => index.set(row.id, { kind: 'goal', row }));
		graph.plans.forEach((row) => index.set(row.id, { kind: 'plan', row }));
		graph.documents.forEach((row) => index.set(row.id, { kind: 'document', row }));
		graph.milestones.forEach((row) => index.set(row.id, { kind: 'milestone', row }));
		graph.risks.forEach((row) => index.set(row.id, { kind: 'risk', row }));
		graph.requirements.forEach((row) => index.set(row.id, { kind: 'requirement', row }));
		graph.signals.forEach((row) => index.set(row.id, { kind: 'signal', row }));
		graph.insights.forEach((row) => index.set(row.id, { kind: 'insight', row }));
		return index;
	}

	private scoreGraphNode(kind: string, entity: any): number {
		let score = 0;
		if (!entity) return score;
		if (kind === 'task') {
			if (entity.state_key === 'blocked') score += 50;
			if (entity.state_key === 'in_progress') score += 20;
			if (typeof entity.priority === 'number' && entity.priority <= 2) score += 30;
			if (entity.due_at) score += 15;
		}
		if (kind === 'risk') {
			if (entity.impact === 'critical') score += 40;
			if (entity.impact === 'high') score += 30;
			if (entity.state_key === 'identified') score += 10;
		}
		if (kind === 'goal') {
			if (entity.state_key === 'active') score += 20;
			if (entity.target_date) score += 10;
		}
		return score;
	}

	private buildGraphSnapshot(
		projectId: string,
		graph: ProjectGraphDataLight,
		directEdgeIds: Record<string, Set<string>>
	): GraphSnapshot {
		const entityIndex = this.buildEntityIndex(graph);
		const adjacency = new Map<
			string,
			Array<{ edge: ProjectGraphDataLight['edges'][number]; neighborId: string }>
		>();

		for (const edge of graph.edges) {
			if (!entityIndex.has(edge.src_id) || !entityIndex.has(edge.dst_id)) {
				continue;
			}
			if (!adjacency.has(edge.src_id)) adjacency.set(edge.src_id, []);
			if (!adjacency.has(edge.dst_id)) adjacency.set(edge.dst_id, []);
			adjacency.get(edge.src_id)!.push({ edge, neighborId: edge.dst_id });
			adjacency.get(edge.dst_id)!.push({ edge, neighborId: edge.src_id });
		}

		const graphNodes: Array<{
			id: string;
			kind: string;
			name: string;
			state_key?: string | null;
			type_key?: string | null;
			direct_edge?: boolean;
			last_updated?: string | null;
		}> = [];
		const visited = new Set<string>();
		const kindCounts = new Map<string, number>();
		const queue: Array<{ id: string; depth: number }> = [];

		const addNode = (id: string): boolean => {
			const entry = entityIndex.get(id);
			if (!entry) return false;
			const kind = entry.kind;
			const currentKindCount = kindCounts.get(kind) ?? 0;
			if (currentKindCount >= GRAPH_SNAPSHOT_LIMITS.maxNodesPerKind) return false;
			const row = entry.row as any;
			graphNodes.push({
				id,
				kind,
				name: this.getGraphEntityName(kind, row),
				state_key: row.state_key ?? null,
				type_key: row.type_key ?? null,
				direct_edge: directEdgeIds[kind]?.has(id) ?? false,
				last_updated: row.updated_at ?? row.created_at ?? null
			});
			visited.add(id);
			kindCounts.set(kind, currentKindCount + 1);
			return true;
		};

		addNode(projectId);
		queue.push({ id: projectId, depth: 0 });

		while (queue.length > 0 && graphNodes.length < GRAPH_SNAPSHOT_LIMITS.maxNodes) {
			const current = queue.shift();
			if (!current) break;
			if (current.depth >= GRAPH_SNAPSHOT_LIMITS.maxDepth) continue;

			const neighbors = adjacency.get(current.id) ?? [];
			const sortedNeighbors = [...neighbors].sort((a, b) => {
				const aEntry = entityIndex.get(a.neighborId);
				const bEntry = entityIndex.get(b.neighborId);
				const aScore = aEntry ? this.scoreGraphNode(aEntry.kind, aEntry.row) : 0;
				const bScore = bEntry ? this.scoreGraphNode(bEntry.kind, bEntry.row) : 0;
				return bScore - aScore;
			});

			for (const neighbor of sortedNeighbors) {
				if (graphNodes.length >= GRAPH_SNAPSHOT_LIMITS.maxNodes) break;
				if (visited.has(neighbor.neighborId)) continue;
				if (!addNode(neighbor.neighborId)) continue;
				queue.push({ id: neighbor.neighborId, depth: current.depth + 1 });
			}
		}

		const graphEdges = graph.edges
			.filter((edge) => visited.has(edge.src_id) && visited.has(edge.dst_id))
			.slice(0, GRAPH_SNAPSHOT_LIMITS.maxEdges)
			.map((edge) => ({
				id: edge.id,
				src_id: edge.src_id,
				src_kind: edge.src_kind,
				dst_id: edge.dst_id,
				dst_kind: edge.dst_kind,
				rel: edge.rel
			}));

		return {
			root_id: projectId,
			root_kind: 'project',
			max_depth: GRAPH_SNAPSHOT_LIMITS.maxDepth,
			nodes: graphNodes,
			edges: graphEdges,
			coverage: this.buildGraphCoverage(graph, directEdgeIds)
		};
	}

	private buildGraphCoverage(
		graph: ProjectGraphDataLight,
		directEdgeIds: Record<string, Set<string>>
	): Record<string, { total: number; direct: number; unlinked: number }> {
		const coverage: Record<string, { total: number; direct: number; unlinked: number }> = {};
		const totals: Record<string, number> = {
			goals: graph.goals.length,
			documents: graph.documents.length,
			tasks: graph.tasks.length,
			risks: graph.risks.length,
			requirements: graph.requirements.length,
			milestones: graph.milestones.length,
			plans: graph.plans.length,
			signals: graph.signals.length,
			insights: graph.insights.length
		};

		for (const [kind, total] of Object.entries(totals)) {
			const direct = directEdgeIds[kind.slice(0, -1)]?.size ?? 0;
			coverage[kind] = {
				total,
				direct,
				unlinked: Math.max(total - direct, 0)
			};
		}

		return coverage;
	}

	private buildProjectHighlightsFromGraph(
		graph: ProjectGraphDataLight,
		directEdgeIds: Record<string, Set<string>>
	): ProjectHighlights {
		const tasksById = new Map(graph.tasks.map((task) => [task.id, task]));

		const taskIdsByGoal = new Map<string, Set<string>>();
		const goalIdsByTask = new Map<string, Set<string>>();
		const taskIdsByPlan = new Map<string, Set<string>>();
		const planIdsByTask = new Map<string, Set<string>>();
		const dependencyCounts = new Map<string, number>();
		const dependentCounts = new Map<string, number>();

		const addToMap = (map: Map<string, Set<string>>, key: string, value: string) => {
			if (!map.has(key)) map.set(key, new Set<string>());
			map.get(key)!.add(value);
		};

		const addCount = (map: Map<string, number>, key: string) => {
			map.set(key, (map.get(key) ?? 0) + 1);
		};

		for (const edge of graph.edges) {
			const rel = edge.rel;
			const srcKind = edge.src_kind;
			const dstKind = edge.dst_kind;

			if (
				(rel === 'has_task' && srcKind === 'plan' && dstKind === 'task') ||
				(rel === 'belongs_to_plan' && srcKind === 'task' && dstKind === 'plan')
			) {
				const planId = srcKind === 'plan' ? edge.src_id : edge.dst_id;
				const taskId = srcKind === 'plan' ? edge.dst_id : edge.src_id;
				addToMap(taskIdsByPlan, planId, taskId);
				addToMap(planIdsByTask, taskId, planId);
			}

			if (
				(rel === 'has_task' && srcKind === 'goal' && dstKind === 'task') ||
				(rel === 'supports_goal' && srcKind === 'task' && dstKind === 'goal') ||
				(rel === 'achieved_by' && srcKind === 'goal' && dstKind === 'task')
			) {
				const goalId = srcKind === 'goal' ? edge.src_id : edge.dst_id;
				const taskId = srcKind === 'goal' ? edge.dst_id : edge.src_id;
				addToMap(taskIdsByGoal, goalId, taskId);
				addToMap(goalIdsByTask, taskId, goalId);
			}

			if (srcKind === 'task' && dstKind === 'task') {
				if (rel === 'depends_on' || rel === 'requires') {
					addCount(dependencyCounts, edge.src_id);
					addCount(dependentCounts, edge.dst_id);
				}
				if (rel === 'blocks') {
					addCount(dependentCounts, edge.src_id);
					addCount(dependencyCounts, edge.dst_id);
				}
			}
		}

		const goalsSorted = [...graph.goals].sort((a, b) => {
			const aDate = a.updated_at || a.created_at;
			const bDate = b.updated_at || b.created_at;
			return Date.parse(bDate) - Date.parse(aDate);
		});
		const goalItems = goalsSorted.map((goal) => {
			const taskIds = taskIdsByGoal.get(goal.id) ?? new Set<string>();
			let completedTasks = 0;
			taskIds.forEach((taskId) => {
				const task = tasksById.get(taskId);
				if (task && task.state_key === 'done') completedTasks += 1;
			});
			const totalTasks = taskIds.size;
			const progressPercent =
				totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

			return {
				id: goal.id,
				name: goal.name || goal.goal || 'Untitled goal',
				state_key: goal.state_key,
				type_key: goal.type_key,
				description: this.truncateText(
					goal.description,
					PROJECT_HIGHLIGHT_TRUNCATION.goalDescription
				),
				created_at: goal.created_at,
				updated_at: goal.updated_at,
				target_date: goal.target_date,
				completed_at: goal.completed_at,
				progress_percent: progressPercent,
				completed_tasks: totalTasks > 0 ? completedTasks : null,
				total_tasks: totalTasks > 0 ? totalTasks : null,
				direct_edge: directEdgeIds.goal.has(goal.id)
			};
		});
		const goalsSection = this.buildHighlightSection(
			goalItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.goals),
			goalItems.length
		);

		const documentsFiltered = graph.documents.filter((doc) => {
			const typeKey = doc.type_key || '';
			return !typeKey.includes('scratch') && !typeKey.includes('workspace');
		});
		const documentsSorted = [...documentsFiltered].sort((a, b) => {
			const aDate = a.updated_at || a.created_at;
			const bDate = b.updated_at || b.created_at;
			return Date.parse(bDate) - Date.parse(aDate);
		});
		const documentItems = documentsSorted.map((doc) => ({
			id: doc.id,
			title: doc.title,
			state_key: doc.state_key,
			type_key: doc.type_key,
			description: this.truncateText(
				doc.description,
				PROJECT_HIGHLIGHT_TRUNCATION.documentDescription
			),
			created_at: doc.created_at,
			updated_at: doc.updated_at,
			direct_edge: directEdgeIds.document.has(doc.id)
		}));
		const documentsSection = this.buildHighlightSection(
			documentItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.documents),
			documentItems.length
		);

		const risksSorted = graph.risks
			.filter((risk) => directEdgeIds.risk.has(risk.id))
			.filter((risk) => !['mitigated', 'closed'].includes(risk.state_key ?? ''))
			.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
		const riskItems = risksSorted.map((risk) => ({
			id: risk.id,
			title: risk.title,
			state_key: risk.state_key,
			type_key: risk.type_key,
			impact: risk.impact,
			probability: risk.probability,
			content: this.truncateText(risk.content, PROJECT_HIGHLIGHT_TRUNCATION.riskContent),
			created_at: risk.created_at,
			updated_at: risk.updated_at,
			mitigated_at: risk.mitigated_at
		}));
		const risksSection = this.buildHighlightSection(
			riskItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.risks),
			riskItems.length
		);

		const requirementsSorted = graph.requirements
			.filter((req) => directEdgeIds.requirement.has(req.id))
			.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
		const requirementItems = requirementsSorted.map((req) => ({
			id: req.id,
			text: this.truncateText(req.text, PROJECT_HIGHLIGHT_TRUNCATION.requirementText) || '',
			priority: req.priority,
			type_key: req.type_key,
			created_at: req.created_at,
			updated_at: req.updated_at
		}));
		const requirementsSection = this.buildHighlightSection(
			requirementItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.requirements),
			requirementItems.length
		);

		const milestonesSorted = graph.milestones
			.filter((milestone) => directEdgeIds.milestone.has(milestone.id))
			.sort((a, b) => {
				const aDate = a.due_at || a.created_at;
				const bDate = b.due_at || b.created_at;
				return Date.parse(aDate) - Date.parse(bDate);
			});
		const milestoneItems = milestonesSorted.map((milestone) => ({
			id: milestone.id,
			title: milestone.title,
			due_at: milestone.due_at,
			state_key: milestone.state_key,
			type_key: milestone.type_key,
			description: this.truncateText(
				milestone.description,
				PROJECT_HIGHLIGHT_TRUNCATION.milestoneDescription
			),
			created_at: milestone.created_at,
			updated_at: milestone.updated_at,
			completed_at: milestone.completed_at
		}));
		const milestonesSection = this.buildHighlightSection(
			milestoneItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.milestones),
			milestoneItems.length
		);

		const plansSorted = graph.plans
			.filter((plan) => directEdgeIds.plan.has(plan.id))
			.sort((a, b) => {
				const aDate = a.updated_at || a.created_at;
				const bDate = b.updated_at || b.created_at;
				return Date.parse(bDate) - Date.parse(aDate);
			});
		const planItems = plansSorted.map((plan) => {
			const taskIds = taskIdsByPlan.get(plan.id) ?? new Set<string>();
			let completedCount = 0;
			taskIds.forEach((taskId) => {
				const task = tasksById.get(taskId);
				if (task && task.state_key === 'done') completedCount += 1;
			});
			return {
				id: plan.id,
				name: plan.name,
				state_key: plan.state_key,
				type_key: plan.type_key,
				description: this.truncateText(
					plan.description,
					PROJECT_HIGHLIGHT_TRUNCATION.planDescription
				),
				task_count: taskIds.size,
				completed_task_count: taskIds.size > 0 ? completedCount : null,
				created_at: plan.created_at,
				updated_at: plan.updated_at
			};
		});
		const plansSection = this.buildHighlightSection(
			planItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.plans),
			planItems.length
		);

		const signalsSorted = graph.signals
			.filter((signal) => directEdgeIds.signal.has(signal.id))
			.sort((a, b) => {
				const aDate = a.ts || a.created_at;
				const bDate = b.ts || b.created_at;
				return Date.parse(bDate) - Date.parse(aDate);
			});
		const signalItems = signalsSorted.map((signal) => ({
			id: signal.id,
			channel: signal.channel,
			ts: signal.ts,
			created_at: signal.created_at,
			payload_summary: this.formatPayloadSummary(signal.payload)
		}));
		const signalsSection = this.buildHighlightSection(
			signalItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.signals),
			signalItems.length
		);

		const insightsSorted = graph.insights
			.filter((insight) => directEdgeIds.insight.has(insight.id))
			.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
		const insightItems = insightsSorted.map((insight) => ({
			id: insight.id,
			title: insight.title,
			created_at: insight.created_at,
			derived_from_signal_id: insight.derived_from_signal_id,
			summary:
				this.truncateText(
					(insight.props as any)?.summary,
					PROJECT_HIGHLIGHT_TRUNCATION.signalPayload
				) || null
		}));
		const insightsSection = this.buildHighlightSection(
			insightItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.insights),
			insightItems.length
		);

		const now = new Date();
		const recentSince = new Date(now);
		recentSince.setDate(now.getDate() - 7);
		const upcomingUntil = new Date(now);
		upcomingUntil.setDate(now.getDate() + 7);

		const recentTasksRaw = graph.tasks
			.filter((task) => task.updated_at)
			.filter(
				(task) =>
					task.updated_at &&
					Date.parse(task.updated_at) >= recentSince.getTime() &&
					!['done', 'blocked'].includes(task.state_key ?? '')
			)
			.sort((a, b) => Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''));

		const recentTaskItems = recentTasksRaw.map((task) => ({
			id: task.id,
			title: task.title,
			state_key: task.state_key,
			type_key: task.type_key,
			priority: task.priority,
			description: this.truncateText(
				task.description,
				PROJECT_HIGHLIGHT_TRUNCATION.taskDescription
			),
			updated_at: task.updated_at,
			start_at: task.start_at,
			due_at: task.due_at,
			created_at: task.created_at,
			completed_at: task.completed_at,
			plan_ids: [...(planIdsByTask.get(task.id) ?? new Set())],
			goal_ids: [...(goalIdsByTask.get(task.id) ?? new Set())],
			dependency_count: dependencyCounts.get(task.id) ?? 0,
			dependent_count: dependentCounts.get(task.id) ?? 0
		}));
		const recentTasksSection = this.buildHighlightSection(
			recentTaskItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.tasksRecent),
			recentTaskItems.length
		);

		const recentIds = new Set(recentTaskItems.map((task) => task.id));
		const upcomingRaw = graph.tasks.filter((task) => {
			if (['done', 'blocked'].includes(task.state_key ?? '')) return false;
			const due = task.due_at ? Date.parse(task.due_at) : null;
			const start = task.start_at ? Date.parse(task.start_at) : null;
			const dueInRange = due ? due >= now.getTime() && due <= upcomingUntil.getTime() : false;
			const startInRange = start
				? start >= now.getTime() && start <= upcomingUntil.getTime()
				: false;
			return dueInRange || startInRange;
		});

		const upcomingSorted = upcomingRaw.sort((a, b) => {
			const aDue = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
			const aStart = a.start_at ? Date.parse(a.start_at) : Number.POSITIVE_INFINITY;
			const bDue = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
			const bStart = b.start_at ? Date.parse(b.start_at) : Number.POSITIVE_INFINITY;
			const aEarliest = Math.min(aDue, aStart);
			const bEarliest = Math.min(bDue, bStart);
			if (aEarliest !== bEarliest) return aEarliest - bEarliest;
			const aUpdated = a.updated_at ? Date.parse(a.updated_at) : 0;
			const bUpdated = b.updated_at ? Date.parse(b.updated_at) : 0;
			return bUpdated - aUpdated;
		});

		const upcomingItems = upcomingSorted
			.filter((task) => !recentIds.has(task.id))
			.map((task) => ({
				id: task.id,
				title: task.title,
				state_key: task.state_key,
				type_key: task.type_key,
				priority: task.priority,
				description: this.truncateText(
					task.description,
					PROJECT_HIGHLIGHT_TRUNCATION.taskDescription
				),
				updated_at: task.updated_at,
				start_at: task.start_at,
				due_at: task.due_at,
				created_at: task.created_at,
				completed_at: task.completed_at,
				plan_ids: [...(planIdsByTask.get(task.id) ?? new Set())],
				goal_ids: [...(goalIdsByTask.get(task.id) ?? new Set())],
				dependency_count: dependencyCounts.get(task.id) ?? 0,
				dependent_count: dependentCounts.get(task.id) ?? 0
			}));
		const upcomingTasksSection = this.buildHighlightSection(
			upcomingItems.slice(0, PROJECT_HIGHLIGHT_LIMITS.tasksUpcoming),
			upcomingItems.length
		);

		return {
			goals: goalsSection,
			risks: risksSection,
			requirements: requirementsSection,
			documents: documentsSection,
			milestones: milestonesSection,
			plans: plansSection,
			signals: signalsSection,
			insights: insightsSection,
			tasks: {
				recent: recentTasksSection,
				upcoming: upcomingTasksSection
			}
		};
	}

	private buildProjectRelationshipsFromEdges(
		projectId: string,
		edges: ProjectGraphDataLight['edges']
	): EntityRelationships {
		const directEdges = edges.filter(
			(edge) =>
				(edge.src_id === projectId && edge.src_kind === 'project') ||
				(edge.dst_id === projectId && edge.dst_kind === 'project')
		);

		return {
			edges: directEdges.slice(0, 50).map((edge) => ({
				relation: edge.rel,
				target_kind:
					edge.src_id === projectId && edge.src_kind === 'project'
						? edge.dst_kind
						: edge.src_kind,
				target_id:
					edge.src_id === projectId && edge.src_kind === 'project'
						? edge.dst_id
						: edge.src_id,
				target_name: undefined
			})),
			hierarchy_level: 0
		};
	}

	private getProjectEntityCountsFromGraph(graph: ProjectGraphDataLight): Record<string, number> {
		return {
			tasks: graph.tasks.length,
			goals: graph.goals.length,
			plans: graph.plans.length,
			documents: graph.documents.length,
			milestones: graph.milestones.length,
			risks: graph.risks.length,
			requirements: graph.requirements.length,
			signals: graph.signals.length,
			insights: graph.insights.length
		};
	}

	private normalizeDocStructure(structure: DocStructure | null | undefined): DocStructure {
		const version = typeof structure?.version === 'number' ? structure.version : 1;
		const root = Array.isArray(structure?.root) ? structure.root : [];
		return { version, root };
	}

	private collectDocIds(
		nodes: DocTreeNode[],
		visited: Set<string> = new Set<string>()
	): Set<string> {
		for (const node of nodes) {
			if (!node || typeof node.id !== 'string') continue;
			if (visited.has(node.id)) continue;
			visited.add(node.id);
			if (Array.isArray(node.children) && node.children.length > 0) {
				this.collectDocIds(node.children, visited);
			}
		}
		return visited;
	}

	private sortTreeNodes(nodes: DocTreeNode[]): DocTreeNode[] {
		return [...nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}

	private buildDocumentTreeContext(
		structure: DocStructure,
		documents: ProjectGraphDataLight['documents']
	): DocumentTreeContext {
		const normalized = this.normalizeDocStructure(structure);
		const docIndex = new Map(documents.map((doc) => [doc.id, doc]));
		const docIdsInTree = this.collectDocIds(normalized.root);
		const totalNodes = docIdsInTree.size;
		const unlinkedDocs = documents.filter((doc) => !docIdsInTree.has(doc.id));
		const unlinkedPreview = unlinkedDocs
			.slice(0, DOCUMENT_TREE_LIMITS.maxUnlinked)
			.map((doc) => ({
				id: doc.id,
				title: doc.title || 'Untitled'
			}));

		let nodesRendered = 0;
		let truncated = false;
		const renderedIds = new Set<string>();

		const buildNode = (
			node: DocTreeNode,
			depth: number
		): DocumentTreeContext['root'][number] | null => {
			if (!node || typeof node.id !== 'string') return null;
			if (renderedIds.has(node.id)) {
				truncated = true;
				return null;
			}
			if (nodesRendered >= DOCUMENT_TREE_LIMITS.maxNodes) {
				truncated = true;
				return null;
			}

			nodesRendered += 1;
			renderedIds.add(node.id);

			const doc = docIndex.get(node.id);
			const contextNode: DocumentTreeContext['root'][number] = {
				id: node.id,
				title: doc?.title || 'Untitled',
				description: this.truncateText(
					doc?.description ?? null,
					DOCUMENT_TREE_LIMITS.descriptionPreview
				),
				order: typeof node.order === 'number' ? node.order : null
			};

			if (Array.isArray(node.children) && node.children.length > 0) {
				if (depth >= DOCUMENT_TREE_LIMITS.maxDepth) {
					truncated = true;
				} else {
					const childNodes: DocumentTreeContext['root'] = [];
					const sortedChildren = this.sortTreeNodes(node.children);
					const visibleChildren = sortedChildren.slice(
						0,
						DOCUMENT_TREE_LIMITS.maxChildrenPerNode
					);
					if (sortedChildren.length > visibleChildren.length) {
						truncated = true;
					}
					for (const child of visibleChildren) {
						const built = buildNode(child, depth + 1);
						if (built) {
							childNodes.push(built);
						}
						if (nodesRendered >= DOCUMENT_TREE_LIMITS.maxNodes) {
							truncated = true;
							break;
						}
					}
					if (childNodes.length > 0) {
						contextNode.children = childNodes;
					}
					if (node.children.length > childNodes.length) {
						truncated = true;
					}
				}
			}

			return contextNode;
		};

		const rootNodes: DocumentTreeContext['root'] = [];
		for (const node of this.sortTreeNodes(normalized.root)) {
			const built = buildNode(node, 0);
			if (built) {
				rootNodes.push(built);
			}
			if (nodesRendered >= DOCUMENT_TREE_LIMITS.maxNodes) {
				truncated = true;
				break;
			}
		}

		const needsTruncation =
			truncated || unlinkedDocs.length > unlinkedPreview.length || nodesRendered < totalNodes;

		return {
			version: normalized.version,
			root: rootNodes,
			total_nodes: totalNodes,
			truncated: needsTruncation || undefined,
			unlinked_count: unlinkedDocs.length,
			unlinked: unlinkedPreview.length > 0 ? unlinkedPreview : undefined
		};
	}

	private async loadProjectDocStructure(projectId: string): Promise<DocStructure> {
		const { data, error } = await this.supabase
			.from('onto_projects')
			.select('doc_structure')
			.eq('id', projectId)
			.maybeSingle();

		if (error) {
			throw error;
		}

		const structure = data?.doc_structure as DocStructure | null | undefined;
		return this.normalizeDocStructure(structure);
	}

	private async loadProjectDocumentsForTree(
		projectId: string
	): Promise<ProjectGraphDataLight['documents']> {
		const { data, error } = await this.supabase
			.from('onto_documents')
			.select('id, title, description')
			.eq('project_id', projectId)
			.is('deleted_at', null);

		if (error) {
			throw error;
		}

		return (data ?? []) as ProjectGraphDataLight['documents'];
	}

	private async loadProjectDocumentTreeContext(
		projectId: string,
		structure?: DocStructure | null
	): Promise<{ docStructure: DocStructure; documentTree: DocumentTreeContext }> {
		const docStructure = structure
			? this.normalizeDocStructure(structure)
			: await this.loadProjectDocStructure(projectId);
		const documents = await this.loadProjectDocumentsForTree(projectId);

		return {
			docStructure,
			documentTree: this.buildDocumentTreeContext(docStructure, documents)
		};
	}

	/**
	 * Load global context - overview of all projects
	 */
	async loadGlobalContext(): Promise<OntologyContext> {
		const actorId = this.requireActorId();
		console.log('[OntologyLoader] Loading global context');

		// Get recent projects
		const { data: projects, error: projectError } = await this.supabase
			.from('onto_projects')
			.select(
				'id, name, state_key, type_key, description, next_step_short, next_step_long, start_at, end_at, facet_context, facet_scale, facet_stage, updated_at'
			)
			.eq('created_by', actorId)
			.limit(50)
			.order('created_at', { ascending: false });

		if (projectError) {
			console.error('[OntologyLoader] Failed to load projects:', projectError);
		}

		// Get total counts
		const { count: totalProjects } = await this.supabase
			.from('onto_projects')
			.select('*', { count: 'exact', head: true })
			.eq('created_by', actorId);

		// Get entity type counts
		const entityCounts = await this.getGlobalEntityCounts();

		return {
			type: 'global',
			entities: {
				projects: projects || []
			},
			metadata: {
				entity_count: entityCounts,
				last_updated: new Date().toISOString(),
				total_projects: totalProjects || 0,
				available_entity_types: [
					'project',
					'task',
					'plan',
					'goal',
					'document',
					'milestone',
					'risk',
					'requirement'
				],
				recent_project_ids: (projects || []).map((project) => project.id)
			}
		};
	}

	/**
	 * Load project-specific context with relationships
	 */
	async loadProjectContext(projectId: string): Promise<OntologyContext> {
		await this.assertProjectOwnership(projectId);
		console.log('[OntologyLoader] Loading project context for:', projectId);

		// Check cache first
		const cacheKey = `project:${projectId}`;
		const cached = this.getCached<OntologyContext>(cacheKey);
		if (cached) {
			console.log('[OntologyLoader] Using cached project context');
			return cached;
		}

		const graphData = await this.loadProjectGraphDataForContext(projectId);
		const directEdgeIds = this.buildDirectEdgeIdMap(projectId, graphData.edges);

		const contextEdge = graphData.edges.find(
			(edge) =>
				edge.src_kind === 'project' &&
				edge.src_id === projectId &&
				edge.rel === 'has_context_document' &&
				edge.dst_kind === 'document'
		);
		const contextDocumentId = contextEdge?.dst_id ?? null;
		const contextDocumentTitle =
			contextDocumentId &&
			graphData.documents.find((doc) => doc.id === contextDocumentId)?.title;

		const relationships = this.buildProjectRelationshipsFromEdges(projectId, graphData.edges);
		const entityCounts = this.getProjectEntityCountsFromGraph(graphData);
		const projectHighlights = this.buildProjectHighlightsFromGraph(graphData, directEdgeIds);
		const graphSnapshot = this.buildGraphSnapshot(projectId, graphData, directEdgeIds);
		const docStructure = await this.loadProjectDocStructure(projectId);
		const documentTree = this.buildDocumentTreeContext(docStructure, graphData.documents);

		const facets = {
			context: graphData.project.facet_context ?? null,
			scale: graphData.project.facet_scale ?? null,
			stage: graphData.project.facet_stage ?? null
		};

		const context: OntologyContext = {
			type: 'project',
			entities: {
				project: graphData.project
			},
			relationships,
			metadata: {
				entity_count: entityCounts,
				context_document_id: contextDocumentId ?? undefined,
				context_document_title: contextDocumentTitle ?? undefined,
				facets: facets,
				last_updated: new Date().toISOString(),
				project_highlights: projectHighlights,
				graph_snapshot: graphSnapshot,
				document_tree: documentTree,
				doc_structure: docStructure
			},
			scope: {
				projectId: graphData.project.id,
				projectName: graphData.project.name
			}
		};

		// Cache the result
		this.setCache(cacheKey, context);

		return context;
	}

	/**
	 * Load element-specific context (task, goal, plan, etc.)
	 */
	async loadElementContext(
		elementType: ElementType,
		elementId: string,
		options: { includeDocumentTree?: boolean } = {}
	): Promise<OntologyContext> {
		await this.assertEntityOwnership(elementId);
		console.log('[OntologyLoader] Loading element context:', elementType, elementId);

		// Load the element
		const element = await this.loadElement(elementType, elementId);

		if (!element) {
			throw new Error(`${elementType} ${elementId} not found`);
		}

		// Find parent project
		const parentProject = await this.findParentProject(elementId);
		const includeDocumentTree = options.includeDocumentTree ?? true;

		// Load element relationships
		const relationships = await this.loadElementRelationships(elementId);

		const entities: OntologyContext['entities'] = {};
		const singularEntities = this.asContextEntityMap(entities);
		singularEntities[elementType] = element;

		if (parentProject) {
			singularEntities.project = parentProject;
		}

		const metadata: OntologyContext['metadata'] = {
			hierarchy_level: await this.getHierarchyLevel(elementId),
			last_updated: new Date().toISOString()
		};

		if (parentProject) {
			const rawStructure = (parentProject as any)?.doc_structure as
				| DocStructure
				| null
				| undefined;

			if (includeDocumentTree) {
				try {
					const { docStructure, documentTree } = await this.loadProjectDocumentTreeContext(
						parentProject.id,
						rawStructure ?? null
					);
					metadata.doc_structure = docStructure;
					metadata.document_tree = documentTree;
				} catch (error) {
					console.warn('[OntologyLoader] Failed to load document tree for element context', {
						projectId: parentProject.id,
						error: error instanceof Error ? error.message : String(error)
					});
					metadata.doc_structure = this.normalizeDocStructure(rawStructure);
				}
			} else {
				metadata.doc_structure = this.normalizeDocStructure(rawStructure);
			}
		}

		return {
			type: 'element',
			entities,
			relationships,
			metadata,
			scope: {
				projectId: parentProject?.id,
				projectName: parentProject?.name,
				focus: {
					type: elementType,
					id: element.id,
					name: this.getEntityDisplayName(element, elementType)
				}
			}
		};
	}

	/**
	 * Load combined project + element context for focus mode
	 */
	async loadCombinedProjectElementContext(
		projectId: string,
		elementType: 'task' | 'goal' | 'plan' | 'document' | 'milestone' | 'risk' | 'requirement',
		elementId: string
	): Promise<OntologyContext> {
		await this.assertProjectOwnership(projectId);
		await this.assertEntityOwnership(elementId);
		console.log('[OntologyLoader] Loading combined context', {
			projectId,
			elementType,
			elementId
		});

		const [projectContext, elementContext] = await Promise.all([
			this.loadProjectContext(projectId),
			this.loadElementContext(elementType, elementId, { includeDocumentTree: false })
		]);

		if (elementContext.scope?.projectId && elementContext.scope.projectId !== projectId) {
			console.warn(
				'[OntologyLoader] Focus element parent mismatch. Expected project',
				projectId,
				'but found',
				elementContext.scope.projectId
			);
		}

		const combinedEdges = [
			...(projectContext.relationships?.edges ?? []),
			...(elementContext.relationships?.edges ?? [])
		];

		const combinedEntities: OntologyContext['entities'] = {
			...(projectContext.entities || {}),
			...(elementContext.entities || {})
		};

		const focusType: ElementType = elementContext.scope?.focus?.type ?? elementType;
		const elementEntityMap = this.asContextEntityMap(elementContext.entities);
		const focusEntity = elementEntityMap[focusType];

		if (focusEntity) {
			const combinedEntityMap = this.asContextEntityMap(combinedEntities);
			combinedEntityMap[focusType] = focusEntity;
		}

		return {
			type: 'combined',
			entities: combinedEntities,
			relationships: {
				edges: combinedEdges,
				hierarchy_level: Math.max(
					projectContext.relationships?.hierarchy_level ?? 0,
					elementContext.relationships?.hierarchy_level ?? 1
				)
			},
			metadata: {
				...projectContext.metadata,
				...elementContext.metadata
			},
			scope: {
				projectId: projectContext.scope?.projectId ?? projectId,
				projectName: projectContext.scope?.projectName,
				focus: elementContext.scope?.focus ?? {
					type: focusType,
					id: focusEntity?.id ?? elementId,
					name: this.getEntityDisplayName(focusEntity, focusType)
				}
			}
		};
	}

	/**
	 * Load linked entities context for a focused entity.
	 * This provides the AI agent with relationship awareness.
	 *
	 * @param entityId - The ID of the focused entity
	 * @param entityKind - The type of the focused entity (task, plan, goal, etc.)
	 * @param entityName - The display name of the focused entity
	 * @param options - Options for loading (maxPerType, includeDescriptions)
	 * @returns EntityLinkedContext with linked entities grouped by type
	 */
	async loadLinkedEntitiesContext(
		entityId: string,
		entityKind: OntologyEntityType,
		entityName: string,
		options: LoadLinkedEntitiesOptions = {}
	): Promise<EntityLinkedContext> {
		await this.assertEntityOwnership(entityId);
		const {
			maxPerType = 3,
			includeDescriptions = false,
			priorityOrder = 'active_first'
		} = options;

		console.log('[OntologyLoader] Loading linked entities for:', entityKind, entityId);

		// Query all edges where this entity is source OR destination
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('id, src_kind, src_id, rel, dst_kind, dst_id')
			.or(`src_id.eq.${entityId},dst_id.eq.${entityId}`);

		if (error) {
			console.error('[OntologyLoader] Failed to load linked entity edges:', error);
			return this.createEmptyLinkedContext(entityId, entityKind, entityName);
		}

		// Group edges by target entity kind
		const edgesByKind: Record<
			LinkedEntityKind,
			Array<{
				edgeId: string;
				targetId: string;
				relation: string;
				direction: 'outgoing' | 'incoming';
			}>
		> = {
			task: [],
			plan: [],
			goal: [],
			milestone: [],
			document: [],
			risk: [],
			requirement: []
		};

		for (const edge of edges || []) {
			const isSource = edge.src_id === entityId;
			const targetKind = (isSource ? edge.dst_kind : edge.src_kind) as LinkedEntityKind;
			const targetId = isSource ? edge.dst_id : edge.src_id;

			// Skip if target kind is not a valid linked entity kind
			if (!edgesByKind[targetKind]) continue;

			// Skip self-references
			if (targetId === entityId) continue;

			edgesByKind[targetKind].push({
				edgeId: edge.id,
				targetId,
				relation: edge.rel,
				direction: isSource ? 'outgoing' : 'incoming'
			});
		}

		// Batch fetch entity details for each kind
		const linkedEntities: EntityLinkedContext['linkedEntities'] = {
			plans: [],
			goals: [],
			tasks: [],
			milestones: [],
			documents: [],
			risks: [],
			requirements: []
		};

		const counts: EntityLinkedContext['counts'] = {
			plans: edgesByKind.plan.length,
			goals: edgesByKind.goal.length,
			tasks: edgesByKind.task.length,
			milestones: edgesByKind.milestone.length,
			documents: edgesByKind.document.length,
			risks: edgesByKind.risk.length,
			requirements: edgesByKind.requirement.length,
			total: 0
		};
		counts.total =
			counts.plans +
			counts.goals +
			counts.tasks +
			counts.milestones +
			counts.documents +
			counts.risks +
			counts.requirements;

		let truncated = false;

		// Fetch each entity type
		const entityFetchers: Array<{
			kind: LinkedEntityKind;
			table: string;
			edges: typeof edgesByKind.task;
			targetKey: keyof EntityLinkedContext['linkedEntities'];
		}> = [
			{ kind: 'plan', table: 'onto_plans', edges: edgesByKind.plan, targetKey: 'plans' },
			{ kind: 'goal', table: 'onto_goals', edges: edgesByKind.goal, targetKey: 'goals' },
			{ kind: 'task', table: 'onto_tasks', edges: edgesByKind.task, targetKey: 'tasks' },
			{
				kind: 'milestone',
				table: 'onto_milestones',
				edges: edgesByKind.milestone,
				targetKey: 'milestones'
			},
			{
				kind: 'document',
				table: 'onto_documents',
				edges: edgesByKind.document,
				targetKey: 'documents'
			},
			{
				kind: 'risk',
				table: 'onto_risks',
				edges: edgesByKind.risk,
				targetKey: 'risks'
			},
			{
				kind: 'requirement',
				table: 'onto_requirements',
				edges: edgesByKind.requirement,
				targetKey: 'requirements'
			}
		];

		// Fetch all entity types in parallel
		await Promise.all(
			entityFetchers.map(async ({ kind, table, edges: kindEdges, targetKey }) => {
				if (kindEdges.length === 0) return;

				// Check if we need to truncate
				if (kindEdges.length > maxPerType) {
					truncated = true;
				}

				// Get IDs to fetch (limited to maxPerType)
				const idsToFetch = kindEdges.slice(0, maxPerType).map((e) => e.targetId);

				// Fetch entities
				const { data: entities, error: fetchError } = await this.supabase
					.from(table as any)
					.select('*')
					.in('id', idsToFetch);

				if (fetchError || !entities) {
					console.error(`[OntologyLoader] Failed to fetch ${kind} entities:`, fetchError);
					return;
				}

				// Map to LinkedEntityContext format
				const entityMap = new Map(entities.map((e: any) => [e.id, e]));

				for (const edge of kindEdges.slice(0, maxPerType)) {
					const entity = entityMap.get(edge.targetId) as any;
					if (!entity) continue;

					// Filter out scratch/workspace documents
					if (kind === 'document') {
						const typeKey = entity.type_key || '';
						if (typeKey.includes('scratch') || typeKey.includes('workspace')) {
							continue;
						}
					}

					const linkedEntity: LinkedEntityContext = {
						kind,
						id: entity.id,
						name:
							entity.name ||
							entity.title ||
							entity.summary ||
							entity.text ||
							`${kind}:${entity.id}`,
						state: entity.state_key || null,
						typeKey: entity.type_key || null,
						relation: edge.relation,
						direction: edge.direction,
						edgeId: edge.edgeId
					};

					// Add optional fields
					if (includeDescriptions && entity.description) {
						linkedEntity.description = entity.description;
					}
					if (kind === 'milestone' && entity.due_at) {
						linkedEntity.dueAt = entity.due_at;
					}

					linkedEntities[targetKey].push(linkedEntity);
				}

				// Sort by active_first if specified
				if (priorityOrder === 'active_first') {
					linkedEntities[targetKey].sort((a, b) => {
						const activeStates = ['active', 'in_progress', 'todo'];
						const aActive = activeStates.includes(a.state || '');
						const bActive = activeStates.includes(b.state || '');
						if (aActive && !bActive) return -1;
						if (!aActive && bActive) return 1;
						return 0;
					});
				}
			})
		);

		return {
			source: {
				kind: entityKind,
				id: entityId,
				name: entityName
			},
			linkedEntities,
			counts,
			truncated,
			loadedAt: new Date().toISOString()
		};
	}

	/**
	 * Create an empty linked context for when no edges exist
	 */
	private createEmptyLinkedContext(
		entityId: string,
		entityKind: OntologyEntityType,
		entityName: string
	): EntityLinkedContext {
		return {
			source: {
				kind: entityKind,
				id: entityId,
				name: entityName
			},
			linkedEntities: {
				plans: [],
				goals: [],
				tasks: [],
				milestones: [],
				documents: [],
				risks: [],
				requirements: []
			},
			counts: {
				plans: 0,
				goals: 0,
				tasks: 0,
				milestones: 0,
				documents: 0,
				risks: 0,
				requirements: 0,
				total: 0
			},
			truncated: false,
			loadedAt: new Date().toISOString()
		};
	}

	/**
	 * Load a specific element from its table
	 */
	private async loadElement<T extends ElementType>(
		type: T,
		id: string
	): Promise<ElementRowMap[T] | null> {
		const table = OntologyContextLoader.ELEMENT_TABLE_MAP[type];
		const actorId = this.actorId;

		try {
			// Use type assertion to work around complex Supabase type inference
			let query = (this.supabase.from(table) as any).select('*').eq('id', id);
			if (actorId) {
				query = query.eq('created_by', actorId);
			}

			const { data, error } = await query.single();

			if (error) {
				console.error(`[OntologyLoader] Failed to load ${type}:`, error);
				return null;
			}

			return data as ElementRowMap[T];
		} catch (error) {
			console.error(`[OntologyLoader] Error loading ${type} ${id}:`, error);
			return null;
		}
	}

	/**
	 * Load relationships for an element
	 */
	private async loadElementRelationships(elementId: string): Promise<EntityRelationships> {
		// Get both incoming and outgoing edges
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('*')
			.or(`src_id.eq.${elementId},dst_id.eq.${elementId}`)
			.limit(20);

		if (error) {
			console.error('[OntologyLoader] Failed to load element edges:', error);
			return { edges: [], hierarchy_level: 1 };
		}

		const relationships = (edges || []).map((e) => {
			const isSource = e.src_id === elementId;
			return {
				relation: isSource ? e.rel : `inverse_${e.rel}`,
				target_kind: isSource ? e.dst_kind : e.src_kind,
				target_id: isSource ? e.dst_id : e.src_id,
				target_name: undefined
			};
		});

		return {
			edges: relationships,
			hierarchy_level: 1
		};
	}

	private async assertProjectOwnership(projectId: string): Promise<void> {
		const actorId = this.requireActorId();
		const { data, error } = await this.supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.eq('created_by', actorId)
			.maybeSingle();

		if (error) {
			throw error;
		}

		if (!data) {
			throw new Error('Project not found or access denied');
		}
	}

	private async assertEntityOwnership(entityId: string): Promise<void> {
		const actorId = this.requireActorId();

		const { data: project, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('id')
			.eq('id', entityId)
			.eq('created_by', actorId)
			.maybeSingle();

		if (projectError) {
			throw projectError;
		}
		if (project) {
			return;
		}

		const tables = [
			'onto_tasks',
			'onto_plans',
			'onto_goals',
			'onto_documents',
			'onto_milestones',
			'onto_risks',
			'onto_requirements'
		];

		for (const table of tables) {
			const { data, error } = await this.supabase
				.from(table as any)
				.select('project_id, created_by')
				.eq('id', entityId)
				.maybeSingle();

			if (error) {
				throw error;
			}

			if (!data) {
				continue;
			}

			if ((data as any).created_by && (data as any).created_by !== actorId) {
				throw new Error('Entity not found or access denied');
			}

			if ((data as any).created_by === actorId) {
				return;
			}

			if ((data as any).project_id) {
				await this.assertProjectOwnership((data as any).project_id);
				return;
			}
		}

		throw new Error('Entity not found or access denied');
	}

	/**
	 * Find parent project for an element
	 */
	private async findParentProject(
		elementId: string
	): Promise<Database['public']['Tables']['onto_projects']['Row'] | null> {
		try {
			// Direct check - is there a project->element edge?
			const { data: directEdge, error: edgeError } = await this.supabase
				.from('onto_edges')
				.select('src_id, src_kind')
				.eq('dst_id', elementId)
				.eq('src_kind', 'project')
				.single();

			if (!edgeError && directEdge) {
				const { data: project, error: projectError } = await this.supabase
					.from('onto_projects')
					.select('*')
					.eq('id', directEdge.src_id)
					.single();

				if (!projectError && project) {
					return project;
				}
			}

			// Traverse up through intermediate nodes (max 3 levels)
			return this.traverseToProject(elementId, 3);
		} catch (error) {
			console.error('[OntologyLoader] Error finding parent project:', error);
			return null;
		}
	}

	/**
	 * Traverse up the hierarchy to find a project
	 * Optimized to avoid N+1 queries
	 */
	private async traverseToProject(
		elementId: string,
		maxDepth: number
	): Promise<Database['public']['Tables']['onto_projects']['Row'] | null> {
		if (maxDepth <= 0) return null;

		const visited = new Set<string>();
		let currentLevelIds = [elementId];

		// Breadth-first search to avoid deep recursion
		for (let depth = 0; depth < maxDepth && currentLevelIds.length > 0; depth++) {
			try {
				// Batch load all edges for current level
				const { data: edges, error } = await this.supabase
					.from('onto_edges')
					.select('src_id, src_kind, dst_id')
					.in('dst_id', currentLevelIds);

				if (error) {
					console.error('[OntologyLoader] Error traversing to project:', error);
					return null;
				}

				const nextLevelIds: string[] = [];
				const projectIds: string[] = [];

				for (const edge of edges || []) {
					// Skip if we've already visited this node (avoid cycles)
					if (visited.has(edge.src_id)) continue;
					visited.add(edge.src_id);

					if (edge.src_kind === 'project') {
						projectIds.push(edge.src_id);
					} else {
						nextLevelIds.push(edge.src_id);
					}
				}

				// If we found any projects, load and return the first one
				const firstProjectId = projectIds[0];
				if (firstProjectId) {
					const { data: project, error: projectError } = await this.supabase
						.from('onto_projects')
						.select('*')
						.eq('id', firstProjectId)
						.single();

					if (!projectError && project) {
						return project;
					}
				}

				currentLevelIds = nextLevelIds;
			} catch (error) {
				console.error('[OntologyLoader] Error in traverseToProject:', error);
				return null;
			}
		}

		return null;
	}

	/**
	 * Get global entity counts
	 */
	private async getGlobalEntityCounts(): Promise<Record<string, number>> {
		const actorId = this.requireActorId();
		const counts: Record<string, number> = {};

		const tableMappings: Array<{ table: keyof Database['public']['Tables']; key: string }> = [
			{ table: 'onto_projects', key: 'project' },
			{ table: 'onto_tasks', key: 'task' },
			{ table: 'onto_goals', key: 'goal' },
			{ table: 'onto_plans', key: 'plan' },
			{ table: 'onto_documents', key: 'document' },
			{ table: 'onto_milestones', key: 'milestone' },
			{ table: 'onto_risks', key: 'risk' },
			{ table: 'onto_requirements', key: 'requirement' }
		];

		for (const { table, key } of tableMappings) {
			try {
				// Use type assertion to work around complex Supabase type inference
				const { count } = await (this.supabase.from(table) as any)
					.select('*', { count: 'exact', head: true })
					.eq('created_by', actorId);
				counts[key] = count || 0;
			} catch (error) {
				console.error('[OntologyLoader] Failed to count entities', { table, error });
			}
		}

		return counts;
	}

	/**
	 * Get hierarchy level for an element
	 */
	private async getHierarchyLevel(elementId: string, currentLevel: number = 0): Promise<number> {
		if (currentLevel > 5) return currentLevel; // Max depth

		const { data: edge } = await this.supabase
			.from('onto_edges')
			.select('src_id, src_kind')
			.eq('dst_id', elementId)
			.single();

		if (!edge) return currentLevel;
		if (edge.src_kind === 'project') return currentLevel + 1;

		return this.getHierarchyLevel(edge.src_id, currentLevel + 1);
	}

	private asContextEntityMap(entities: OntologyContext['entities']): ContextEntityMap {
		return entities as ContextEntityMap;
	}

	private getEntityDisplayName(
		entity: OntologyEntityRow | null | undefined,
		type: OntologyEntityType
	): string | undefined {
		if (!entity) {
			return undefined;
		}

		if ('name' in entity && typeof entity.name === 'string' && entity.name) {
			return entity.name;
		}

		if ('title' in entity && typeof entity.title === 'string' && entity.title) {
			return entity.title;
		}

		if ('summary' in entity && typeof entity.summary === 'string' && entity.summary) {
			return entity.summary;
		}

		if ('text' in entity && typeof entity.text === 'string' && entity.text) {
			return entity.text;
		}

		if (
			'display_name' in entity &&
			typeof entity.display_name === 'string' &&
			entity.display_name
		) {
			return entity.display_name;
		}

		if ('id' in entity && typeof entity.id === 'string' && entity.id) {
			return `${type}:${entity.id}`;
		}

		return undefined;
	}
}
