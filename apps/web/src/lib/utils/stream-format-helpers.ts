// apps/web/src/lib/utils/stream-format-helpers.ts
// Helper functions to convert processor results to streaming preview formats

import type {
	BrainDumpParseResult,
	ProjectContextResult,
	TaskNoteExtractionResult,
	ParsedOperation
} from '$lib/types/brain-dump';

/**
 * Convert BrainDumpParseResult to ProjectContextResult format for streaming preview
 * This extracts project-related information from the operations array
 */
export function convertToProjectContextResult(
	result: BrainDumpParseResult
): ProjectContextResult | null {
	if (!result || !result.operations) {
		return null;
	}

	// Find project operation if exists
	const projectOp = result.operations.find((op) => op.table === 'projects');

	if (!projectOp || !projectOp.data) {
		// No project operation - context wasn't needed or no project changes
		return {
			title: result.title || 'No Context Update',
			summary: result.summary || '',
			insights: result.insights || '',
			tags: result.tags || []
		};
	}

	// Base result from metadata
	const baseResult: ProjectContextResult = {
		title:
			result.title || (projectOp.operation === 'create' ? 'New Project' : 'Project Updated'),
		summary: result.summary || '',
		insights: result.insights || '',
		tags: result.tags || []
	};

	// Add specific project data based on operation type
	if (projectOp.operation === 'update') {
		baseResult.projectUpdate = {
			context: projectOp.data.context || '',
			executive_summary: projectOp.data.executive_summary || '',
			tags: projectOp.data.tags || [],
			status: projectOp.data.status || 'active'
		};
	} else if (projectOp.operation === 'create') {
		baseResult.projectCreate = {
			name: projectOp.data.name || 'New Project',
			description: projectOp.data.description || '',
			context: projectOp.data.context || '',
			slug: projectOp.data.slug,
			executive_summary: projectOp.data.executive_summary || '',
			tags: projectOp.data.tags || [],
			status: projectOp.data.status || 'active'
		};
	}

	return baseResult;
}

/**
 * Convert BrainDumpParseResult to TaskNoteExtractionResult format for streaming preview
 * This extracts tasks and notes from the operations array
 */
export function convertToTaskNoteExtractionResult(
	result: BrainDumpParseResult,
	selectedProjectId?: string
): TaskNoteExtractionResult {
	if (!result || !result.operations) {
		return { tasks: [], notes: [] };
	}

	// Extract task operations
	const tasks = result.operations
		.filter((op) => op.table === 'tasks')
		.map((op) => ({
			// For updates, the id is in conditions, for creates it's generated
			id:
				op.operation === 'update' && op.conditions?.id
					? op.conditions.id
					: op.id || `temp-${Date.now()}-${Math.random()}`,
			operation: op.operation as 'create' | 'update',
			title: op.data?.title || '',
			description: op.data?.description,
			details: op.data?.details,
			priority: op.data?.priority as 'low' | 'medium' | 'high' | undefined,
			status: op.data?.status as 'backlog' | 'in_progress' | 'done' | 'blocked' | undefined,
			task_type: op.data?.task_type as 'one_off' | 'recurring' | undefined,
			project_id: op.data?.project_id || selectedProjectId,
			project_ref: op.data?.project_ref,
			duration_minutes: op.data?.duration_minutes,
			start_date: op.data?.start_date,
			end_date: op.data?.end_date,
			dependencies: op.data?.dependencies,
			task_steps: op.data?.task_steps,
			parent_task_id: op.data?.parent_task_id,
			recurrence_pattern: op.data?.recurrence_pattern,
			recurrence_ends: op.data?.recurrence_ends
		}));

	// Extract note operations
	const notes = result.operations
		.filter((op) => op.table === 'notes')
		.map((op) => ({
			// Similar handling for notes
			id:
				op.operation === 'update' && op.conditions?.id
					? op.conditions.id
					: op.id || `temp-note-${Date.now()}-${Math.random()}`,
			operation: op.operation as 'create' | 'update',
			title: op.data?.title || '',
			content: op.data?.content || '',
			category: op.data?.category,
			tags: op.data?.tags,
			project_id: op.data?.project_id || selectedProjectId,
			project_ref: op.data?.project_ref
		}));

	return { tasks, notes };
}

/**
 * Check if a result has project context changes
 */
export function hasProjectContextChanges(result: BrainDumpParseResult): boolean {
	return result?.operations?.some((op) => op.table === 'projects') || false;
}

/**
 * Check if a result has task/note changes
 */
export function hasTaskNoteChanges(result: BrainDumpParseResult): boolean {
	return result?.operations?.some((op) => op.table === 'tasks' || op.table === 'notes') || false;
}

/**
 * Extract operation counts by table for summary
 */
export function getOperationSummary(operations: ParsedOperation[]): Record<string, number> {
	const summary: Record<string, number> = {};

	operations.forEach((op) => {
		summary[op.table] = (summary[op.table] || 0) + 1;
	});

	return summary;
}

/**
 * Create a human-readable summary of operations
 */
export function createOperationSummaryText(operations: ParsedOperation[]): string {
	const counts = getOperationSummary(operations);
	const parts: string[] = [];

	if (counts.projects) {
		parts.push(`${counts.projects} project${counts.projects > 1 ? 's' : ''}`);
	}
	if (counts.tasks) {
		parts.push(`${counts.tasks} task${counts.tasks > 1 ? 's' : ''}`);
	}
	if (counts.notes) {
		parts.push(`${counts.notes} note${counts.notes > 1 ? 's' : ''}`);
	}

	if (parts.length === 0) {
		return 'No operations';
	}

	return `Processing ${parts.join(', ')}`;
}
