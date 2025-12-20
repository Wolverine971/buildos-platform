// apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts
/**
 * Shared Types for Tool Executors
 *
 * Common interfaces and types used across all domain-specific executors.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SmartLLMService } from '$lib/services/smart-llm-service';

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
	search: string;
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
	search: string;
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

export interface SearchOntoDocumentsArgs {
	search: string;
	project_id?: string;
	type_key?: string;
	state_key?: string;
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

export interface ListTaskDocumentsArgs {
	task_id: string;
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
	plan_id?: string;
	start_at?: string;
	due_at?: string;
	props?: Record<string, unknown>;
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
}

export interface CreateOntoDocumentArgs {
	project_id: string;
	title: string;
	type_key: string;
	state_key?: string;
	body_markdown?: string;
	props?: Record<string, unknown>;
}

export interface CreateTaskDocumentArgs {
	task_id: string;
	document_id?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	role?: string;
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
	goals?: Array<{
		name: string;
		type_key?: string;
		description?: string;
		props?: Record<string, unknown>;
	}>;
	requirements?: Array<{
		text: string;
		type_key?: string;
		props?: Record<string, unknown>;
	}>;
	plans?: Array<{
		name: string;
		type_key: string;
		state_key?: string;
		props?: Record<string, unknown>;
	}>;
	tasks?: Array<{
		title: string;
		type_key?: string;
		plan_name?: string;
		state_key?: string;
		priority?: number;
		due_at?: string;
		props?: Record<string, unknown>;
	}>;
	outputs?: Array<{
		name: string;
		type_key: string;
		state_key?: string;
		props?: Record<string, unknown>;
	}>;
	documents?: Array<{
		title: string;
		type_key: string;
		state_key?: string;
		body_markdown?: string;
		props?: Record<string, unknown>;
	}>;
	context_document?: {
		title: string;
		body_markdown: string;
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
	title?: string;
	description?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
	type_key?: string;
	state_key?: string;
	priority?: number;
	plan_id?: string;
	start_at?: string;
	due_at?: string;
	props?: Record<string, unknown>;
}

export interface UpdateOntoProjectArgs {
	project_id: string;
	name?: string;
	description?: string;
	state_key?: string;
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
	body_markdown?: string;
	update_strategy?: 'replace' | 'append' | 'merge_llm';
	merge_instructions?: string;
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
	entity_kind: 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output' | 'risk';
	filter_kind?: 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output' | 'risk' | 'all';
}
