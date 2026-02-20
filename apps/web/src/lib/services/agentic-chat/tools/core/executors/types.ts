// apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts
/**
 * Shared Types for Tool Executors
 *
 * Common interfaces and types used across all domain-specific executors.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { ProjectSpec } from '$lib/types/onto';

// ============================================
// EXECUTOR CONTEXT
// ============================================

/**
 * Shared context passed to all executors
 */
export interface ExecutorContext {
	supabase: SupabaseClient;
	userId: string;
	sessionId?: string;
	fetchFn: typeof fetch;
	llmService?: SmartLLMService;
	getActorId: () => Promise<string>;
	getAdminSupabase: () => TypedSupabaseClient;
	getAuthHeaders: () => Promise<HeadersInit>;
}

/**
 * Result from tool execution
 */
export interface ToolExecutionOutput<T = any> {
	data: T;
	streamEvents?: any[];
}

// ============================================
// ONTOLOGY READ ARGS
// ============================================

export interface ListOntoTasksArgs {
	project_id?: string;
	state_key?: string;
	limit?: number;
}

export interface SearchOntoTasksArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	state_key?: string;
	limit?: number;
}

export interface ListOntoGoalsArgs {
	project_id?: string;
	limit?: number;
}

export interface ListOntoPlansArgs {
	project_id?: string;
	limit?: number;
}

export interface ListOntoProjectsArgs {
	state_key?: string;
	type_key?: string;
	limit?: number;
}

export interface SearchOntoProjectsArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	state_key?: string;
	type_key?: string;
	limit?: number;
}

export interface ListOntoDocumentsArgs {
	project_id?: string;
	type_key?: string;
	state_key?: string;
	limit?: number;
}

export interface ListOntoMilestonesArgs {
	project_id?: string;
	state_key?: string;
	limit?: number;
}

export interface ListOntoRisksArgs {
	project_id?: string;
	state_key?: string;
	impact?: string;
	limit?: number;
}

export interface SearchOntoDocumentsArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	type_key?: string;
	state_key?: string;
	limit?: number;
}

export interface SearchOntoGoalsArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	limit?: number;
}

export interface SearchOntoPlansArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	limit?: number;
}

export interface SearchOntoMilestonesArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	state_key?: string;
	limit?: number;
}

export interface SearchOntoRisksArgs {
	query: string;
	/** @deprecated Legacy alias. Use query. */
	search?: string;
	project_id?: string;
	state_key?: string;
	impact?: string;
	limit?: number;
}

export interface SearchOntologyArgs {
	query: string;
	project_id?: string;
	types?: string[];
	limit?: number;
}

export interface GetOntoProjectDetailsArgs {
	project_id: string;
}

export interface GetOntoProjectGraphArgs {
	project_id: string;
}

export interface GetOntoTaskDetailsArgs {
	task_id: string;
}

export interface GetOntoGoalDetailsArgs {
	goal_id: string;
}

export interface GetOntoPlanDetailsArgs {
	plan_id: string;
}

export interface GetOntoDocumentDetailsArgs {
	document_id: string;
}

export interface GetOntoMilestoneDetailsArgs {
	milestone_id: string;
}

export interface GetOntoRiskDetailsArgs {
	risk_id: string;
}

export interface ListTaskDocumentsArgs {
	task_id: string;
}

export interface GetDocumentTreeArgs {
	project_id: string;
	/** Include document metadata + unlinked list (default: false). */
	include_documents?: boolean;
	/** Include document content bodies in response (default: false for metadata-only) */
	include_content?: boolean;
}

export interface GetDocumentPathArgs {
	document_id: string;
	/** Optional project ID to avoid extra lookup */
	project_id?: string;
}

// ============================================
// ONTOLOGY WRITE ARGS
// ============================================

