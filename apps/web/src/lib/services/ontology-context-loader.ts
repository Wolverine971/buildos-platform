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
	ProjectHighlightDecision,
	ProjectHighlightRequirement,
	ProjectHighlightDocument,
	ProjectHighlightMilestone,
	ProjectHighlightPlan,
	ProjectHighlightOutput,
	ProjectHighlightSignal,
	ProjectHighlightInsight,
	ProjectHighlightTask
} from '$lib/types/agent-chat-enhancement';
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
	output: Database['public']['Tables']['onto_outputs']['Row'];
	milestone: Database['public']['Tables']['onto_milestones']['Row'];
	risk: Database['public']['Tables']['onto_risks']['Row'];
	decision: Database['public']['Tables']['onto_decisions']['Row'];
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
					: K extends 'output'
						? 'outputs'
						: K extends 'milestone'
							? 'milestones'
							: K extends 'risk'
								? 'risks'
								: K extends 'decision'
									? 'decisions'
									: 'requirements'}`;
};

type ContextEntityMap = Partial<Record<ElementType, ElementRowMap[ElementType]>> & {
	project?: ProjectRow;
};

type OntologyEntityRow = ProjectRow | ElementRowMap[ElementType];

const PROJECT_HIGHLIGHT_LIMITS = {
	goals: 5,
	risks: 5,
	decisions: 5,
	requirements: 5,
	documents: 5,
	milestones: 5,
	plans: 5,
	outputs: 5,
	signals: 5,
	insights: 5,
	tasksRecent: 10,
	tasksUpcoming: 5
} as const;

const PROJECT_HIGHLIGHT_TRUNCATION = {
	decisionRationale: 180,
	documentDescription: 180,
	requirementText: 160,
	signalPayload: 160
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
		output: 'onto_outputs',
		milestone: 'onto_milestones',
		risk: 'onto_risks',
		decision: 'onto_decisions',
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
			decisions: { items: [] },
			requirements: { items: [] },
			documents: { items: [] },
			milestones: { items: [] },
			plans: { items: [] },
			outputs: { items: [] },
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

	private async loadProjectHighlights(projectId: string): Promise<ProjectHighlights> {
		const actorId = this.requireActorId();
		const empty = this.createEmptyProjectHighlights();

		const { data: edges, error: edgeError } = await this.supabase
			.from('onto_edges')
			.select('src_kind, src_id, dst_kind, dst_id')
			.or(
				`and(src_id.eq.${projectId},src_kind.eq.project),and(dst_id.eq.${projectId},dst_kind.eq.project)`
			);

		if (edgeError) {
			console.error('[OntologyLoader] Failed to load project highlight edges:', edgeError);
			return empty;
		}

		const allowedKinds = new Set([
			'goal',
			'risk',
			'decision',
			'requirement',
			'document',
			'milestone',
			'plan',
			'output',
			'signal',
			'insight',
			'task'
		]);

		const idsByKind: Record<string, Set<string>> = {};
		for (const kind of allowedKinds) {
			idsByKind[kind] = new Set<string>();
		}

		for (const edge of edges || []) {
			let otherKind: string | null = null;
			let otherId: string | null = null;

			if (edge.src_kind === 'project' && edge.src_id === projectId) {
				otherKind = edge.dst_kind;
				otherId = edge.dst_id;
			} else if (edge.dst_kind === 'project' && edge.dst_id === projectId) {
				otherKind = edge.src_kind;
				otherId = edge.src_id;
			}

			if (!otherKind || !otherId) continue;
			if (!allowedKinds.has(otherKind)) continue;

			idsByKind[otherKind].add(otherId);
		}

		const goalIds = [...idsByKind.goal];
		const riskIds = [...idsByKind.risk];
		const decisionIds = [...idsByKind.decision];
		const requirementIds = [...idsByKind.requirement];
		const documentIds = [...idsByKind.document];
		const milestoneIds = [...idsByKind.milestone];
		const planIds = [...idsByKind.plan];
		const outputIds = [...idsByKind.output];
		const signalIds = [...idsByKind.signal];
		const insightIds = [...idsByKind.insight];
		const taskIds = [...idsByKind.task];

		const [
			goalsSection,
			risksSection,
			decisionsSection,
			requirementsSection,
			documentsSection,
			milestonesSection,
			plansSection,
			outputsSection,
			signalsSection,
			insightsSection
		] = await Promise.all([
			(async (): Promise<HighlightSection<ProjectHighlightGoal>> => {
				if (goalIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_goals')
					.select('id, name, goal, created_at, updated_at, target_date', {
						count: 'exact'
					})
					.in('id', goalIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.goals);

				const items: ProjectHighlightGoal[] = (data ?? []).map((goal) => ({
					id: goal.id,
					name: goal.name || goal.goal || 'Untitled goal',
					created_at: goal.created_at,
					updated_at: goal.updated_at,
					target_date: goal.target_date
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightRisk>> => {
				if (riskIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_risks')
					.select('id, title, created_at, updated_at, state_key', { count: 'exact' })
					.in('id', riskIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.not('state_key', 'in', '(mitigated,closed)')
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.risks);

				const items: ProjectHighlightRisk[] = (data ?? []).map((risk) => ({
					id: risk.id,
					title: risk.title,
					created_at: risk.created_at,
					updated_at: risk.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightDecision>> => {
				if (decisionIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_decisions')
					.select('id, title, rationale, decision_at, created_at, updated_at', {
						count: 'exact'
					})
					.in('id', decisionIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('decision_at', { ascending: false })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.decisions);

				const items: ProjectHighlightDecision[] = (data ?? []).map((decision) => ({
					id: decision.id,
					title: decision.title,
					rationale: this.truncateText(
						decision.rationale,
						PROJECT_HIGHLIGHT_TRUNCATION.decisionRationale
					),
					decision_at: decision.decision_at,
					created_at: decision.created_at,
					updated_at: decision.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightRequirement>> => {
				if (requirementIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_requirements')
					.select('id, text, created_at, updated_at', { count: 'exact' })
					.in('id', requirementIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.requirements);

				const items: ProjectHighlightRequirement[] = (data ?? []).map((req) => ({
					id: req.id,
					text:
						this.truncateText(req.text, PROJECT_HIGHLIGHT_TRUNCATION.requirementText) ||
						'',
					created_at: req.created_at,
					updated_at: req.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightDocument>> => {
				if (documentIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_documents')
					.select('id, title, description, created_at, updated_at', { count: 'exact' })
					.in('id', documentIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.documents);

				const items: ProjectHighlightDocument[] = (data ?? []).map((doc) => ({
					id: doc.id,
					title: doc.title,
					description: this.truncateText(
						doc.description,
						PROJECT_HIGHLIGHT_TRUNCATION.documentDescription
					),
					created_at: doc.created_at,
					updated_at: doc.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightMilestone>> => {
				if (milestoneIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_milestones')
					.select('id, title, due_at, created_at, updated_at', { count: 'exact' })
					.in('id', milestoneIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('due_at', { ascending: true })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.milestones);

				const items: ProjectHighlightMilestone[] = (data ?? []).map((milestone) => ({
					id: milestone.id,
					title: milestone.title,
					due_at: milestone.due_at,
					created_at: milestone.created_at,
					updated_at: milestone.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightPlan>> => {
				if (planIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_plans')
					.select('id, name, state_key, created_at, updated_at', { count: 'exact' })
					.in('id', planIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.plans);

				const items: ProjectHighlightPlan[] = (data ?? []).map((plan) => ({
					id: plan.id,
					name: plan.name,
					state_key: plan.state_key,
					created_at: plan.created_at,
					updated_at: plan.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightOutput>> => {
				if (outputIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_outputs')
					.select('id, name, state_key, created_at, updated_at', { count: 'exact' })
					.in('id', outputIds)
					.eq('project_id', projectId)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.outputs);

				const items: ProjectHighlightOutput[] = (data ?? []).map((output) => ({
					id: output.id,
					name: output.name,
					state_key: output.state_key,
					created_at: output.created_at,
					updated_at: output.updated_at
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightSignal>> => {
				if (signalIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_signals')
					.select('id, channel, ts, created_at, payload', { count: 'exact' })
					.in('id', signalIds)
					.eq('project_id', projectId)
					.order('ts', { ascending: false })
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.signals);

				const items: ProjectHighlightSignal[] = (data ?? []).map((signal) => ({
					id: signal.id,
					channel: signal.channel,
					ts: signal.ts,
					created_at: signal.created_at,
					payload_summary: this.formatPayloadSummary(signal.payload)
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})(),
			(async (): Promise<HighlightSection<ProjectHighlightInsight>> => {
				if (insightIds.length === 0) return { items: [] };
				const { data, count } = await this.supabase
					.from('onto_insights')
					.select('id, title, created_at, derived_from_signal_id', { count: 'exact' })
					.in('id', insightIds)
					.eq('project_id', projectId)
					.order('created_at', { ascending: false })
					.limit(PROJECT_HIGHLIGHT_LIMITS.insights);

				const items: ProjectHighlightInsight[] = (data ?? []).map((insight) => ({
					id: insight.id,
					title: insight.title,
					created_at: insight.created_at,
					derived_from_signal_id: insight.derived_from_signal_id
				}));
				return this.buildHighlightSection(items, count ?? items.length);
			})()
		]);

		const now = new Date();
		const recentSince = new Date(now);
		recentSince.setDate(now.getDate() - 7);
		const upcomingUntil = new Date(now);
		upcomingUntil.setDate(now.getDate() + 7);

		let recentTasks: ProjectHighlightTask[] = [];
		let recentMore = 0;
		if (taskIds.length > 0) {
			const { data, count } = await this.supabase
				.from('onto_tasks')
				.select('id, title, updated_at, start_at, due_at', { count: 'exact' })
				.in('id', taskIds)
				.eq('project_id', projectId)
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.not('state_key', 'in', '(done,blocked)')
				.gte('updated_at', recentSince.toISOString())
				.order('updated_at', { ascending: false })
				.limit(PROJECT_HIGHLIGHT_LIMITS.tasksRecent);

			recentTasks = (data ?? []).map((task) => ({
				id: task.id,
				title: task.title,
				updated_at: task.updated_at,
				start_at: task.start_at,
				due_at: task.due_at
			}));
			recentMore =
				typeof count === 'number' && count > recentTasks.length
					? count - recentTasks.length
					: 0;
		}

		let upcomingTasks: ProjectHighlightTask[] = [];
		let upcomingMore = 0;
		if (taskIds.length > 0) {
			const recentIds = new Set(recentTasks.map((task) => task.id));
			let upcomingQuery = this.supabase
				.from('onto_tasks')
				.select('id, title, updated_at, start_at, due_at', { count: 'exact' })
				.in('id', taskIds)
				.eq('project_id', projectId)
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.not('state_key', 'in', '(done,blocked)')
				.or(
					`and(due_at.gte.${now.toISOString()},due_at.lte.${upcomingUntil.toISOString()}),and(start_at.gte.${now.toISOString()},start_at.lte.${upcomingUntil.toISOString()})`
				)
				.order('due_at', { ascending: true })
				.order('start_at', { ascending: true })
				.order('updated_at', { ascending: false })
				.limit(PROJECT_HIGHLIGHT_LIMITS.tasksUpcoming);

			if (recentIds.size > 0) {
				const excluded = [...recentIds].map((id) => `"${id}"`).join(',');
				upcomingQuery = upcomingQuery.not('id', 'in', `(${excluded})`);
			}

			const { data, count } = await upcomingQuery;
			upcomingTasks = (data ?? [])
				.filter((task) => !recentIds.has(task.id))
				.map((task) => ({
					id: task.id,
					title: task.title,
					updated_at: task.updated_at,
					start_at: task.start_at,
					due_at: task.due_at
				}));

			upcomingMore =
				typeof count === 'number' && count > upcomingTasks.length
					? count - upcomingTasks.length
					: 0;
		}

		return {
			goals: goalsSection,
			risks: risksSection,
			decisions: decisionsSection,
			requirements: requirementsSection,
			documents: documentsSection,
			milestones: milestonesSection,
			plans: plansSection,
			outputs: outputsSection,
			signals: signalsSection,
			insights: insightsSection,
			tasks: {
				recent:
					recentMore > 0
						? { items: recentTasks, more: recentMore }
						: { items: recentTasks },
				upcoming:
					upcomingMore > 0
						? { items: upcomingTasks, more: upcomingMore }
						: { items: upcomingTasks }
			}
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
			.select('*')
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
					'output',
					'milestone',
					'risk',
					'decision',
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
		const actorId = this.requireActorId();
		console.log('[OntologyLoader] Loading project context for:', projectId);

		// Check cache first
		const cacheKey = `project:${projectId}`;
		const cached = this.getCached<OntologyContext>(cacheKey);
		if (cached) {
			console.log('[OntologyLoader] Using cached project context');
			return cached;
		}

		// Load project with props
		const { data: project, error } = await this.supabase
			.from('onto_projects')
			.select('*')
			.eq('id', projectId)
			.eq('created_by', actorId)
			.single();

		if (error || !project) {
			console.error('[OntologyLoader] Failed to load project:', error);
			throw new Error(`Project ${projectId} not found or access denied`);
		}

		// Extract facets from props
		const props = (project.props as any) || {};
		const facets = props.facets || null;

		// Query context document via edge relationship
		const { data: contextEdge } = await this.supabase
			.from('onto_edges')
			.select('dst_id')
			.eq('src_kind', 'project')
			.eq('src_id', projectId)
			.eq('rel', 'has_context_document')
			.eq('dst_kind', 'document')
			.limit(1)
			.maybeSingle();

		const contextDocumentId = contextEdge?.dst_id || null;

		// Load relationships
		const relationships = await this.loadProjectRelationships(projectId);

		// Get entity counts
		const entityCounts = await this.getProjectEntityCounts(projectId);
		const projectHighlights = await this.loadProjectHighlights(projectId);

		const context: OntologyContext = {
			type: 'project',
			entities: {
				project
			},
			relationships,
			metadata: {
				entity_count: entityCounts,
				context_document_id: contextDocumentId ?? undefined,
				facets: facets,
				last_updated: new Date().toISOString(),
				project_highlights: projectHighlights
			},
			scope: {
				projectId: project.id,
				projectName: project.name
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
		elementId: string
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

		// Load element relationships
		const relationships = await this.loadElementRelationships(elementId);

		const entities: OntologyContext['entities'] = {};
		const singularEntities = this.asContextEntityMap(entities);
		singularEntities[elementType] = element;

		if (parentProject) {
			singularEntities.project = parentProject;
		}

		return {
			type: 'element',
			entities,
			relationships,
			metadata: {
				hierarchy_level: await this.getHierarchyLevel(elementId),
				last_updated: new Date().toISOString()
			},
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
		elementType:
			| 'task'
			| 'goal'
			| 'plan'
			| 'document'
			| 'output'
			| 'milestone'
			| 'risk'
			| 'decision'
			| 'requirement',
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
			this.loadElementContext(elementType, elementId)
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
			output: [],
			risk: [],
			decision: [],
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
			outputs: [],
			risks: [],
			decisions: [],
			requirements: []
		};

		const counts: EntityLinkedContext['counts'] = {
			plans: edgesByKind.plan.length,
			goals: edgesByKind.goal.length,
			tasks: edgesByKind.task.length,
			milestones: edgesByKind.milestone.length,
			documents: edgesByKind.document.length,
			outputs: edgesByKind.output.length,
			risks: edgesByKind.risk.length,
			decisions: edgesByKind.decision.length,
			requirements: edgesByKind.requirement.length,
			total: 0
		};
		counts.total =
			counts.plans +
			counts.goals +
			counts.tasks +
			counts.milestones +
			counts.documents +
			counts.outputs +
			counts.risks +
			counts.decisions +
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
				kind: 'output',
				table: 'onto_outputs',
				edges: edgesByKind.output,
				targetKey: 'outputs'
			},
			{
				kind: 'risk',
				table: 'onto_risks',
				edges: edgesByKind.risk,
				targetKey: 'risks'
			},
			{
				kind: 'decision',
				table: 'onto_decisions',
				edges: edgesByKind.decision,
				targetKey: 'decisions'
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
				outputs: [],
				risks: [],
				decisions: [],
				requirements: []
			},
			counts: {
				plans: 0,
				goals: 0,
				tasks: 0,
				milestones: 0,
				documents: 0,
				outputs: 0,
				risks: 0,
				decisions: 0,
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
	 * Load relationships for a project
	 */
	private async loadProjectRelationships(projectId: string): Promise<EntityRelationships> {
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('*')
			.eq('src_id', projectId)
			.limit(50); // Limit to prevent overwhelming context

		if (error) {
			console.error('[OntologyLoader] Failed to load edges:', error);
			return { edges: [], hierarchy_level: 0 };
		}

		return {
			edges: (edges || []).map((e) => ({
				relation: e.rel,
				target_kind: e.dst_kind,
				target_id: e.dst_id,
				target_name: undefined // Will be resolved on demand
			})),
			hierarchy_level: 0
		};
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
			'onto_outputs',
			'onto_documents',
			'onto_milestones',
			'onto_risks',
			'onto_decisions',
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
	 * Get entity counts for a project
	 */
	private async getProjectEntityCounts(projectId: string): Promise<Record<string, number>> {
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('dst_kind')
			.eq('src_id', projectId);

		if (error) {
			console.error('[OntologyLoader] Error getting project entity counts:', error);
			return {};
		}

		const counts: Record<string, number> = {};
		(edges || []).forEach((edge) => {
			if (edge.dst_kind) {
				counts[edge.dst_kind] = (counts[edge.dst_kind] || 0) + 1;
			}
		});

		return counts;
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
			{ table: 'onto_outputs', key: 'output' },
			{ table: 'onto_milestones', key: 'milestone' },
			{ table: 'onto_risks', key: 'risk' },
			{ table: 'onto_decisions', key: 'decision' },
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
