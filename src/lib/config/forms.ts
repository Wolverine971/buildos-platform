// src/lib/config/forms.ts
import type { FormConfig } from '$lib/types/form';

export const noteFormConfig: FormConfig = {
	title: {
		type: 'text',
		label: 'Title',
		required: true,
		placeholder: 'Note title'
	},
	content: {
		type: 'textarea',
		label: 'Content',
		required: true,
		placeholder: 'Write your note using **markdown** formatting...',
		rows: 8,
		markdown: true
	},
	category: {
		type: 'select',
		label: 'Category',
		options: ['insight', 'research', 'idea', 'observation', 'reference', 'question'],
		placeholder: 'Select a category'
	},
	tags: {
		type: 'tags',
		label: 'Tags',
		placeholder: 'tag1, tag2, tag3',
		description: 'Separate tags with commas'
	}
};

export const taskFormConfig: FormConfig = {
	title: {
		type: 'text',
		label: 'Title',
		required: true,
		placeholder: 'What needs to be done?'
	},
	description: {
		type: 'textarea',
		label: 'Description',
		placeholder: 'Add a succinct description...',
		rows: 4,
		markdown: true
	},
	details: {
		type: 'textarea',
		label: 'Details',
		placeholder: 'Add details using **bold**, *italic*, and other markdown...',
		rows: 4,
		markdown: true
	},
	status: {
		type: 'select',
		label: 'Status',
		options: ['backlog', 'in_progress', 'done', 'blocked'],
		required: true
	},
	priority: {
		type: 'select',
		label: 'Priority',
		options: ['low', 'medium', 'high'],
		required: true
	},
	task_type: {
		type: 'select',
		label: 'Task Type',
		options: ['one_off', 'recurring'],
		required: true,
		defaultValue: 'one_off' // Set default value for task_type
	},
	start_date: {
		type: 'datetime-local',
		label: 'Start Date & Time',
		description:
			'Leave empty for unscheduled tasks. Tasks with dates will be automatically added to your calendar.'
	},
	duration_minutes: {
		type: 'number',
		label: 'Duration (minutes)',
		placeholder: '60',
		description: 'How long this task should take',
		defaultValue: '60' // Set default value for task_type
	},
	deleted_at: {
		type: 'datetime-local',
		label: 'Deletion Date',
		description: 'When this task was deleted (soft deletion)'
	}
};

// Optional: Add recurring task specific form config if needed
export const recurringTaskFormConfig: FormConfig = {
	...taskFormConfig,
	recurrence_pattern: {
		type: 'select',
		label: 'Recurrence Pattern',
		options: ['daily', 'weekly', 'monthly'],
		description: 'How often should this task repeat?'
	},
	recurrence_ends: {
		type: 'date',
		label: 'Recurrence Ends',
		description: 'When should the recurring task stop?'
	}
};
