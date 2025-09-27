// src/lib/services/prompts/core/data-models.ts
/**
 * Centralized data model definitions for prompts
 * Single source of truth for all model schemas
 */

// ============================================================================
// TASK MODELS
// ============================================================================

/**
 * Core task model definition used across all prompts
 */
export const TASK_CORE_FIELDS = {
	title: 'string (required, max 255)',
	description: 'string',
	details: 'string (comprehensive specifics from braindump)',
	status: '"backlog"|"in_progress"|"done"|"blocked"',
	priority: '"low"|"medium"|"high"',
	task_type: '"one_off"|"recurring"',
	duration_minutes: 'number (15|30|60|120|240|480)',
	tags: 'string[]'
} as const;

/**
 * Task date fields for scheduling
 */
export const TASK_DATE_FIELDS = {
	start_date: 'YYYY-MM-DDTHH:MM:SS (timestamptz - REQUIRED if recurring)',
	end_date: 'YYYY-MM-DD (date only, optional)',
	recurrence_pattern:
		'"daily"|"weekdays"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly" (REQUIRED if recurring)',
	recurrence_ends: 'YYYY-MM-DD (optional - defaults to project end date)'
} as const;

/**
 * Get complete task model for CREATE operations
 */
export function getTaskCreateModel(projectId?: string): string {
	return `// Task CREATE model:
{
  "operation": "create",
  "table": "tasks",
  "id": "op-[timestamp]-task-[index]",
  "data": {
    "title": "New task title (required)",${
		projectId
			? `
    "project_id": "${projectId}" (required),`
			: `
    "project_ref": "new-project-1" (link to project),`
	}
    "description": "Task summary",
    "details": "COMPREHENSIVE details - capture ALL specifics, implementation notes, research, ideas, observations, and context related to this task from the braindump",
    "priority": "low|medium|high",
    "status": "backlog",
    "task_type": "one_off|recurring",
    "duration_minutes": 15|30|60|120|240|480,
    "start_date": "YYYY-MM-DDTHH:MM:SS" (timestamptz - REQUIRED if task_type is recurring, optional otherwise. Schedule tasks intelligently throughout the day, e.g., "2024-03-15T09:00:00" for 9am, "2024-03-15T14:30:00" for 2:30pm),
    "recurrence_pattern": "daily|weekdays|weekly|biweekly|monthly|quarterly|yearly" (REQUIRED if task_type is recurring),
    "recurrence_ends": "YYYY-MM-DD" (date only, optional - defaults to project end date),
    "tags": ["optional", "tags"]
  }
}`;
}

/**
 * Get task model for UPDATE operations
 */
export function getTaskUpdateModel(): string {
	return `// Task UPDATE model:
{
  "operation": "update",
  "table": "tasks",
  "id": "op-[timestamp]-task-update-[index]",
  "conditions": { "id": "existing-task-uuid" },
  "data": {
    // Include only fields that should be updated:
    "title": "Updated title if changed",
    "description": "Updated description if mentioned",
    "details": "Updated/additional details (specifics mentioned in braindump)",
    "status": "backlog|in_progress|done|blocked",
    "priority": "low|medium|high",
    "task_type": "one_off|recurring",
    "duration_minutes": 15|30|60|120|240|480,
    "start_date": "YYYY-MM-DDTHH:MM:SS",
    "end_date": "YYYY-MM-DD",
    "recurrence_pattern": "daily|weekdays|weekly|biweekly|monthly|quarterly|yearly",
    "recurrence_ends": "YYYY-MM-DD",
    "tags": ["updated", "tags"]
  }
}`;
}

/**
 * Get compact task model for reference
 */
export function getTaskModelReference(): string {
	return `tasks: {
  title: string (required, max 255),
  project_id: string (required if project exists),
  description: string,
  details: string (comprehensive specifics),
  status: "backlog"|"in_progress"|"done"|"blocked",
  priority: "low"|"medium"|"high",
  task_type: "one_off"|"recurring",
  duration_minutes: number,
  start_date: timestamptz,
  end_date: date,
  recurrence_pattern: string,
  recurrence_ends: date,
  tags: string[]
}`;
}

// ============================================================================
// PROJECT MODELS
// ============================================================================

