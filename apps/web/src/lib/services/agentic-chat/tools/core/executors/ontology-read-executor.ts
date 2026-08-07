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
 * The direct-Supabase reads live in @buildos/agentic-chat-runtime/tools as
 * free functions over an injected context; this class delegates to them with
 * its RLS client + web access adapter. All ontology reads now execute without
 * a web API hop.
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
	getDocumentPath as sharedGetDocumentPath,
	getDocumentOutline as sharedGetDocumentOutline,
	getDocumentTree as sharedGetDocumentTree,
	getOntoDocumentDetails as sharedGetOntoDocumentDetails,
	getOntoGoalDetails as sharedGetOntoGoalDetails,
	getOntoMilestoneDetails as sharedGetOntoMilestoneDetails,
	getOntoPlanDetails as sharedGetOntoPlanDetails,
	getOntoProjectDetails as sharedGetOntoProjectDetails,
	getOntoProjectGraph as sharedGetOntoProjectGraph,
	getOntoRiskDetails as sharedGetOntoRiskDetails,
	getOntoTaskDetails as sharedGetOntoTaskDetails,
	listOntoDocuments as sharedListOntoDocuments,
	listOntoGoals as sharedListOntoGoals,
	listOntoMilestones as sharedListOntoMilestones,
	listOntoPlans as sharedListOntoPlans,
	listOntoProjects as sharedListOntoProjects,
	listOntoRisks as sharedListOntoRisks,
	listOntoTasks as sharedListOntoTasks,
	listTaskDocuments as sharedListTaskDocuments,
	readDocumentSection as sharedReadDocumentSection,
	searchOntoDocuments as sharedSearchOntoDocuments,
	searchOntoGoals as sharedSearchOntoGoals,
	searchAllProjects as sharedSearchAllProjects,
	searchOntoMilestones as sharedSearchOntoMilestones,
	searchOntology as sharedSearchOntology,
	searchOntoPlans as sharedSearchOntoPlans,
	searchProject as sharedSearchProject,
	searchOntoProjects as sharedSearchOntoProjects,
	searchOntoRisks as sharedSearchOntoRisks,
	searchOntoTasks as sharedSearchOntoTasks
} from '@buildos/agentic-chat-runtime/tools';

/**
 * Executor for ontology read operations.
 *
 * All methods return structured data with a message field for LLM consumption.
 */
export class OntologyReadExecutor extends BaseExecutor {
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
		return sharedListTaskDocuments(this.sharedReadContext, args);
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
		return sharedSearchAllProjects(this.sharedReadContext, args);
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
		return sharedSearchProject(this.sharedReadContext, args);
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
		return sharedSearchOntology(this.sharedReadContext, args);
	}

	// ============================================
	// GET DETAILS OPERATIONS
	// ============================================

	async getOntoProjectDetails(args: GetOntoProjectDetailsArgs): Promise<any> {
		return sharedGetOntoProjectDetails(this.sharedReadContext, args);
	}

	async getOntoProjectGraph(args: GetOntoProjectGraphArgs): Promise<any> {
		return sharedGetOntoProjectGraph(this.sharedReadContext, args);
	}

	async getOntoTaskDetails(args: GetOntoTaskDetailsArgs): Promise<any> {
		return sharedGetOntoTaskDetails(this.sharedReadContext, args);
	}

	async getOntoGoalDetails(args: GetOntoGoalDetailsArgs): Promise<any> {
		return sharedGetOntoGoalDetails(this.sharedReadContext, args);
	}

	async getOntoPlanDetails(args: GetOntoPlanDetailsArgs): Promise<any> {
		return sharedGetOntoPlanDetails(this.sharedReadContext, args);
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
		return sharedGetOntoMilestoneDetails(this.sharedReadContext, args);
	}

	async getOntoRiskDetails(args: GetOntoRiskDetailsArgs): Promise<any> {
		return sharedGetOntoRiskDetails(this.sharedReadContext, args);
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
		return sharedGetDocumentTree(this.sharedReadContext, args);
	}

	async getDocumentPath(args: GetDocumentPathArgs): Promise<{
		path: Array<{ id: string; title: string }>;
		document_id: string;
		project_id: string;
		message: string;
	}> {
		return sharedGetDocumentPath(this.sharedReadContext, args);
	}
}