export interface CreateOntoTaskArgs {
	project_id: string;
	title: string;
	description?: string;
	type_key?: string;
	state_key?: string;
	priority?: number;
	assignee_actor_ids?: string[];
	assignee_handles?: string[];
	plan_id?: string;
	goal_id?: string;
	supporting_milestone_id?: string;
	start_at?: string;
	due_at?: string;
	props?: Record<string, unknown>;
	parent?: { kind: string; id: string; is_primary?: boolean };
	parents?: Array<{ kind: string; id: string; is_primary?: boolean }>;
	connections?: Array<{
		kind: string;
		id: string;
		intent?: 'containment' | 'semantic';
		rel?: string;
	}>;
}

export interface CreateOntoGoalArgs {
	project_id: string;
	name: string;
	description?: string;
	type_key?: string;
	props?: Record<string, unknown>;
}

export interface CreateOntoPlanArgs {
	project_id: string;
	name: string;
	description?: string;
	type_key?: string;
	state_key?: string;
	props?: Record<string, unknown>;
	goal_id?: string;
	milestone_id?: string;
	parent?: { kind: string; id: string; is_primary?: boolean };
	parents?: Array<{ kind: string; id: string; is_primary?: boolean }>;
}

export interface CreateOntoDocumentArgs {
	project_id: string;
	title: string;
	description: string;
	type_key: string;
	state_key?: string;
	/** Markdown content stored in the content column */
	content?: string;
	/** @deprecated Use content instead. Kept for backwards compatibility. */
	body_markdown?: string;
	props?: Record<string, unknown>;
	parent?: { kind: string; id: string; is_primary?: boolean };
	parents?: Array<{ kind: string; id: string; is_primary?: boolean }>;
	/** Parent document ID for hierarchical tree placement */
	parent_id?: string | null;
	/** Position within parent's children (0-indexed). If omitted, appends to end. */
	position?: number;
}

export interface CreateOntoMilestoneArgs {
	project_id: string;
	title: string;
	goal_id?: string;
	due_at?: string;
	state_key?: string;
	description?: string;
	milestone?: string;
	props?: Record<string, unknown>;
	parent?: { kind: string; id: string; is_primary?: boolean };
	parents?: Array<{ kind: string; id: string; is_primary?: boolean }>;
	connections?: Array<{
		kind: string;
		id: string;
		intent?: 'containment' | 'semantic';
		rel?: string;
	}>;
}

export interface CreateOntoRiskArgs {
	project_id: string;
	title: string;
	impact: 'low' | 'medium' | 'high' | 'critical';
	probability?: number;
	state_key?: string;
	content?: string;
	description?: string;
	mitigation_strategy?: string;
	props?: Record<string, unknown>;
	parent?: { kind: string; id: string; is_primary?: boolean };
	parents?: Array<{ kind: string; id: string; is_primary?: boolean }>;
	connections?: Array<{
		kind: string;
		id: string;
		intent?: 'containment' | 'semantic';
		rel?: string;
	}>;
}

export interface MoveDocumentInTreeArgs {
	project_id: string;
	document_id: string;
	/** New parent document ID (null places at root). */
	new_parent_id?: string | null;
	/** Position among siblings (0-indexed). */
	new_position?: number;
}

export interface CreateTaskDocumentArgs {
	task_id: string;
	document_id?: string;
	title?: string;
	description?: string;
	type_key?: string;
	state_key?: string;
	role?: string;
	/** Markdown content stored in the content column */
	content?: string;
	/** @deprecated Use content instead. Kept for backwards compatibility. */
	body_markdown?: string;
	props?: Record<string, unknown>;
}

export interface CreateOntoProjectArgs {
	project: {
		name: string;
		type_key: string;
		description?: string;
		state_key?: string;
		props?: {
			facets?: {
				context?: string;
				scale?: string;
				stage?: string;
			};
			[key: string]: unknown;
		};
		start_at?: string;
		end_at?: string;
	};
	entities: ProjectSpec['entities'];
	relationships: ProjectSpec['relationships'];
	context_document?: {
		title: string;
		/** Markdown content stored in the content column */
		content?: string;
		/** @deprecated Use content instead. Kept for backwards compatibility. */
		body_markdown?: string;
		type_key?: string;
		state_key?: string;
		props?: Record<string, unknown>;
	};
	clarifications?: Array<{
		key: string;
		question: string;
		required: boolean;
		choices?: string[];
		help_text?: string;
	}>;
	meta?: Record<string, unknown>;
}

