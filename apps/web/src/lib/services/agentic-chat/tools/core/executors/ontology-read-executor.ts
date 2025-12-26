// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts
/**
 * Ontology Read Executor
 *
 * Handles all read-only ontology operations:
 * - list_onto_* (projects, tasks, goals, plans, documents, outputs, milestones, risks, decisions, requirements)
 * - search_onto_* (projects, tasks, documents)
 * - search_ontology (cross-entity search)
 * - get_onto_*_details (project, task, goal, plan, document, output, milestone, risk, decision, requirement)
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
	ListOntoOutputsArgs,
	ListOntoMilestonesArgs,
	ListOntoRisksArgs,
	ListOntoDecisionsArgs,
	ListOntoRequirementsArgs,
	SearchOntoDocumentsArgs,
	SearchOntologyArgs,
	GetOntoProjectDetailsArgs,
	GetOntoTaskDetailsArgs,
	GetOntoGoalDetailsArgs,
	GetOntoPlanDetailsArgs,
	GetOntoDocumentDetailsArgs,
	GetOntoOutputDetailsArgs,
	GetOntoMilestoneDetailsArgs,
	GetOntoRiskDetailsArgs,
	GetOntoDecisionDetailsArgs,
	GetOntoRequirementDetailsArgs,
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

		const normalizedState = this.normalizeProjectState(args.state_key);
		if (normalizedState) {
			query = query.eq('state_key', normalizedState);
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
			.eq('created_by', actorId)
			.is('deleted_at', null) // Exclude soft-deleted tasks
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_goals')
			.select(
				'id, project_id, name, type_key, description, target_date, state_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.is('deleted_at', null) // Exclude soft-deleted goals
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
			.select(
				'id, project_id, name, state_key, type_key, description, props, created_at, updated_at',
				{
					count: 'exact'
				}
			)
			.eq('created_by', actorId)
			.is('deleted_at', null) // Exclude soft-deleted plans
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
			.select(
				'id, project_id, title, type_key, state_key, content, description, props, created_at, updated_at',
				{
					count: 'exact'
				}
			)
			.eq('created_by', actorId)
			.is('deleted_at', null) // Exclude soft-deleted documents
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		const normalizedState = this.normalizeTaskState(args.state_key);
		if (normalizedState) {
			query = query.eq('state_key', normalizedState);
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

	async listOntoOutputs(args: ListOntoOutputsArgs): Promise<{
		outputs: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_outputs')
			.select(
				'id, project_id, name, type_key, state_key, description, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.is('deleted_at', null)
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

		return {
			outputs: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology outputs.`
		};
	}

	async listOntoMilestones(args: ListOntoMilestonesArgs): Promise<{
		milestones: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_milestones')
			.select(
				'id, project_id, title, due_at, state_key, description, type_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.order('due_at', { ascending: true, nullsFirst: true });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		const normalizedState = this.normalizeProjectState(args.state_key);
		if (normalizedState) {
			query = query.eq('state_key', normalizedState);
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
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_risks')
			.select(
				'id, project_id, title, impact, probability, state_key, content, type_key, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

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

	async listOntoDecisions(args: ListOntoDecisionsArgs): Promise<{
		decisions: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_decisions')
			.select(
				'id, project_id, title, decision_at, rationale, props, created_at, updated_at',
				{ count: 'exact' }
			)
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.order('decision_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			decisions: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology decisions.`
		};
	}

	async listOntoRequirements(args: ListOntoRequirementsArgs): Promise<{
		requirements: any[];
		total: number;
		message: string;
	}> {
		const actorId = await this.getActorId();
		let query = this.supabase
			.from('onto_requirements')
			.select('id, project_id, text, priority, type_key, props, created_at, updated_at', {
				count: 'exact'
			})
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });

		if (args.project_id) {
			await this.assertProjectOwnership(args.project_id, actorId);
			query = query.eq('project_id', args.project_id);
		}

		if (args.type_key) {
			query = query.eq('type_key', args.type_key);
		}

		const limit = Math.min(args.limit ?? 20, 50);
		query = query.limit(limit);

		const { data, count, error } = await query;
		if (error) throw error;

		return {
			requirements: data ?? [],
			total: count ?? data?.length ?? 0,
			message: `Found ${data?.length ?? 0} ontology requirements.`
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
			.eq('created_by', actorId)
			.is('deleted_at', null) // Exclude soft-deleted tasks
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
			.select(
				'id, project_id, title, type_key, state_key, content, description, props, created_at, updated_at',
				{
					count: 'exact'
				}
			)
			.eq('created_by', actorId)
			.is('deleted_at', null) // Exclude soft-deleted documents
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

	async getOntoOutputDetails(args: GetOntoOutputDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/outputs/${args.output_id}`);
		if (!details?.output) {
			throw new Error('Ontology output not found');
		}

		return {
			...details,
			message: 'Complete ontology output details loaded.'
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

	async getOntoDecisionDetails(args: GetOntoDecisionDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/decisions/${args.decision_id}`);
		if (!details?.decision) {
			throw new Error('Ontology decision not found');
		}

		return {
			...details,
			message: 'Complete ontology decision details loaded.'
		};
	}

	async getOntoRequirementDetails(args: GetOntoRequirementDetailsArgs): Promise<any> {
		const details = await this.apiRequest(`/api/onto/requirements/${args.requirement_id}`);
		if (!details?.requirement) {
			throw new Error('Ontology requirement not found');
		}

		return {
			...details,
			message: 'Complete ontology requirement details loaded.'
		};
	}
}
