// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts
/**
 * Ontology Read Executor
 *
 * Handles all read-only ontology operations:
 * - list_onto_* (projects, tasks, goals, plans, documents, milestones, risks)
 * - search_onto_* (projects, tasks, goals, plans, documents, milestones, risks)
 * - search_ontology (cross-entity search)
 * - get_onto_*_details (project, task, goal, plan, document, milestone, risk)
 * - list_task_documents
 */

import { BaseExecutor } from './base-executor';
import { buildSearchFilter } from '$lib/utils/api-helpers';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';
import type {
	ExecutorContext,
	ListOntoProjectsArgs,
	SearchOntoProjectsArgs,
	SearchAllProjectsArgs,
	ListOntoTasksArgs,
	SearchProjectArgs,
	SearchOntoTasksArgs,
	ListOntoGoalsArgs,
	ListOntoPlansArgs,
	ListOntoDocumentsArgs,
	ListOntoMilestonesArgs,
	ListOntoRisksArgs,
	SearchOntoGoalsArgs,
	SearchOntoPlansArgs,
	SearchOntoMilestonesArgs,
	SearchOntoRisksArgs,
	SearchOntoDocumentsArgs,
	SearchOntologyArgs,
	GetOntoProjectDetailsArgs,
	GetOntoProjectGraphArgs,
	GetOntoTaskDetailsArgs,
	GetOntoGoalDetailsArgs,
	GetOntoPlanDetailsArgs,
	GetOntoDocumentDetailsArgs,
	GetOntoMilestoneDetailsArgs,
	GetOntoRiskDetailsArgs,
	ListTaskDocumentsArgs,
	GetDocumentTreeArgs,
	GetDocumentPathArgs
} from './types';

/**
 * Executor for ontology read operations.
 *
 * All methods return structured data with a message field for LLM consumption.
 */
export class OntologyReadExecutor extends BaseExecutor {
	private static readonly AGENTIC_SEARCH_TYPES = new Set([
		'project',
		'task',
		'goal',
		'plan',
		'milestone',
		'document',
		'risk',
		'requirement',
		'image'
	]);

	constructor(context: ExecutorContext) {
		super(context);
	}

	private async scopeEntityQueryToReadableProject(
		query: any,
		projectId?: string | null
	): Promise<any> {
		const normalizedProjectId =
			typeof projectId === 'string' && projectId.trim().length > 0 ? projectId.trim() : null;

		if (normalizedProjectId) {
			await this.assertProjectAccess(normalizedProjectId, 'read');
			return query.eq('project_id', normalizedProjectId);
		}

		const actorId = await this.getActorId();
		return query.eq('created_by', actorId);
	}

	private static readonly MAX_MARKDOWN_HEADERS = 40;
	private static readonly MAX_HEADING_TEXT_LENGTH = 140;

	private resolveSearchTerm(args: { query?: string; search?: string }): string {
		return this.prepareSearchTerm(args.query ?? args.search);
	}

	private expandBooleanSearchTerms(term: string): string[] {
		const normalized = term.trim();
		if (!normalized) return [];

		const hasExplicitOr = /\s+\bOR\b\s+/i.test(normalized) || normalized.includes('|');
		if (!hasExplicitOr) {
			return [normalized];
		}

		return Array.from(
			new Set(
				normalized
					.split(/\s+\bOR\b\s+|\s*\|\s*/i)
					.map((part) => this.prepareSearchTerm(part))
					.filter(Boolean)
			)
		).slice(0, 12);
	}

	private buildMultiTermSearchFilter(term: string, fields: string[]): string | null {
		const filters = this.expandBooleanSearchTerms(term)
			.map((part) => buildSearchFilter(part, fields))
			.filter((filter): filter is string => Boolean(filter));

		return filters.length > 0 ? filters.join(',') : null;
	}

	private normalizeAgenticSearchTypes(types?: string[]): string[] | undefined {
		if (!Array.isArray(types) || types.length === 0) {
			return undefined;
		}

		const normalized = Array.from(
			new Set(
				types
					.map((type) => (typeof type === 'string' ? type.trim().toLowerCase() : ''))
					.filter((type) => OntologyReadExecutor.AGENTIC_SEARCH_TYPES.has(type))
			)
		);

		return normalized.length > 0 ? normalized : undefined;
	}