/**
 * Core project model fields
 */
export const PROJECT_CORE_FIELDS = {
	name: 'string (required, max 255)',
	slug: 'string (REQUIRED - generate from name: lowercase, replace spaces/special chars with hyphens)',
	description: 'string',
	context: 'string (required, rich markdown)',
	executive_summary: 'string (<500 chars)',
	status: '"active"|"paused"|"completed"|"archived"',
	visibility: '"private"|"public"|"team"',
	tags: 'string[]'
} as const;

/**
 * Get project model for CREATE operations
 */
export function getProjectCreateModel(): string {
	return `// Project CREATE model:
{
  "operation": "create",
  "table": "projects",
  "id": "op-[timestamp]-project-create",
  "data": {
    "name": "Project name (required, max 255)",
    "slug": "project-slug (REQUIRED - generate from name: lowercase, replace spaces/special chars with hyphens)",
    "description": "Project description",
    "context": "Rich markdown context (required)",
    "executive_summary": "Executive summary (<500 chars)",
    "status": "active|paused|completed|archived",
    "visibility": "private|public|team",
    "start_date": "YYYY-MM-DD" (REQUIRED - parse from braindump or use today),
    "end_date": "YYYY-MM-DD" (parse timeline from braindump or leave null),
    "tags": ["optional", "tags"]
  }
}`;
}

/**
 * Get project model for UPDATE operations
 */
export function getProjectUpdateModel(): string {
	return `// Project UPDATE model:
{
  "operation": "update",
  "table": "projects",
  "id": "op-[timestamp]-project-update",
  "conditions": { "id": "project-uuid" },
  "data": {
    // Include only fields that should be updated:
    "name": "Updated name if changed",
    "description": "Updated description",
    "context": "Updated/enriched context (preserve existing, add new)",
    "executive_summary": "Updated if project vision changed",
    "status": "active|paused|completed|archived",
    "end_date": "YYYY-MM-DD",
    "tags": ["updated", "tags"]
  }
}`;
}

// ============================================================================
// PHASE MODELS
// ============================================================================

/**
 * Get phase model for CREATE operations
 */
export function getPhaseCreateModel(): string {
	return `// Phase CREATE model:
{
  "operation": "create",
  "table": "phases",
  "id": "op-[timestamp]-phase-[index]",
  "data": {
    "name": "Phase name (required, descriptive)",
    "project_id": "project-uuid" (required),
    "description": "What this phase accomplishes",
    "start_date": "YYYY-MM-DDTHH:MM:SS" (timestamptz - when phase begins),
    "end_date": "YYYY-MM-DD" (when phase ends),
    "order_index": number (sequence in project),
    "status": "not_started|in_progress|completed",
    "goals": ["specific", "objectives"],
    "deliverables": ["what", "will", "be", "produced"]
  }
}`;
}

// ============================================================================
// NOTE MODELS
// ============================================================================

/**
 * Get note model for CREATE operations
 */
export function getNoteCreateModel(): string {
	return `// Note CREATE model:
{
  "operation": "create",
  "table": "notes",
  "id": "op-[timestamp]-note-create",
  "data": {
    "title": "Note title (required)",
    "content": "Note content in markdown",
    "project_id": "project-uuid" (optional),
    "tags": ["optional", "tags"],
    "is_pinned": false
  }
}`;
}

// ============================================================================
// EXPORT COLLECTIONS
// ============================================================================

/**
 * All task-related models
 */
export const TaskModels = {
	create: getTaskCreateModel,
	update: getTaskUpdateModel,
	reference: getTaskModelReference,
	coreFields: TASK_CORE_FIELDS,
	dateFields: TASK_DATE_FIELDS
};

/**
 * All project-related models
 */
export const ProjectModels = {
	create: getProjectCreateModel,
	update: getProjectUpdateModel,
	coreFields: PROJECT_CORE_FIELDS
};

/**
 * All phase-related models
 */
export const PhaseModels = {
	create: getPhaseCreateModel
};

/**
 * All note-related models
 */
export const NoteModels = {
	create: getNoteCreateModel
};

/**
 * Complete data models collection
 */
export const DataModels = {
	task: TaskModels,
	project: ProjectModels,
	phase: PhaseModels,
	note: NoteModels
};
