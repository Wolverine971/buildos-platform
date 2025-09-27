// src/lib/utils/operations/validation-schemas.ts
import type { FieldValidation } from './types';

// UUID validation regex
export const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Table validation schemas
export const tableSchemas: Record<string, Record<string, FieldValidation>> = {
	projects: {
		name: { required: true, type: 'string', maxLength: 255 },
		description: { type: 'string' },
		status: {
			type: 'string',
			enum: ['active', 'paused', 'completed', 'archived']
		},
		start_date: { type: 'date' },
		end_date: { type: 'date' },
		context: { type: 'string' },
		executive_summary: { type: 'string' },
		slug: { required: true, type: 'string' },
		tags: { type: 'array', arrayType: 'string' },
		user_id: { type: 'uuid' }
	},

	tasks: {
		title: { required: true, type: 'string', maxLength: 255 },
		description: { type: 'string' },
		details: { type: 'string' },
		status: {
			type: 'string',
			enum: ['backlog', 'in_progress', 'done', 'blocked']
		},
		priority: { type: 'string', enum: ['low', 'medium', 'high'] },
		start_date: { type: 'date' },
		completed_at: { type: 'date' },
		dependencies: { type: 'array', arrayType: 'uuid' },
		project_id: { type: 'uuid' },
		parent_task_id: { type: 'uuid' },
		task_type: { type: 'string', enum: ['one_off', 'recurring'] },
		recurrence_pattern: {
			type: 'string',
			enum: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
		},
		recurrence_ends: { type: 'date' },
		duration_minutes: { type: 'number' },
		deleted_at: { type: 'date' },
		outdated: { type: 'boolean' },
		user_id: { type: 'uuid' }
	},

	brain_dumps: {
		title: { type: 'string', maxLength: 255 },
		content: { type: 'string' },
		ai_insights: { type: 'string' },
		ai_summary: { type: 'string' },
		status: {
			type: 'string',
			enum: ['pending', 'parsed', 'saved', 'parsed_and_deleted']
		},
		tags: { type: 'array', arrayType: 'string' },
		project_id: { type: 'uuid' },
		user_id: { type: 'uuid' }
	},

	notes: {
		title: { type: 'string', maxLength: 255 },
		content: { type: 'string' },
		category: { type: 'string' },
		tags: { type: 'array', arrayType: 'string' },
		project_id: { type: 'uuid' },
		user_id: { type: 'uuid' }
	},

	phases: {
		name: { required: true, type: 'string', maxLength: 255 },
		description: { type: 'string' },
		project_id: { type: 'uuid', required: true },
		start_date: { type: 'date', required: true },
		end_date: { type: 'date', required: true },
		order: { type: 'number', required: true },
		scheduling_method: { type: 'string' },
		user_id: { type: 'uuid' }
	},

	daily_briefs: {
		brief_date: { type: 'date', required: true },
		summary_content: { type: 'string', required: true },
		insights: { type: 'string' },
		priority_actions: { type: 'array', arrayType: 'string' },
		project_brief_ids: { type: 'array', arrayType: 'string' },
		generation_status: { type: 'string' },
		generation_started_at: { type: 'date' },
		generation_completed_at: { type: 'date' },
		generation_error: { type: 'string' },
		generation_progress: { type: 'jsonb' },
		metadata: { type: 'jsonb' },
		user_id: { type: 'uuid' }
	},

	project_questions: {
		question: { required: true, type: 'string' },
		project_id: { type: 'uuid' },
		category: { type: 'string' },
		priority: { type: 'string', enum: ['low', 'medium', 'high'] },
		context: { type: 'string' },
		expected_outcome: { type: 'string' },
		status: { type: 'string' },
		source: { type: 'string' },
		source_field: { type: 'string' },
		triggers: { type: 'jsonb' },
		shown_to_user_count: { type: 'number' },
		answered_at: { type: 'date' },
		answer_brain_dump_id: { type: 'uuid' },
		user_id: { type: 'uuid' }
	}
};

// Field type mappings for validation
export const fieldTypeMappings: Record<string, string[]> = {
	string: ['text', 'varchar', 'char'],
	uuid: ['uuid'],
	date: ['date', 'timestamp', 'timestamptz'],
	boolean: ['bool', 'boolean'],
	number: ['int', 'integer', 'bigint', 'decimal', 'numeric', 'real', 'double precision', 'float'],
	array: ['array', '_text', '_uuid'],
	jsonb: ['jsonb', 'json']
};