	private async runAgenticSearch(args: {
		query: string;
		project_id?: string;
		types?: string[];
		limit?: number;
		scope: 'workspace' | 'project';
	}): Promise<{
		query: string;
		search_scope: 'workspace' | 'project';
		project_id: string | null;
		total_returned: number;
		maybe_more: boolean;
		results: any[];
		total: number;
		message: string;
	}> {
		const query = this.prepareSearchTerm(args.query);
		if (!query) {
			throw new Error(
				args.scope === 'project'
					? 'Query is required for search_project'
					: 'Query is required for search_all_projects'
			);
		}

		if (args.scope === 'project' && !args.project_id) {
			throw new Error('project_id is required for search_project');
		}

		const requestedLimit =
			typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
				? args.limit
				: 10;
		const limit = Math.min(requestedLimit, 25);
		const data = await this.apiRequest('/api/onto/search', {
			method: 'POST',
			body: JSON.stringify({
				query,
				project_id: args.project_id,
				types: this.normalizeAgenticSearchTypes(args.types),
				limit
			})
		});

		const results = Array.isArray((data as any)?.results)
			? (data as any).results
			: Array.isArray(data)
				? (data as any[])
				: [];
		const totalReturned =
			typeof (data as any)?.total_returned === 'number'
				? (data as any).total_returned
				: results.length;
		const maybeMore =
			typeof (data as any)?.maybe_more === 'boolean'
				? (data as any).maybe_more
				: results.length >= limit;

		return {
			query: (data as any)?.query ?? query,
			search_scope: (data as any)?.search_scope ?? args.scope,
			project_id: (data as any)?.project_id ?? args.project_id ?? null,
			total_returned: totalReturned,
			maybe_more: maybeMore,
			results,
			total: typeof (data as any)?.total === 'number' ? (data as any).total : totalReturned,
			message:
				(data as any)?.message ??
				`Found ${results.length} BuildOS matches. Use get_onto_*_details to load full records.`
		};
	}

	private summarizeDocumentForList(document: Record<string, any>): Record<string, any> {
		const content = typeof document.content === 'string' ? document.content : '';
		const fallback = typeof document.description === 'string' ? document.description : '';
		const outline = this.extractMarkdownOutline(content || fallback);

		return {
			id: typeof document.id === 'string' ? document.id : null,
			project_id: typeof document.project_id === 'string' ? document.project_id : null,
			title: typeof document.title === 'string' ? document.title : null,
			type_key: typeof document.type_key === 'string' ? document.type_key : null,
			state_key: typeof document.state_key === 'string' ? document.state_key : null,
			description: typeof document.description === 'string' ? document.description : null,
			created_at: typeof document.created_at === 'string' ? document.created_at : null,
			updated_at: typeof document.updated_at === 'string' ? document.updated_at : null,
			content_length: content.length,
			markdown_outline: outline
		};
	}

	private extractMarkdownOutline(markdown: string): {
		counts: { total: number; h1: number; h2: number; h3: number };
		headings: Array<{ level: 1 | 2 | 3; text: string; children: Array<any> }>;
		truncated: boolean;
	} {
		type Heading = { level: 1 | 2 | 3; text: string };
		type HeadingNode = { level: 1 | 2 | 3; text: string; children: HeadingNode[] };

		const headings: Heading[] = [];
		const lines = markdown.split(/\r?\n/);
		let inFence = false;
		let fenceChar = '';
		let fenceLength = 0;

		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index] ?? '';
			const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
			if (fenceMatch) {
				const fence = fenceMatch[1];
				if (!fence) continue;
				const nextFenceChar = fence[0] ?? '';
				const nextFenceLength = fence.length;
				if (!inFence) {
					inFence = true;
					fenceChar = nextFenceChar;
					fenceLength = nextFenceLength;
				} else if (nextFenceChar === fenceChar && nextFenceLength >= fenceLength) {
					inFence = false;
					fenceChar = '';
					fenceLength = 0;
				}
				continue;
			}
			if (inFence) continue;

