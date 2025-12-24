// packages/shared-types/src/project-activity.types.ts
/**
 * Project Activity Logging & Next Steps Types
 *
 * This module defines types for:
 * - Activity logging (onto_project_logs table)
 * - Next step recommendations (onto_projects columns)
 * - Entity reference parsing for embedding links in markdown
 *
 * @see /apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md
 */

import type { Json } from './database.schema';

// =============================================================================
// Entity Type Definitions
// =============================================================================

/**
 * Types of entities that can be logged in project activity
 * Maps to ontology tables: onto_tasks, onto_outputs, etc.
 */
export type ProjectLogEntityType =
	| 'project'
	| 'task'
	| 'output'
	| 'note'
	| 'document'
	| 'goal'
	| 'milestone'
	| 'risk'
	| 'plan'
	| 'requirement'
	| 'decision'
	| 'source'
	| 'edge';

/**
 * Actions that can be performed on entities
 */
export type ProjectLogAction = 'created' | 'updated' | 'deleted';

/**
 * Source of the change - how was this modification made
 */
export type ProjectLogChangeSource = 'chat' | 'form' | 'brain_dump' | 'api';

/**
 * Who generated the next step
 */
export type NextStepSource = 'ai' | 'user';

// =============================================================================
// Database Row Types (mirrors onto_project_logs table)
// =============================================================================

/**
 * A single activity log entry for a project
 * Stored in onto_project_logs table
 */
export interface ProjectLogEntry {
	id: string;
	project_id: string;
	entity_type: ProjectLogEntityType;
	entity_id: string;
	action: ProjectLogAction;
	before_data: Json | null;
	after_data: Json | null;
	changed_by: string;
	change_source: ProjectLogChangeSource | null;
	chat_session_id: string | null;
	created_at: string;
}

/**
 * Input for creating a new log entry
 */
export interface ProjectLogInsert {
	project_id: string;
	entity_type: ProjectLogEntityType;
	entity_id: string;
	action: ProjectLogAction;
	before_data?: Json | null;
	after_data?: Json | null;
	changed_by: string;
	change_source?: ProjectLogChangeSource | null;
	chat_session_id?: string | null;
}

/**
 * Next step fields on onto_projects
 */
export interface ProjectNextStep {
	next_step_short: string | null;
	next_step_long: string | null;
	next_step_updated_at: string | null;
	next_step_source: NextStepSource | null;
}

// =============================================================================
// Entity Reference Types (for embedding links in next_step_long)
// =============================================================================

/**
 * Supported entity types for embedded references
 * Extends ProjectLogEntityType with 'user' for @mentions
 */
export type EntityReferenceType = ProjectLogEntityType | 'user' | 'document';

/**
 * A parsed entity reference from next_step_long markdown
 * Format in markdown: [[type:id|displayText]]
 *
 * @example
 * // Markdown: "Complete the [[task:abc123|project brief]]"
 * // Parsed: { type: 'task', id: 'abc123', displayText: 'project brief' }
 */
export interface EntityReference {
	type: EntityReferenceType;
	id: string;
	displayText: string;
}

/**
 * Result of parsing next_step_long markdown
 */
export interface ParsedNextStepLong {
	/** Original markdown with entity references */
	markdown: string;
	/** Extracted entity references for rendering as links */
	entities: EntityReference[];
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to update a project's next step manually
 */
export interface UpdateNextStepRequest {
	next_step_short: string;
	next_step_long: string;
}

/**
 * Response containing activity logs with pagination
 */
export interface ProjectLogsResponse {
	logs: ProjectLogEntry[];
	total: number;
	hasMore: boolean;
}

/**
 * Options for querying project logs
 */
export interface ProjectLogsQueryOptions {
	limit?: number;
	offset?: number;
	entityType?: ProjectLogEntityType;
	action?: ProjectLogAction;
	startDate?: string;
	endDate?: string;
}

// =============================================================================
// Worker/Job Types
// =============================================================================

/**
 * Payload for the extended chat classification job
 * Includes activity logging and next step generation
 */
export interface ChatClassificationExtendedPayload {
	sessionId: string;
	userId: string;
	projectId?: string;
	/** Whether to generate activity logs from the chat */
	generateActivityLogs?: boolean;
	/** Whether to update project next steps */
	updateNextSteps?: boolean;
}

/**
 * Result from the chat classification job
 */
export interface ChatClassificationExtendedResult {
	title?: string;
	topics?: string[];
	/** Activity logs generated from the chat session */
	activityLogs?: ProjectLogInsert[];
	/** Updated next steps for the project */
	nextStep?: {
		short: string;
		long: string;
	};
}

/**
 * Context provided to the LLM for next step generation
 */
export interface NextStepGenerationContext {
	projectId: string;
	projectName: string;
	projectDescription?: string;
	templateType?: string;
	/** Recent activity on the project */
	recentActivity?: ProjectLogEntry[];
	/** What was discussed/changed in the current session */
	sessionChanges?: {
		created: Array<{ type: ProjectLogEntityType; name: string; id: string }>;
		updated: Array<{ type: ProjectLogEntityType; name: string; id: string }>;
		deleted: Array<{ type: ProjectLogEntityType; name: string; id: string }>;
	};
	/** Previous next step (for continuity) */
	previousNextStep?: {
		short: string | null;
		long: string | null;
	};
}

// =============================================================================
// UI Component Types
// =============================================================================

/**
 * Props for rendering an entity reference as a clickable link
 */
export interface EntityReferenceProps {
	reference: EntityReference;
	onClick: (ref: EntityReference) => void;
}

/**
 * Activity log entry with additional display metadata
 */
export interface ProjectLogEntryWithMeta extends ProjectLogEntry {
	/** Display name of the user who made the change */
	changed_by_name?: string;
	/** Display name of the entity that was changed */
	entity_name?: string;
	/** Formatted date string */
	formatted_date?: string;
}
