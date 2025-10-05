// apps/web/src/lib/utils/calendar-task-field-config.ts
/**
 * Calendar Task Field Configuration
 *
 * Provides field configurations for editing calendar-suggested tasks.
 * Similar to field-config-generator.ts but specifically tailored for calendar tasks.
 */

import type { FieldConfig } from '$lib/utils/field-config-generator';

export interface CalendarTaskFieldConfig extends FieldConfig {
	conditionalDisplay?: (task: any) => boolean; // Show field based on conditions
	group?: string; // Group related fields (basic, scheduling, recurrence, metadata)
	readonly?: boolean; // Display only, not editable
}

export interface SuggestedTask {
	title: string;
	description: string;
	details?: string;
	status: 'backlog' | 'in_progress' | 'done' | 'blocked';
	priority: 'low' | 'medium' | 'high';
	task_type: 'one_off' | 'recurring';
	duration_minutes?: number;
	start_date?: string; // ISO format: YYYY-MM-DDTHH:MM:SS
	recurrence_pattern?:
		| 'daily'
		| 'weekdays'
		| 'weekly'
		| 'biweekly'
		| 'monthly'
		| 'quarterly'
		| 'yearly';
	recurrence_ends?: string; // ISO format: YYYY-MM-DD
	event_id?: string;
	tags?: string[];
}

/**
 * Generate field configuration for calendar task editing
 */
export function generateCalendarTaskFieldConfig(
	currentTask?: Partial<SuggestedTask>
): Record<string, CalendarTaskFieldConfig> {
	return {
		// Group 1: Basic Information
		title: {
			type: 'text',
			label: 'Task Title',
			required: true,
			placeholder: 'Enter a clear, actionable task title',
			group: 'basic'
		},
		description: {
			type: 'textarea',
			label: 'Brief Description',
			required: true,
			placeholder: 'Brief description of what needs to be done',
			rows: 2,
			group: 'basic'
		},
		details: {
			type: 'textarea',
			label: 'Detailed Information',
			required: false,
			placeholder:
				'Add comprehensive details about the task, context from calendar events, or additional notes...',
			rows: 4,
			markdown: true, // Enable markdown toggle
			group: 'basic'
		},

		// Group 2: Status and Priority
		status: {
			type: 'select',
			label: 'Status',
			required: true,
			options: ['backlog', 'in_progress', 'done', 'blocked'],
			group: 'status'
		},
		priority: {
			type: 'select',
			label: 'Priority',
			required: true,
			options: ['low', 'medium', 'high'],
			group: 'status'
		},

		// Group 3: Scheduling
		task_type: {
			type: 'select',
			label: 'Task Type',
			required: true,
			options: ['one_off', 'recurring'],
			group: 'scheduling'
		},
		duration_minutes: {
			type: 'number',
			label: 'Estimated Duration (minutes)',
			required: false,
			min: 15,
			max: 480,
			placeholder: '60',
			group: 'scheduling'
		},
		start_date: {
			type: 'datetime-local',
			label: 'Start Date & Time',
			required: false,
			group: 'scheduling'
		},

		// Group 4: Recurrence (conditional - only show if task_type is 'recurring')
		recurrence_pattern: {
			type: 'select',
			label: 'Recurrence Pattern',
			required: false, // Conditionally required if task_type='recurring'
			options: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
			conditionalDisplay: (task) => task?.task_type === 'recurring',
			group: 'recurrence'
		},
		recurrence_ends: {
			type: 'date',
			label: 'Recurrence End Date',
			required: false,
			conditionalDisplay: (task) => task?.task_type === 'recurring',
			group: 'recurrence'
		},

		// Group 5: Metadata
		event_id: {
			type: 'text',
			label: 'Linked Calendar Event',
			required: false,
			readonly: true, // Display only, not editable
			group: 'metadata'
		},
		tags: {
			type: 'tags',
			label: 'Tags',
			required: false,
			placeholder: 'Enter tags separated by commas (e.g., "planning, team, sprint")',
			group: 'metadata'
		}
	};
}

