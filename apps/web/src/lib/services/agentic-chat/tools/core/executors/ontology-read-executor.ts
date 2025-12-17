// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts
/**
 * Ontology Read Executor
 *
 * Handles all read-only ontology operations:
 * - list_onto_* (projects, tasks, goals, plans, documents)
 * - search_onto_* (projects, tasks, documents)
 * - search_ontology (cross-entity search)
 * - get_onto_*_details (project, task, goal, plan, document)
 * - list_task_documents
 */

import { BaseExecutor } from './base-executor';
import type {
	ExecutorContext,
	ListOntoProjectsArgs,
	SearchOntoProjectsArgs,
	ListOntoTasksArgs,
	SearchOntoTasksArgs,
	ListOntoGoalsArgs,
	ListOntoPlansArgs,
	ListOntoDocumentsArgs,
	SearchOntoDocumentsArgs,
	SearchOntologyArgs,
	GetOntoProjectDetailsArgs,
	GetOntoTaskDetailsArgs,
	GetOntoGoalDetailsArgs,
	GetOntoPlanDetailsArgs,
	GetOntoDocumentDetailsArgs,
	ListTaskDocumentsArgs
} from './types';

/**
 * Executor for ontology read operations.
 *
 * All methods return structured data with a message field for LLM consumption.
 */
export class OntologyReadExecutor extends BaseExecutor {
	constructor(context: ExecutorContext) {
		super(context);
	}

	// ============================================
	// LIST OPERATIONS
	// ============================================

	async listOntoProjects(args: ListOntoProjectsArgs): Promise<{
		projects: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_projects')
			.select(
				`
				id,
				name,
				description,
				type_key,
				state_key,
				props,
				facet_context,
				facet_scale,
				facet_stage,
				created_at,
				updated_at
			`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			projects: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology projects. Use get_onto_project_details for full context.`
		};
	}

	async listOntoTasks(args: ListOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
				id,
				project_id,
				title,
				type_key,
				state_key,
				priority,
				due_at,
				props,
				project:onto_projects(name)
			`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
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
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_goals')
			.select('id, project_id, name, type_key, props, created_at', { count: 'exact' })
			.eq('created_by', actorId)
			.order('created_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_plans')
			.select('id, project_id, name, state_key, type_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_documents')
			.select('id, project_id, title, type_key, state_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

		return {
			documents: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology documents.`
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
		const searchTerm = this.prepareSearchTerm(args.search);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_projects');
		}

		const actorId = await this.getActorId();
		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_projects')
			.select(
				`
				id,
				name,
				description,
				type_key,
				state_key,
				facet_context,
				facet_scale,
				facet_stage,
				created_at,
				updated_at
			`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false })
			.or(`name.ilike.${likePattern},description.ilike.${likePattern}`);

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
		}

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		const limit = Math.min(args.limit ?? 10, 30);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			projects: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} projects matching "${args.search}".`
		};
	}

	async searchOntoTasks(args: SearchOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.prepareSearchTerm(args.search);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_tasks');
		}

		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_tasks')
			.select(
				`
				id,
				project_id,
				title,
				type_key,
				state_key,
				priority,
				due_at,
				props,
				project:onto_projects(name)
			`,
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false })
			.ilike('title', `%${searchTerm}%`);

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		if (args.state_key) {
			query = query.eq('state_key', args.state_key);
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
			message: `Found ${normalized.length} tasks matching "${args.search}".`
		};
	}

	async searchOntoDocuments(args: SearchOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		const searchTerm = this.prepareSearchTerm(args.search);
		if (!searchTerm) {
			throw new Error('Search term is required for search_onto_documents');
		}

		const actorId = await this.getActorId();
		const likePattern = `%${searchTerm}%`;

		let query = this.supabase
			.from('onto_documents')
			.select('id, project_id, title, type_key, state_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.order('updated_at', { ascending: false })
			.ilike('title', likePattern);

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

		return {
			documents: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} documents matching "${args.search}".`
		};
	}

	async searchOntology(args: SearchOntologyArgs): Promise<{
		results: any[];
		total: number;
		message: string;
	}> {
		const query = this.prepareSearchTerm(args.query);
		if (!query) {
			throw new Error('Query is required for search_ontology');
		}

		const limit = Math.min(args.limit ?? 50, 50);

		const data = await this.apiRequest('/api/onto/search', {
			method: 'POST',
			body: JSON.stringify({
				query,
				project_id: args.project_id,
				types: args.types,
				limit
			})
		});

		const results = Array.isArray((data as any)?.results)
			? (data as any).results
			: Array.isArray(data)
				? (data as any[])
				: [];

		const total = (data as any)?.total ?? results.length ?? 0;

		return {
			results,
			total,
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
}