			const atxMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
			if (atxMatch) {
				const hashes = atxMatch[1];
				const headingText = atxMatch[2];
				if (!hashes || headingText === undefined) continue;
				const level = Math.min(hashes.length, 3) as 1 | 2 | 3;
				const text = this.normalizeHeadingText(headingText);
				if (text) {
					headings.push({ level, text });
					if (headings.length >= OntologyReadExecutor.MAX_MARKDOWN_HEADERS) break;
				}
				continue;
			}

			const nextLine = lines[index + 1] ?? '';
			const setextMatch = nextLine.match(/^\s{0,3}(=+|-+)\s*$/);
			if (!setextMatch) continue;

			const text = this.normalizeHeadingText(line);
			if (!text) continue;
			const setextMarker = setextMatch[1];
			const level = setextMarker?.[0] === '=' ? 1 : 2;
			headings.push({ level: level as 1 | 2 | 3, text });
			if (headings.length >= OntologyReadExecutor.MAX_MARKDOWN_HEADERS) break;
			index += 1;
		}

		const counts = { total: headings.length, h1: 0, h2: 0, h3: 0 };
		const rootNodes: HeadingNode[] = [];
		const stack: HeadingNode[] = [];

		for (const heading of headings) {
			if (heading.level === 1) counts.h1 += 1;
			else if (heading.level === 2) counts.h2 += 1;
			else counts.h3 += 1;

			const node: HeadingNode = {
				level: heading.level,
				text: heading.text,
				children: []
			};

			while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
				stack.pop();
			}

			if (stack.length === 0) {
				rootNodes.push(node);
			} else {
				stack[stack.length - 1]!.children.push(node);
			}
			stack.push(node);
		}

		const truncated = headings.length >= OntologyReadExecutor.MAX_MARKDOWN_HEADERS;
		return {
			counts,
			headings: rootNodes,
			truncated
		};
	}

	private normalizeHeadingText(raw: string): string {
		const trimmed = raw.trim().replace(/\s+/g, ' ');
		if (!trimmed) return '';
		if (trimmed.length <= OntologyReadExecutor.MAX_HEADING_TEXT_LENGTH) {
			return trimmed;
		}
		return `${trimmed.slice(0, OntologyReadExecutor.MAX_HEADING_TEXT_LENGTH - 3)}...`;
	}

	private async loadAccessibleProjectSummaries(): Promise<any[]> {
		const actorId = await this.getActorId();
		const summaries = await fetchProjectSummaries(this.supabase as any, actorId);
		return summaries
			.map((project) => ({
				id: project.id,
				name: project.name,
				description: project.description,
				type_key: project.type_key,
				state_key: project.state_key,
				props: project.props,
				facet_context: project.facet_context,
				facet_scale: project.facet_scale,
				facet_stage: project.facet_stage,
				created_at: project.created_at,
				updated_at: project.updated_at,
				access_role: project.access_role,
				access_level: project.access_level,
				is_shared: project.is_shared,
				task_count: project.task_count,
				goal_count: project.goal_count,
				plan_count: project.plan_count,
				document_count: project.document_count,
				next_step_short: project.next_step_short,
				next_step_long: project.next_step_long,
				next_step_source: project.next_step_source,
				next_step_updated_at: project.next_step_updated_at
			}))
			.sort((a, b) => {
				const aTime = Date.parse(a.updated_at ?? a.created_at ?? '');
				const bTime = Date.parse(b.updated_at ?? b.created_at ?? '');
				return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
			});
	}

	// ============================================
	// LIST OPERATIONS
	// ============================================

	async listOntoProjects(args: ListOntoProjectsArgs): Promise<{
		projects: any[];
		total: number;
		message: string;
	}> {
		let projects = await this.loadAccessibleProjectSummaries();
		const normalizedState = this.normalizeProjectState(args.state_key);
		if (normalizedState) {
			projects = projects.filter((project) => project.state_key === normalizedState);
		}

		if (args.type_key) {
			projects = projects.filter((project) => project.type_key === args.type_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		const limited = projects.slice(0, limit);

		return {
			projects: limited,
			total: projects.length,
			message: `Found ${limited.length} ontology projects. Use get_onto_project_details for full context.`
		};
	}

	async listOntoTasks(args: ListOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
				id,
				project_id,
				title,
				description,
				type_key,
				state_key,
				priority,
				start_at,
				due_at,
				completed_at,
				props,
				project:onto_projects(name)
			`,
				{ count: 'exact' }
			)
			.is('deleted_at', null) // Exclude soft-deleted tasks
			.order('updated_at', { ascending: false });

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		const normalizedState = this.normalizeTaskState(args.state_key);
		if (normalizedState) {
			query = query.eq('state_key', normalizedState);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		const normalized = (data ?? []).map((task: any) => {
			const projectName = Array.isArray(task.project)
				? task.project[0]?.name
				: task.project?.name;
			const { project, ...rest } = task;
			return {
				...rest,
				project_name: projectName ?? null
			};
		});

		return {
			tasks: normalized,
			total: count ?? normalized.length,
			message: `Found ${normalized.length} ontology tasks. Use get_onto_task_details for full information.`
		};
	}

	async listOntoGoals(args: ListOntoGoalsArgs): Promise<{
		goals: any[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('onto_goals')
			.select(
				'id, project_id, name, type_key, description, target_date, state_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null) // Exclude soft-deleted goals
			.order('created_at', { ascending: false });

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			goals: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology goals.`
		};
	}

	async listOntoPlans(args: ListOntoPlansArgs): Promise<{
		plans: any[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('onto_plans')
			.select(
				'id, project_id, name, state_key, type_key, description, props, created_at, updated_at',
				{
					count: 'exact'
				}
			)
			.is('deleted_at', null) // Exclude soft-deleted plans
			.order('updated_at', { ascending: false });

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			plans: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology plans.`
		};
	}

	async listOntoDocuments(args: ListOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('onto_documents')
			.select(
				'id, project_id, title, type_key, state_key, content, description, created_at, updated_at',
				{
					count: 'exact'
				}
			)
			.is('deleted_at', null) // Exclude soft-deleted documents
			.order('updated_at', { ascending: false });

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;
		const documents = (data ?? []).map((document) => this.summarizeDocumentForList(document));

		return {
			documents,
			total: count ?? documents.length,
			message: `Found ${documents.length} ontology documents.`
		};
	}

	async listOntoMilestones(args: ListOntoMilestonesArgs): Promise<{
		milestones: any[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('onto_milestones')
			.select(
				'id, project_id, title, due_at, state_key, description, type_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null)
			.order('due_at', { ascending: true, nullsFirst: true });

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			milestones: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology milestones.`
		};
	}

	async listOntoRisks(args: ListOntoRisksArgs): Promise<{
		risks: any[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('onto_risks')
			.select(
				'id, project_id, title, impact, probability, state_key, content, type_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		if (args.impact) {
			query = query.eq('impact', args.impact);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			risks: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology risks.`
		};
	}

	async listTaskDocuments(args: ListTaskDocumentsArgs): Promise<{
		documents: Array<{ document: any; edge: any }>;
		scratch_pad: { document: any; edge: any } | null;
		message: string;
	}> {
		if (!args.task_id) {
			throw new Error('task_id is required for list_task_documents');
		}

		const data = await this.apiRequest(`/api/onto/tasks/${args.task_id}/documents`, {
			method: 'GET'
		});

		return {
			documents: data.documents ?? [],
			scratch_pad: data.scratch_pad ?? null,
			message: `Found ${data.documents?.length ?? 0} documents linked to this task.`
		};
	}

	// ============================================
	// SEARCH OPERATIONS
	// ============================================

	async searchOntoProjects(args: SearchOntoProjectsArgs): Promise<{
		projects: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_projects');
		}

		const normalizedSearch = searchTerm.toLowerCase();
		let projects = (await this.loadAccessibleProjectSummaries()).filter((project) => {
			const name = typeof project.name === 'string' ? project.name.toLowerCase() : '';
			const description =
				typeof project.description === 'string' ? project.description.toLowerCase() : '';
			return name.includes(normalizedSearch) || description.includes(normalizedSearch);
		});

		if (args.state_key) {
			projects = projects.filter((project) => project.state_key === args.state_key);
		}

		if (args.type_key) {
			projects = projects.filter((project) => project.type_key === args.type_key);
		}

		const limit = Math.min(args.limit ?? 10, 30);
		const limited = projects.slice(0, limit);

		return {
			projects: limited,
			total: projects.length,
			message: `Found ${limited.length} projects matching "${searchTerm}".`
		};
	}

	async searchOntoTasks(args: SearchOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_tasks');
		}

		const searchFilter = this.buildMultiTermSearchFilter(searchTerm, ['title', 'description']);
		if (!searchFilter) {
			throw new Error('Search term is required for search_onto_tasks');
		}

		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
				id,
				project_id,
				title,
				description,
				type_key,
				state_key,
				priority,
				start_at,
				due_at,
				completed_at,
				props,
				project:onto_projects(name)
			`,
				{ count: 'exact' }
			)
			.is('deleted_at', null) // Exclude soft-deleted tasks
			.order('updated_at', { ascending: false })
			.or(searchFilter);

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		const normalizedState = this.normalizeTaskState(args.state_key);
		if (normalizedState) {
			query = query.eq('state_key', normalizedState);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		const normalized = (data ?? []).map((task: any) => {
			const projectName = Array.isArray(task.project)
				? task.project[0]?.name
				: task.project?.name;
			const { project, ...rest } = task;
			return {
				...rest,
				project_name: projectName ?? null
			};
		});

		return {
			tasks: normalized,
			total: count ?? normalized.length,
			message: `Found ${normalized.length} tasks matching "${searchTerm}".`
		};
	}

	async searchOntoGoals(args: SearchOntoGoalsArgs): Promise<{
		goals: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_goals');
		}

		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_goals')
			.select(
				'id, project_id, name, type_key, description, target_date, state_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.or(`name.ilike.${likePattern},description.ilike.${likePattern}`);

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			goals: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} goals matching "${searchTerm}".`
		};
	}

	async searchOntoPlans(args: SearchOntoPlansArgs): Promise<{
		plans: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_plans');
		}

		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_plans')
			.select(
				'id, project_id, name, state_key, type_key, description, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.or(`name.ilike.${likePattern},description.ilike.${likePattern}`);

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			plans: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} plans matching "${searchTerm}".`
		};
	}

	async searchOntoDocuments(args: SearchOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_documents');
		}

		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_documents')
			.select(
				'id, project_id, title, type_key, state_key, content, description, created_at, updated_at',
				{
					count: 'exact'
				}
			)
			.is('deleted_at', null) // Exclude soft-deleted documents
			.order('updated_at', { ascending: false })
			.ilike('title', likePattern);

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;
		const documents = (data ?? []).map((document) => this.summarizeDocumentForList(document));

		return {
			documents,
			total: count ?? documents.length,
			message: `Found ${documents.length} documents matching "${searchTerm}".`
		};
	}

	async searchOntoMilestones(args: SearchOntoMilestonesArgs): Promise<{
		milestones: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_milestones');
		}

		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_milestones')
			.select(
				'id, project_id, title, due_at, state_key, description, type_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null)
			.order('due_at', { ascending: true, nullsFirst: true })
			.or(`title.ilike.${likePattern},description.ilike.${likePattern}`);

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			milestones: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} milestones matching "${searchTerm}".`
		};
	}

	async searchOntoRisks(args: SearchOntoRisksArgs): Promise<{
		risks: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.resolveSearchTerm(args);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_risks');
		}

		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_risks')
			.select(
				'id, project_id, title, impact, probability, state_key, content, type_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.or(`title.ilike.${likePattern},content.ilike.${likePattern}`);

		query = await this.scopeEntityQueryToReadableProject(query, args.project_id);

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		if (args.impact) {
			query = query.eq('impact', args.impact);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			risks: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} risks matching "${searchTerm}".`
		};
	}

	async searchAllProjects(args: SearchAllProjectsArgs): Promise<{
		query: string;
		search_scope: 'workspace' | 'project';
		project_id: string | null;
		total_returned: number;
		maybe_more: boolean;
		results: any[];
		total: number;
		message: string;
	}> {
		return this.runAgenticSearch({
			query: args.query,
			types: args.types,
			limit: args.limit,
			scope: 'workspace'
		});
	}

	async searchProject(args: SearchProjectArgs): Promise<{
		query: string;
		search_scope: 'workspace' | 'project';
		project_id: string | null;
		total_returned: number;
		maybe_more: boolean;
		results: any[];
		total: number;
		message: string;
	}> {
		return this.runAgenticSearch({
			project_id: args.project_id,
			query: args.query,
			types: args.types,
			limit: args.limit,
			scope: 'project'
		});
	}

	async searchOntology(args: SearchOntologyArgs): Promise<{
		query: string;
		search_scope: 'workspace' | 'project';
		project_id: string | null;
		total_returned: number;
		maybe_more: boolean;
		results: any[];
		total: number;
		message: string;
	}> {
		const query = this.prepareSearchTerm(args.query);
		if (!query) {
			throw new Error('Query is required for search_ontology');
		}

		const requestedLimit =
			typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
				? args.limit
				: 50;
		const limit = Math.min(requestedLimit, 50);
		const data = await this.apiRequest('/api/onto/search', {
			method: 'POST',
			body: JSON.stringify({
				query,
				project_id: args.project_id,
				types: this.normalizeAgenticSearchTypes(args.types),
				limit
			})
		});

		const results = Array.isArray((data as any)?.results)
			? (data as any).results
			: Array.isArray(data)
				? (data as any[])
				: [];
		const totalReturned =
			typeof (data as any)?.total_returned === 'number'
				? (data as any).total_returned
				: results.length;

		return {
			query: (data as any)?.query ?? query,
			search_scope:
				(data as any)?.search_scope ?? (args.project_id ? 'project' : 'workspace'),
			project_id: (data as any)?.project_id ?? args.project_id ?? null,
			total_returned: totalReturned,
			maybe_more:
				typeof (data as any)?.maybe_more === 'boolean'
					? (data as any).maybe_more
					: results.length >= limit,
			results,
			total: typeof (data as any)?.total === 'number' ? (data as any).total : totalReturned,
			message:
				(data as any)?.message ??
				`Found ${results.length} ontology matches. Use get_onto_*_details to load full records.`
		};
	}

	// ============================================
	// GET DETAILS OPERATIONS
	// ============================================

	async getOntoProjectDetails(args: GetOntoProjectDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/projects/${args.project_id}`);
		if (!details?.project) {
			throw new Error('Ontology project not found');
		}

		return {
			...details,
			message: 'Complete ontology project details loaded.'
		};
	}

	async getOntoProjectGraph(args: GetOntoProjectGraphArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/projects/${args.project_id}/graph/full`);
		if (!details?.graph) {
			throw new Error('Ontology project graph not found');
		}

		return {
			...details,
			message: 'Complete ontology project graph loaded.'
		};
	}

	async getOntoTaskDetails(args: GetOntoTaskDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/tasks/${args.task_id}`);
		if (!details?.task) {
			throw new Error('Ontology task not found');
		}

		return {
			...details,
			message: 'Complete ontology task details loaded.'
		};
	}

	async getOntoGoalDetails(args: GetOntoGoalDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/goals/${args.goal_id}`);
		if (!details?.goal) {
			throw new Error('Ontology goal not found');
		}

		return {
			...details,
			message: 'Complete ontology goal details loaded.'
		};
	}

	async getOntoPlanDetails(args: GetOntoPlanDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/plans/${args.plan_id}`);
		if (!details?.plan) {
			throw new Error('Ontology plan not found');
		}

		return {
			...details,
			message: 'Complete ontology plan details loaded.'
		};
	}

	async getOntoDocumentDetails(args: GetOntoDocumentDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/documents/${args.document_id}`);
		if (!details?.document) {
			throw new Error('Ontology document not found');
		}

		return {
			...details,
			message: 'Complete ontology document details loaded.'
		};
	}

	async getOntoMilestoneDetails(args: GetOntoMilestoneDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/milestones/${args.milestone_id}`);
		if (!details?.milestone) {
			throw new Error('Ontology milestone not found');
		}

		return {
			...details,
			message: 'Complete ontology milestone details loaded.'
		};
	}

	async getOntoRiskDetails(args: GetOntoRiskDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/risks/${args.risk_id}`);
		if (!details?.risk) {
			throw new Error('Ontology risk not found');
		}

		return {
			...details,
			message: 'Complete ontology risk details loaded.'
		};
	}

	// ============================================
	// DOCUMENT TREE OPERATIONS
	// ============================================

	async getDocumentTree(args: GetDocumentTreeArgs): Promise<{
		structure: any;
		documents: Record<string, any>;
		unlinked: string[];
		message: string;
	}> {
		if (!args.project_id) {
			throw new Error('project_id is required for get_document_tree');
		}

		await this.assertProjectAccess(args.project_id, 'read');

		const includeDocuments = args.include_documents === true;
		const includeContent = includeDocuments && args.include_content === true;
		const query = `?include_documents=${includeDocuments ? 'true' : 'false'}&include_content=${
			includeContent ? 'true' : 'false'
		}`;
		const data = await this.apiRequest(
			`/api/onto/projects/${args.project_id}/doc-tree${query}`,
			{
				method: 'GET'
			}
		);

		const countNodes = (nodes: any[]): number => {
			let count = 0;
			for (const node of nodes || []) {
				if (!node || typeof node !== 'object') continue;
				if (typeof node.id !== 'string') continue;
				count += 1;
				if (Array.isArray(node.children) && node.children.length > 0) {
					count += countNodes(node.children);
				}
			}
			return count;
		};

		const docCount = countNodes(data.structure?.root || []);
		const unlinkedCount = includeDocuments ? (data.unlinked || []).length : null;
		const unlinkedMessage = includeDocuments
			? unlinkedCount > 0
				? `${unlinkedCount} documents are not in the tree structure.`
				: 'All documents are organized in the tree.'
			: 'Unlinked documents not included (set include_documents=true to list them).';

		return {
			structure: data.structure,
			documents: data.documents || {},
			unlinked: data.unlinked || [],
			message: `Document tree loaded with ${docCount} nodes. ${unlinkedMessage}`
		};
	}

	async getDocumentPath(args: GetDocumentPathArgs): Promise<{
		path: Array<{ id: string; title: string }>;
		document_id: string;
		project_id: string;
		message: string;
	}> {
		if (!args.document_id) {
			throw new Error('document_id is required for get_document_path');
		}

		let projectId = args.project_id;
		let fallbackTitle: string | undefined;

		if (!projectId) {
			// First get the document to find its project_id
			const docDetails = await this.apiRequest(`/api/onto/documents/${args.document_id}`);
			if (!docDetails?.document) {
				throw new Error('Document not found');
			}
			projectId = docDetails.document.project_id;
			fallbackTitle = docDetails.document.title ?? undefined;
		}

		if (!projectId) {
			throw new Error('Document has no project association');
		}

		await this.assertProjectAccess(projectId, 'read');

		// Get the document tree (structure-only)
		const treeData = await this.apiRequest(
			`/api/onto/projects/${projectId}/doc-tree?include_documents=false`,
			{
				method: 'GET'
			}
		);

		// Build path from tree structure
		const path: Array<{ id: string; title: string }> = [];
		const resolvedTitle = fallbackTitle || 'Untitled';

		function findPath(
			nodes: any[],
			targetId: string,
			currentPath: Array<{ id: string; title: string }>
		): boolean {
			for (const node of nodes) {
				const nodeTitle =
					typeof node?.title === 'string' && node.title.trim().length > 0
						? node.title
						: 'Untitled';
				const nodeInfo = { id: node.id, title: nodeTitle };

				if (node.id === targetId) {
					path.push(...currentPath, nodeInfo);
					return true;
				}

				if (node.children && node.children.length > 0) {
					if (findPath(node.children, targetId, [...currentPath, nodeInfo])) {
						return true;
					}
				}
			}
			return false;
		}

		const found = findPath(treeData.structure?.root || [], args.document_id, []);

		const pathStr = path.length > 0 ? path.map((p) => p.title).join(' > ') : 'Root level';
		let message = `Document path: ${pathStr}`;
		if (!found && fallbackTitle) {
			message = `Document "${resolvedTitle}" is not placed in the tree (unlinked).`;
		} else if (!found) {
			message = `Document "${resolvedTitle}" not found in project ${projectId}.`;
		}

		return {
			path,
			document_id: args.document_id,
			project_id: projectId,
			message
		};
	}
}
