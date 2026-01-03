// apps/web/src/lib/types/onto-api.ts
/**
 * Type definitions for Ontology API responses and database operations
 *
 * These types ensure type safety across all ontology API endpoints
 * and eliminate the need for 'any' type casts.
 */

import type { Template, Facets } from './onto';

// ============================================
// RPC RESPONSE TYPES
// ============================================

/**
 * Response from ensure_actor_for_user RPC call
 */
export type EnsureActorResponse = string;

/**
 * Response from get_allowed_transitions RPC call
 * @deprecated FSM transitions are no longer used. Use state enums from onto.ts instead.
 */
export interface AllowedTransitionResponse {
	event: string;
	to_state: string;
	guards?: any[];
	actions?: any[];
	failed_guards?: any[];
	can_run?: boolean;
}

/**
 * Response from instantiate_project_from_template RPC call
 */
export interface InstantiateProjectResponse {
	project_id: string;
	message?: string;
	details?: {
		goals_created?: number;
		requirements_created?: number;
		tasks_created?: number;
		plans_created?: number;
	};
}

/**
 * Response from get_template_catalog RPC call
 */
export interface TemplateCatalogResponse extends Template {
	// Inherits all Template properties
}

// ============================================
// DATABASE ENTITY TYPES
// ============================================

/**
 * Project entity from onto_projects table
 */
export interface OntoProject {
	id: string;
	name: string;
	description?: string | null;
	type_key: string;
	state_key: string;
	props: Record<string, unknown> | null;
	facet_context?: string | null;
	facet_scale?: string | null;
	facet_stage?: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
}

/**
 * Task entity from onto_tasks table
 * Note: plan_id is no longer a column - task-plan relationships are stored in onto_edges
 * with rel='has_task' (src_kind='plan', dst_kind='task')
 */
export interface OntoTask {
	id: string;
	project_id: string;
	type_key: string;
	title: string;
	description?: string | null;
	state_key: string;
	priority: number;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	start_at?: string | null;
	completed_at?: string | null;
	due_at?: string | null;
	deleted_at?: string | null;
}

/**
 * Goal entity from onto_goals table
 */
export interface OntoGoal {
	id: string;
	project_id: string;
	type_key: string | null;
	name: string;
	goal?: string | null;
	description?: string | null;
	state_key?: string | null;
	target_date?: string | null;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at?: string;
	completed_at?: string | null;
	deleted_at?: string | null;
}

/**
 * Plan entity from onto_plans table
 */
export interface OntoPlan {
	id: string;
	project_id: string;
	type_key: string;
	name: string;
	plan?: string | null;
	description?: string | null;
	state_key: string;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	deleted_at?: string | null;
}

/**
 * Output entity from onto_outputs table
 */
export interface OntoOutput {
	id: string;
	project_id: string;
	type_key: string;
	name: string;
	state_key: string;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at: string;
}

/**
 * Edge entity from onto_edges table.
 * Edges include a denormalized project_id for efficient project-scoped queries.
 * See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */
export interface OntoEdge {
	id: string;
	src_id: string;
	src_kind: string;
	dst_id: string;
	dst_kind: string;
	rel: string;
	props?: Record<string, unknown> | null;
	created_at: string;
	/** Denormalized project reference for efficient project-scoped queries */
	project_id: string;
}

/**
 * Document entity from onto_documents table
 */
export interface OntoDocument {
	id: string;
	project_id: string;
	type_key: string;
	title: string;
	state_key: string;
	content?: string | null;
	description?: string | null;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	deleted_at?: string | null;
}

/**
 * Requirement entity from onto_requirements table
 */
export interface OntoRequirement {
	id: string;
	project_id: string;
	text: string;
	type_key?: string | null;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
}

/**
 * Risk entity from onto_risks table
 */
export interface OntoRisk {
	id: string;
	project_id: string;
	title: string;
	type_key?: string | null;
	probability?: number | null;
	impact?: string;
	state_key?: string;
	content?: string | null;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at?: string;
	mitigated_at?: string | null;
	deleted_at?: string | null;
}

/**
 * Milestone entity from onto_milestones table
 */
export interface OntoMilestone {
	id: string;
	project_id: string;
	title: string;
	type_key?: string | null;
	due_at?: string | null;
	milestone?: string | null;
	description?: string | null;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
	updated_at?: string;
	completed_at?: string | null;
	deleted_at?: string | null;
}

/**
 * Decision entity from onto_decisions table
 */
export interface OntoDecision {
	id: string;
	project_id: string;
	title: string;
	rationale?: string | null;
	decision_at: string;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
}

/**
 * Metric entity from onto_metrics table
 */
export interface OntoMetric {
	id: string;
	project_id: string;
	name: string;
	definition?: string | null;
	unit?: string | null;
	target_value?: number | null;
	props: Record<string, unknown> | null;
	created_by: string;
	created_at: string;
}

/**
 * Source entity from onto_sources table
 */
export interface OntoSource {
	id: string;
	project_id: string;
	name: string;
	uri?: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Project detail response with all related entities
 */
export interface ProjectDetailResponse {
	project: OntoProject;
	goals: OntoGoal[];
	requirements: OntoRequirement[];
	plans: OntoPlan[];
	tasks: OntoTask[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
	sources: OntoSource[];
	milestones: OntoMilestone[];
	risks: OntoRisk[];
	decisions: OntoDecision[];
	metrics: OntoMetric[];
	template: Template | null;
	/**
	 * @deprecated FSM transitions are no longer used. Use state enums from onto.ts instead.
	 */
	allowed_transitions: Array<{
		event: string;
		to: string;
		label: string;
		guards: any[];
		actions: any[];
	}>;
}

/**
 * Project summary with counts
 */
export interface ProjectSummary extends OntoProject {
	task_count: number;
	output_count: number;
}

/**
 * Template response with grouped data
 */
export interface TemplateListResponse {
	templates: Template[];
	grouped: Record<string, Template[]>;
	count: number;
}

// ============================================
// HELPER TYPE GUARDS
// ============================================

/**
 * Type guard to check if response has actor_id
 */
export function isEnsureActorResponse(value: any): value is EnsureActorResponse {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for project entity
 */
export function isOntoProject(value: any): value is OntoProject {
	return (
		value &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.type_key === 'string' &&
		typeof value.state_key === 'string'
	);
}

/**
 * Type guard for task entity
 */
export function isOntoTask(value: any): value is OntoTask {
	return (
		value &&
		typeof value.id === 'string' &&
		typeof value.project_id === 'string' &&
		typeof value.title === 'string' &&
		typeof value.state_key === 'string'
	);
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Common create payload for entities
 */
export interface CreateEntityPayload {
	project_id: string;
	type_key: string;
	name?: string;
	title?: string;
	description?: string;
	state_key?: string;
	props?: Record<string, unknown>;
	created_by?: string;
}

/**
 * Common update payload for entities
 */
export interface UpdateEntityPayload {
	name?: string;
	title?: string;
	state_key?: string;
	props?: Record<string, unknown>;
	updated_at?: string;
}

/**
 * Facet filter parameters
 */
export interface FacetFilters {
	context?: string[];
	scale?: string[];
	stage?: string[];
}

/**
 * Common query parameters
 */
export interface QueryParams {
	scope?: string;
	realm?: string;
	search?: string;
	primitive?: string;
	sort?: string;
	direction?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
}
