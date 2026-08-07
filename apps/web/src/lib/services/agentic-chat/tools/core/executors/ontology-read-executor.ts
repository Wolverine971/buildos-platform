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
 *
 * The 18 direct-Supabase reads live in @buildos/agentic-chat-runtime/tools
 * (Phase 4 Slice 18 S3-T4) as free functions over an injected context; this
 * class delegates to them with its RLS client + web access adapter. The
 * HTTP-hop tools (agentic search, route-backed detail GETs, doc-tree) stay
 * here until their route logic is ported in later tranches.
 */

import { BaseExecutor } from './base-executor';
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
	GetDocumentPathArgs,
	GetDocumentOutlineArgs,
	ReadDocumentSectionArgs
} from './types';
import {
	type AgenticChatSharedReadContextV1,
	applyKeywordSearch as sharedApplyKeywordSearch,
	buildDetailNotFoundPayload as sharedBuildDetailNotFoundPayload,
	stripInternalPayloadFields as sharedStripInternalPayloadFields,
	getDocumentOutline as sharedGetDocumentOutline,
	getOntoDocumentDetails as sharedGetOntoDocumentDetails,
	getOntoProjectDetails as sharedGetOntoProjectDetails,
	listOntoDocuments as sharedListOntoDocuments,
	listOntoGoals as sharedListOntoGoals,
	listOntoMilestones as sharedListOntoMilestones,
	listOntoPlans as sharedListOntoPlans,
	listOntoProjects as sharedListOntoProjects,
	listOntoRisks as sharedListOntoRisks,
	listOntoTasks as sharedListOntoTasks,
	readDocumentSection as sharedReadDocumentSection,
	searchOntoDocuments as sharedSearchOntoDocuments,
	searchOntoGoals as sharedSearchOntoGoals,
	searchOntoMilestones as sharedSearchOntoMilestones,
	searchOntoPlans as sharedSearchOntoPlans,
	searchOntoProjects as sharedSearchOntoProjects,
	searchOntoRisks as sharedSearchOntoRisks,
	searchOntoTasks as sharedSearchOntoTasks
} from '@buildos/agentic-chat-runtime/tools';
import { inferMaterializedToolsFromEntityResults } from '../entity-result-materialization';

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

	/** Context handed to the shared read tools: RLS client + web access port. */
	private readonly sharedReadContext: AgenticChatSharedReadContextV1;

	constructor(context: ExecutorContext) {
		super(context);
		this.sharedReadContext = {
			client: this.supabase as AgenticChatSharedReadContextV1['client'],
			access: this.accessAdapter
		};
	}

	/**
	 * Delegates to the shared keyword-search builder. Kept as a class method so
	 * the postgrest URL-generation test can drive it against a real builder.
	 */
	private applyKeywordSearch<Q>(query: Q, term: string, fields: string[]): Q {
		return sharedApplyKeywordSearch(query, term, fields);
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

	private async getDetailOrNotFound(args: {
		path: string;
		entityType: string;
		idKey: string;
		id: string;
		payloadKey: string;
		searchTool?: string;
		listTool?: string;
	}): Promise<any> {
		let details: any;
		try {
			details = await this.apiRequest(args.path);
		} catch (error) {
			if (this.isApiRequestStatus(error, 404)) {
				return sharedBuildDetailNotFoundPayload(args);
			}
			throw error;
		}

		if (!details?.[args.payloadKey]) {
			return sharedBuildDetailNotFoundPayload(args, {
				reason: `${args.entityType} details response did not include ${args.payloadKey}.`
			});
		}

		return sharedStripInternalPayloadFields(details);
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
		materialized_tools: string[];
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
			materialized_tools: inferMaterializedToolsFromEntityResults({ results }),
			total: typeof (data as any)?.total === 'number' ? (data as any).total : totalReturned,
			message:
				(data as any)?.message ??
				`Found ${results.length} BuildOS matches. Use get_onto_*_details to load full records.`
		};
	}

	// ============================================
	// LIST OPERATIONS
	// ============================================

	async listOntoProjects(args: ListOntoProjectsArgs): Promise<{
		projects: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoProjects(this.sharedReadContext, args);
	}

	async listOntoTasks(args: ListOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoTasks(this.sharedReadContext, args);
	}

	async listOntoGoals(args: ListOntoGoalsArgs): Promise<{
		goals: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoGoals(this.sharedReadContext, args);
	}

	async listOntoPlans(args: ListOntoPlansArgs): Promise<{
		plans: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoPlans(this.sharedReadContext, args);
	}

	async listOntoDocuments(args: ListOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoDocuments(this.sharedReadContext, args);
	}

	async listOntoMilestones(args: ListOntoMilestonesArgs): Promise<{
		milestones: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoMilestones(this.sharedReadContext, args);
	}

	async listOntoRisks(args: ListOntoRisksArgs): Promise<{
		risks: any[];
		total: number;
		message: string;
	}> {
		return sharedListOntoRisks(this.sharedReadContext, args);
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
		rejected_query?: boolean;
		materialized_tools?: string[];
	}> {
		return sharedSearchOntoProjects(this.sharedReadContext, args);
	}

	async searchOntoTasks(args: SearchOntoTasksArgs): Promise<{
		tasks: any[];
		total: number;
		message: string;
	}> {
		return sharedSearchOntoTasks(this.sharedReadContext, args);
	}

	async searchOntoGoals(args: SearchOntoGoalsArgs): Promise<{
		goals: any[];
		total: number;
		message: string;
	}> {
		return sharedSearchOntoGoals(this.sharedReadContext, args);
	}

	async searchOntoPlans(args: SearchOntoPlansArgs): Promise<{
		plans: any[];
		total: number;
		message: string;
	}> {
		return sharedSearchOntoPlans(this.sharedReadContext, args);
	}

	async searchOntoDocuments(args: SearchOntoDocumentsArgs): Promise<{
		documents: any[];
		total: number;
		message: string;
	}> {
		return sharedSearchOntoDocuments(this.sharedReadContext, args);
	}

	async searchOntoMilestones(args: SearchOntoMilestonesArgs): Promise<{
		milestones: any[];
		total: number;
		message: string;
	}> {
		return sharedSearchOntoMilestones(this.sharedReadContext, args);
	}

	async searchOntoRisks(args: SearchOntoRisksArgs): Promise<{
		risks: any[];
		total: number;
		message: string;
	}> {
		return sharedSearchOntoRisks(this.sharedReadContext, args);
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
			project_id: args.project_id,
			types: args.types,
			limit: args.limit,
			scope: args.project_id ? 'project' : 'workspace'
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
		return sharedGetOntoProjectDetails(this.sharedReadContext, args);
	}

	async getOntoProjectGraph(args: GetOntoProjectGraphArgs): Promise<any> {
		const details = await this.getDetailOrNotFound({
			path: `/api/onto/projects/${args.project_id}/graph/full`,
			entityType: 'project',
			idKey: 'project_id',
			id: args.project_id,
			payloadKey: 'graph',
			listTool: 'list_onto_projects',
			searchTool: 'search_onto_projects'
		});
		if (details.status === 'not_found') return details;

		return {
			...details,
			message: 'Complete ontology project graph loaded.'
		};
	}

	async getOntoTaskDetails(args: GetOntoTaskDetailsArgs): Promise<any> {
		const details = await this.getDetailOrNotFound({
			path: `/api/onto/tasks/${args.task_id}`,
			entityType: 'task',
			idKey: 'task_id',
			id: args.task_id,
			payloadKey: 'task',
			listTool: 'list_onto_tasks',
			searchTool: 'search_onto_tasks'
		});
		if (details.status === 'not_found') return details;

		return {
			...details,
			message: 'Complete ontology task details loaded.'
		};
	}

	async getOntoGoalDetails(args: GetOntoGoalDetailsArgs): Promise<any> {
		const details = await this.getDetailOrNotFound({
			path: `/api/onto/goals/${args.goal_id}`,
			entityType: 'goal',
			idKey: 'goal_id',
			id: args.goal_id,
			payloadKey: 'goal',
			searchTool: 'search_onto_goals'
		});
		if (details.status === 'not_found') return details;

		return {
			...details,
			message: 'Complete ontology goal details loaded.'
		};
	}

	async getOntoPlanDetails(args: GetOntoPlanDetailsArgs): Promise<any> {
		const details = await this.getDetailOrNotFound({
			path: `/api/onto/plans/${args.plan_id}`,
			entityType: 'plan',
			idKey: 'plan_id',
			id: args.plan_id,
			payloadKey: 'plan',
			listTool: 'list_onto_plans',
			searchTool: 'search_onto_plans'
		});
		if (details.status === 'not_found') return details;

		return {
			...details,
			message: 'Complete ontology plan details loaded.'
		};
	}

	async getOntoDocumentDetails(args: GetOntoDocumentDetailsArgs): Promise<any> {
		return sharedGetOntoDocumentDetails(this.sharedReadContext, args);
	}

	/**
	 * Project Knowledge Layer (L2): return just the heading outline of a document.
	 * Cheap "what is this doc about" scan — lets the agent decide relevance and pick
	 * a section to read without pulling the full body. Computed live from content.
	 */
	async getDocumentOutline(args: GetDocumentOutlineArgs): Promise<any> {
		return sharedGetDocumentOutline(this.sharedReadContext, args);
	}

	/**
	 * Project Knowledge Layer (L2): return the body of one section by heading anchor.
	 * Re-parses live content, so the slice is always correct even after edits. Lets
	 * the agent zoom into the relevant part instead of loading the whole document.
	 */
	async readDocumentSection(args: ReadDocumentSectionArgs): Promise<any> {
		return sharedReadDocumentSection(this.sharedReadContext, args);
	}

	async getOntoMilestoneDetails(args: GetOntoMilestoneDetailsArgs): Promise<any> {
		const details = await this.getDetailOrNotFound({
			path: `/api/onto/milestones/${args.milestone_id}`,
			entityType: 'milestone',
			idKey: 'milestone_id',
			id: args.milestone_id,
			payloadKey: 'milestone',
			listTool: 'list_onto_milestones',
			searchTool: 'search_onto_milestones'
		});
		if (details.status === 'not_found') return details;

		return {
			...details,
			message: 'Complete ontology milestone details loaded.'
		};
	}

	async getOntoRiskDetails(args: GetOntoRiskDetailsArgs): Promise<any> {
		const details = await this.getDetailOrNotFound({
			path: `/api/onto/risks/${args.risk_id}`,
			entityType: 'risk',
			idKey: 'risk_id',
			id: args.risk_id,
			payloadKey: 'risk',
			listTool: 'list_onto_risks',
			searchTool: 'search_onto_risks'
		});
		if (details.status === 'not_found') return details;

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
