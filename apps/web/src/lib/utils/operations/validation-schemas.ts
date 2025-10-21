// apps/web/src/lib/utils/operations/validation-schemas.ts
import type { FieldValidation } from './types';

// UUID validation regex
export const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Table validation schemas - ONLY for tables that users can directly manipulate
 *
 * ⚠️ SECURITY: These schemas define what fields users can modify.
 * Only include tables that should be user-accessible through brain dump operations.
 *
 * Schemas are based on @buildos/shared-types database.types.ts
 * Last synced: 2025-10-04
 */
export const tableSchemas: Record<string, Record<string, FieldValidation>> = {
	projects: {
		// Required fields (from TablesInsert<'projects'>)
		name: { required: true, type: 'string', maxLength: 255 },
		slug: { required: true, type: 'string' },

		// Optional fields
		description: { type: 'string' },
		status: {
			type: 'string',
			enum: ['active', 'paused', 'completed', 'archived']
		},
		start_date: { type: 'date' },
		end_date: { type: 'date' },
		context: { type: 'string' },
		executive_summary: { type: 'string' },
		tags: { type: 'array', arrayType: 'string' },

		// Core dimension fields (extracted from brain dumps via preparatory analysis)
		core_context_descriptions: { type: 'jsonb' },
		core_goals_momentum: { type: 'string' },
		core_harmony_integration: { type: 'string' },
		core_integrity_ideals: { type: 'string' },
		core_meaning_identity: { type: 'string' },
		core_opportunity_freedom: { type: 'string' },
		core_people_bonds: { type: 'string' },
		core_power_resources: { type: 'string' },
		core_reality_understanding: { type: 'string' },
		core_trust_safeguards: { type: 'string' },

		// Calendar-related fields
		calendar_color_id: { type: 'string' },
		calendar_settings: { type: 'jsonb' },
		calendar_sync_enabled: { type: 'boolean' },

		// Metadata fields
		source: { type: 'string' },
		source_metadata: { type: 'jsonb' },

		// System fields (usually auto-populated, but allowed for operations)
		user_id: { type: 'uuid' },
		created_at: { type: 'date' },
		updated_at: { type: 'date' }
	},

	tasks: {
		// Required fields (from TablesInsert<'tasks'>)
		title: { required: true, type: 'string', maxLength: 255 },

		// Optional fields
		description: { type: 'string' },
		details: { type: 'string' },
		status: {
			type: 'string',
			enum: ['backlog', 'in_progress', 'done', 'blocked']
		},
		priority: { type: 'string', enum: ['low', 'medium', 'high'] },
		start_date: { type: 'date' },
		completed_at: { type: 'date' },
		deleted_at: { type: 'date' },

		// Relationships
		dependencies: { type: 'array', arrayType: 'uuid' },
		project_id: { type: 'uuid' },
		parent_task_id: { type: 'uuid' },

		// Recurring task fields
		task_type: { type: 'string', enum: ['one_off', 'recurring'] },
		recurrence_pattern: {
			type: 'string',
			enum: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
		},
		recurrence_ends: { type: 'date' },
		recurrence_end_source: { type: 'string' },

		// Task metadata
		duration_minutes: { type: 'number' },
		outdated: { type: 'boolean' },
		task_steps: { type: 'string' },

		// Source tracking
		source: { type: 'string' },
		source_calendar_event_id: { type: 'string' },

		// System fields
		user_id: { type: 'uuid' },
		created_at: { type: 'date' },
		updated_at: { type: 'date' }
	},

	notes: {
		// No required fields for notes (title or content must be present, validated in custom validation)
		title: { type: 'string', maxLength: 255 },
		content: { type: 'string' },
		category: { type: 'string' },
		tags: { type: 'array', arrayType: 'string' },
		project_id: { type: 'uuid' },

		// System fields
		user_id: { type: 'uuid' },
		created_at: { type: 'date' },
		updated_at: { type: 'date' }
	},

	project_questions: {
		// Required fields
		question: { required: true, type: 'string' },

		// Optional fields
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

		// System fields
		user_id: { type: 'uuid' },
		created_at: { type: 'date' },
		updated_at: { type: 'date' }
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