/**
 * Validate calendar task data
 * Returns array of error messages (empty if valid)
 */
export function validateCalendarTask(task: Partial<SuggestedTask>): string[] {
	const errors: string[] = [];

	// Required fields
	if (!task.title || task.title.trim().length === 0) {
		errors.push('Task title is required');
	}
	if (task.title && task.title.length > 255) {
		errors.push('Task title must be 255 characters or less');
	}
	if (!task.description || task.description.trim().length === 0) {
		errors.push('Brief description is required');
	}

	// Enum validations
	const validStatuses = ['backlog', 'in_progress', 'done', 'blocked'];
	if (!task.status) {
		errors.push('Status is required');
	} else if (!validStatuses.includes(task.status)) {
		errors.push('Invalid status value');
	}

	const validPriorities = ['low', 'medium', 'high'];
	if (!task.priority) {
		errors.push('Priority is required');
	} else if (!validPriorities.includes(task.priority)) {
		errors.push('Invalid priority value');
	}

	const validTaskTypes = ['one_off', 'recurring'];
	if (!task.task_type) {
		errors.push('Task type is required');
	} else if (!validTaskTypes.includes(task.task_type)) {
		errors.push('Invalid task type');
	}

	// Conditional validations for recurring tasks
	if (task.task_type === 'recurring') {
		if (!task.recurrence_pattern) {
			errors.push('Recurrence pattern is required for recurring tasks');
		} else {
			const validPatterns = [
				'daily',
				'weekdays',
				'weekly',
				'biweekly',
				'monthly',
				'quarterly',
				'yearly'
			];
			if (!validPatterns.includes(task.recurrence_pattern)) {
				errors.push('Invalid recurrence pattern');
			}
		}
	}

	// Date validations
	if (task.start_date) {
		const date = new Date(task.start_date);
		if (isNaN(date.getTime())) {
			errors.push('Invalid start date format');
		}
	}

	if (task.recurrence_ends) {
		const date = new Date(task.recurrence_ends);
		if (isNaN(date.getTime())) {
			errors.push('Invalid recurrence end date format');
		}

		// Validate that recurrence_ends is in the future
		if (date < new Date()) {
			errors.push('Recurrence end date must be in the future');
		}
	}

	// Number validations
	if (task.duration_minutes !== undefined && task.duration_minutes !== null) {
		if (task.duration_minutes < 15) {
			errors.push('Duration must be at least 15 minutes');
		}
		if (task.duration_minutes > 480) {
			errors.push('Duration must be less than 480 minutes (8 hours)');
		}
		if (!Number.isInteger(task.duration_minutes)) {
			errors.push('Duration must be a whole number');
		}
	}

	return errors;
}

/**
 * Get field groups for organizing fields in the UI
 */
export function getFieldGroups(): Array<{
	id: string;
	label: string;
	fields: string[];
}> {
	return [
		{
			id: 'basic',
			label: 'Basic Information',
			fields: ['title', 'description', 'details']
		},
		{
			id: 'status',
			label: 'Status & Priority',
			fields: ['status', 'priority']
		},
		{
			id: 'scheduling',
			label: 'Scheduling',
			fields: ['task_type', 'duration_minutes', 'start_date']
		},
		{
			id: 'recurrence',
			label: 'Recurrence Settings',
			fields: ['recurrence_pattern', 'recurrence_ends']
		},
		{
			id: 'metadata',
			label: 'Additional Information',
			fields: ['event_id', 'tags']
		}
	];
}

/**
 * Get default values for a new calendar task
 */
export function getDefaultCalendarTask(): SuggestedTask {
	return {
		title: '',
		description: '',
		status: 'backlog',
		priority: 'medium',
		task_type: 'one_off'
	};
}
