// apps/web/src/lib/types/operations.ts

// Shared operation-shape types used by project synthesis and calendar analysis flows.

export type TableName =
	| 'projects'
	| 'tasks'
	| 'notes'
	| 'phases'
	| 'project_context'
	| 'project_notes'
	| 'daily_briefs'
	| 'project_questions';

export type OperationType = 'create' | 'update' | 'delete';

export interface ParsedOperation {
	id: string;
	table: TableName;
	operation: OperationType;
	data: {
		// Project references - only ONE should be present
		project_id?: string;
		project_ref?: string;

		// Standard fields
		[key: string]: any;
	};
	ref?: string;
	searchQuery?: string;
	conditions?: Record<string, any>;
	enabled: boolean;
	error?: string;
	reasoning?: string;
	result?: Record<string, any>;
}

export interface ProjectOperation extends ParsedOperation {
	table: 'projects';
	operation: 'create' | 'update';
	ref?: string;
	data: {
		name: string;
		slug: string;
		description?: string;
		context?: string;
		executive_summary?: string;
		status?: 'active' | 'paused' | 'completed' | 'archived';
		tags?: string[];
		start_date?: string;
		end_date?: string;
	};
}

export interface TaskOperation extends ParsedOperation {
	table: 'tasks';
	operation: 'create' | 'update';
	data: {
		project_id?: string;
		project_ref?: string;

		title: string;
		description?: string;
		details?: string;
		priority?: 'low' | 'medium' | 'high';
		status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
		task_type?: 'one_off' | 'recurring';
		duration_minutes?: number;
		start_date?: string;
		recurrence_pattern?:
			| 'daily'
			| 'weekdays'
			| 'weekly'
			| 'biweekly'
			| 'monthly'
			| 'quarterly'
			| 'yearly';
		recurrence_ends?: string;
		dependencies?: string[];
		parent_task_id?: string;
	};
}

export interface NoteOperation extends ParsedOperation {
	table: 'notes';
	operation: 'create' | 'update';
	data: {
		project_id?: string;
		project_ref?: string;

		title?: string;
		content: string;
		category?: string;
		tags?: string[];
	};
}

export interface ExecutionResult {
	successful: ParsedOperation[];
	failed: Array<ParsedOperation & { error: string }>;
	results?: Array<{
		id: string;
		table: TableName;
		operationType: OperationType;
		[key: string]: any;
	}>;
	error?: string;
}
