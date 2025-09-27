// src/lib/utils/field-config-generator.ts
import type { Database } from '$lib/database.types';

// Extract table names from the database
type TableName = keyof Database['public']['Tables'];

// Extract insert type for a table
type TableInsertType<T extends TableName> = Database['public']['Tables'][T]['Insert'];

// Field configuration interface
export interface FieldConfig {
	type:
		| 'text'
		| 'textarea'
		| 'select'
		| 'date'
		| 'datetime-local'
		| 'number'
		| 'tags'
		| 'boolean'
		| 'jsonb';
	required: boolean;
	label: string;
	options?: string[];
	min?: number;
	max?: number;
	placeholder?: string;
	markdown?: boolean;
}

// Fields to exclude from editing (system fields)
const EXCLUDED_FIELDS = ['id', 'user_id', 'created_at', 'updated_at', 'embedding'];

// Field type mappings based on field names and patterns
const FIELD_TYPE_PATTERNS: Record<string, Partial<FieldConfig>> = {
	// Datetime fields (timestamptz in database)
	start_date: { type: 'datetime-local' },

	// Date fields
	_date$: { type: 'date' },
	_at$: { type: 'date' },
	deadline: { type: 'date' },
	target_date: { type: 'date' },
	completion_date: { type: 'date' },
	end_date: { type: 'date' },
	recurrence_ends: { type: 'date' },

	// Text areas (longer content)
	description: { type: 'textarea', markdown: true },
	content: { type: 'textarea', markdown: true },
	notes: { type: 'textarea', markdown: true },
	details: { type: 'textarea', markdown: true },
	vision: { type: 'textarea', markdown: true },
	goals: { type: 'textarea', markdown: true },
	phases: { type: 'textarea', markdown: true },
	target_users: { type: 'textarea' },
	growth_strategy: { type: 'textarea' },
	brand_voice: { type: 'textarea' },
	current_problems: { type: 'textarea' },
	tech_stack: { type: 'textarea' },
	why: { type: 'textarea', markdown: true },
	milestones: { type: 'textarea' },
	obstacles: { type: 'textarea' },
	accountability_plan: { type: 'textarea' },
	environment_design: { type: 'textarea' },
	inspiration_sources: { type: 'textarea' },
	lessons_learned: { type: 'textarea' },
	motivation_triggers: { type: 'textarea' },
	required_habits: { type: 'textarea' },
	resources_needed: { type: 'textarea' },
	reward_system: { type: 'textarea' },
	success_metrics: { type: 'textarea' },
	support_system: { type: 'textarea' },
	systems_to_build: { type: 'textarea' },
	adjustments_made: { type: 'textarea' },
	current_state: { type: 'textarea' },
	actions_to_do: { type: 'textarea' },
	assets: { type: 'textarea' },
	differentiators: { type: 'textarea' },
	feelings_to_invoke: { type: 'textarea' },
	inspiration: { type: 'textarea' },
	keywords: { type: 'textarea' },
	llm_prompt_examples: { type: 'textarea' },
	recent_updates: { type: 'textarea' },
	social_media_accounts: { type: 'textarea' },
	team_notes: { type: 'textarea' },
	thoughts_to_think: { type: 'textarea' },
	ai_insights: { type: 'textarea', markdown: true },
	ai_summary: { type: 'textarea', markdown: true },
	recurrence_pattern: { type: 'textarea' },
	executive_summary: { type: 'textarea', markdown: true },
	context: { type: 'textarea', markdown: true }, // Changed from jsonb to textarea

	// Tags/arrays
	tags: { type: 'tags' },
	dependencies: { type: 'tags' },

	// Numbers
	progress: { type: 'number', min: 0, max: 100 },
	goal_count: { type: 'number', min: 1 },
	context_version: { type: 'number', min: 1 },
	duration_minutes: { type: 'number', min: 15, max: 480 },

	// Timestamps
	deleted_at: { type: 'date' }
};

// Predefined select options for known fields
const SELECT_OPTIONS: Record<string, string[]> = {
	status: {
		tasks: ['backlog', 'in_progress', 'done', 'blocked'],
		projects: ['active', 'paused', 'completed', 'archived']
	},
	priority: {
		tasks: ['low', 'medium', 'high', 'urgent']
	},
	task_type: {
		tasks: ['one_off', 'recurring']
	},
	category: {},
	frequency: {
		default: ['daily', 'weekly', 'monthly', 'yearly']
	}
};