export interface UpdateOntoTaskArgs {
	task_id: string;
	project_id?: string;
	title?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	type_key?: string;
	state_key?: string;
	priority?: number;
	assignee_actor_ids?: string[];
	assignee_handles?: string[];
	goal_id?: string | null;
	supporting_milestone_id?: string | null;
	start_at?: string | null;
	due_at?: string | null;
	props?: Record<string, unknown>;
}

export interface TagOntoEntityArgs {
	project_id: string;
	entity_type: 'task' | 'goal' | 'document';
	entity_id: string;
	mode?: 'content' | 'ping';
	mentioned_user_ids?: string[];
	mentioned_handles?: string[];
	message?: string;
}

export interface LinkOntoEntitiesArgs {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
	props?: Record<string, unknown>;
}

export interface UnlinkOntoEdgeArgs {
	edge_id: string;
}

export interface ReorganizeOntoProjectGraphArgs {
	project_id: string;
	nodes: Array<{
		id: string;
		kind: string;
		connections?: Array<{
			kind: string;
			id: string;
			intent?: 'containment' | 'semantic';
			rel?: string;
		}>;
		mode?: 'replace' | 'merge';
		semantic_mode?: 'replace_auto' | 'merge' | 'preserve';
		allow_project_fallback?: boolean;
		allow_multi_parent?: boolean;
	}>;
	options?: {
		mode?: 'replace' | 'merge';
		semantic_mode?: 'replace_auto' | 'merge' | 'preserve';
		allow_project_fallback?: boolean;
		allow_multi_parent?: boolean;
		dry_run?: boolean;
	};
}

export interface UpdateOntoProjectArgs {
	project_id: string;
	name?: string;
	description?: string;
	state_key?: string;
	/** @deprecated Use state_key instead. */
	state?: string;
	props?: Record<string, unknown>;
}

export interface UpdateOntoGoalArgs {
	goal_id: string;
	name?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	priority?: number;
	target_date?: string;
	measurement_criteria?: string;
	props?: Record<string, unknown>;
}

export interface UpdateOntoPlanArgs {
	plan_id: string;
	name?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	start_date?: string;
	end_date?: string;
	state_key?: string;
	props?: Record<string, unknown>;
}

export interface UpdateOntoDocumentArgs {
	document_id: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	description?: string;
	/** Markdown content stored in the content column */
	content?: string;
	/** @deprecated Use content instead. Kept for backwards compatibility. */
	body_markdown?: string;
	/** Optional nested update payload (LLM sometimes wraps updates). */
	document?: Record<string, unknown>;
	updates?: Record<string, unknown>;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	props?: Record<string, unknown>;
}

export interface UpdateOntoMilestoneArgs {
	milestone_id: string;
	title?: string;
	due_at?: string;
	state_key?: string;
	description?: string;
	props?: Record<string, unknown>;
}

export interface UpdateOntoRiskArgs {
	risk_id: string;
	title?: string;
	impact?: string;
	probability?: number;
	state_key?: string;
	content?: string;
	description?: string;
	mitigation_strategy?: string;
	owner?: string;
	props?: Record<string, unknown>;
}

export interface DeleteOntoTaskArgs {
	task_id: string;
}

export interface DeleteOntoGoalArgs {
	goal_id: string;
}

export interface DeleteOntoPlanArgs {
	plan_id: string;
}

export interface DeleteOntoDocumentArgs {
	document_id: string;
}

export interface DeleteOntoProjectArgs {
	project_id: string;
}

export interface DeleteOntoMilestoneArgs {
	milestone_id: string;
}

export interface DeleteOntoRiskArgs {
	risk_id: string;
}

// ============================================
// UTILITY ARGS
// ============================================

export interface GetFieldInfoArgs {
	entity_type: string;
	field_name?: string;
}

export interface GetEntityRelationshipsArgs {
	entity_id: string;
	direction?: 'outgoing' | 'incoming' | 'both';
}

export interface GetLinkedEntitiesArgs {
	entity_id: string;
	entity_kind: 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'risk';
	filter_kind?: 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'risk' | 'all';
}