function getSelectOptions(fieldName: string, tableName: string): string[] | undefined {
	const fieldOptions = SELECT_OPTIONS[fieldName];
	if (!fieldOptions) return undefined;

	if (typeof fieldOptions === 'object' && !Array.isArray(fieldOptions)) {
		return fieldOptions[tableName] || fieldOptions.default;
	}

	return Array.isArray(fieldOptions) ? fieldOptions : undefined;
}

function matchesPattern(fieldName: string, pattern: string): boolean {
	return new RegExp(pattern, 'i').test(fieldName);
}

function getFieldTypeFromPatterns(fieldName: string): Partial<FieldConfig> {
	for (const [pattern, config] of Object.entries(FIELD_TYPE_PATTERNS)) {
		if (fieldName === pattern || matchesPattern(fieldName, pattern)) {
			return config;
		}
	}
	return { type: 'text' };
}

// Define required fields based on table and operation type
const REQUIRED_FIELDS: Record<string, { create: string[]; update: string[] }> = {
	projects: {
		create: ['name', 'slug', 'context'],
		update: [] // No required fields for updates
	},
	tasks: {
		create: ['title'],
		update: [] // No required fields for updates
	},
	notes: {
		create: [], // Either title or content required, but handled separately
		update: []
	}
};

function isFieldRequired<T extends TableName>(
	fieldName: string,
	tableName: T,
	operationType: 'create' | 'update'
): boolean {
	const tableRequirements = REQUIRED_FIELDS[tableName];
	if (!tableRequirements) return false;

	const requiredFields = tableRequirements[operationType] || [];
	return requiredFields.includes(fieldName);
}

function formatLabel(fieldName: string): string {
	return fieldName
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export function generateFieldConfig<T extends TableName>(
	tableName: T,
	customOverrides: Partial<Record<string, Partial<FieldConfig>>> = {},
	operationType: 'create' | 'update' = 'create'
): Record<string, FieldConfig> {
	// Get the insert type for the table (we use Insert type to determine required fields)
	type InsertType = TableInsertType<T>;

	// For demo purposes, we'll create a sample insert type structure
	// In practice, you might need to introspect this more carefully
	const sampleInsertType = {} as InsertType;

	// Get all possible fields from the database schema
	// This is a simplified approach - you might want to use a more sophisticated type introspection
	const allFields = getAllFieldsForTable(tableName);

	const config: Record<string, FieldConfig> = {};

	for (const fieldName of allFields) {
		// Skip excluded fields
		if (EXCLUDED_FIELDS.includes(fieldName)) continue;

		// Get base config from patterns
		const patternConfig = getFieldTypeFromPatterns(fieldName);

		// Determine if field is required based on operation type
		const required = isFieldRequired(fieldName, tableName, operationType);

		// Check for select options
		const options = getSelectOptions(fieldName, tableName);
		if (options) {
			patternConfig.type = 'select';
			patternConfig.options = options;
		}

		// Create final config
		const finalConfig: FieldConfig = {
			type: 'text',
			required,
			label: formatLabel(fieldName),
			...patternConfig,
			...customOverrides[fieldName]
		};

		config[fieldName] = finalConfig;
	}

	return config;
}

// Helper function to get all fields for a table
// This would need to be implemented based on your specific setup
function getAllFieldsForTable(tableName: TableName): string[] {
	// This is a mapping based on your database schema
	// You could generate this automatically or maintain it manually
	const tableFields: Record<TableName, string[]> = {
		tasks: [
			'title',
			'description',
			'details',
			'status',
			'priority',
			'start_date',
			'project_id',
			'parent_task_id',
			'task_type',
			'duration_minutes',
			'dependencies',
			'recurrence_pattern',
			'recurrence_ends',
			'completed_at',
			'deleted_at'
		],
		projects: [
			'name',
			'slug',
			'description',
			'status',
			'start_date',
			'end_date',
			'tags',
			'context', // Now stored directly in projects table
			'executive_summary' // Now stored directly in projects table
		],
		notes: ['title', 'content', 'project_id', 'tags', 'category'],
		brain_dumps: ['title', 'content', 'tags', 'ai_summary', 'ai_insights', 'linked_data']
	};

	return tableFields[tableName] || [];
}

// Convenience function to get field config for a specific field
export function getFieldConfig(tableName: TableName, fieldName: string): FieldConfig {
	const tableConfig = generateFieldConfig(tableName);
	return (
		tableConfig[fieldName] || {
			type: 'text',
			required: false,
			label: formatLabel(fieldName)
		}
	);
}

// Export function to get all table fields
export function getTableFields(tableName: TableName): string[] {
	return getAllFieldsForTable(tableName);
}
