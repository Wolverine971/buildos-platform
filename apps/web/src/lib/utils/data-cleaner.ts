// apps/web/src/lib/utils/data-cleaner.ts
import type { Database } from '@buildos/shared-types';

// --- Validation utilities --------------------------------------------------
const validators = {
	uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	time: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
	slug: /^[a-z0-9-]+$/,
	email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

	isValidUUID: (uuid: string): boolean => validators.uuid.test(uuid),
	isValidDate: (d: string): boolean => !isNaN(new Date(d).getTime()),
	isValidTime: (t: string): boolean => validators.time.test(t),
	isValidSlug: (s: string): boolean => validators.slug.test(s),
	isValidEmail: (e: string): boolean => validators.email.test(e)
};

// --- Generic cleaners ------------------------------------------------------
const cleaners = {
	string: (v: any, maxLen?: number): string | null => {
		if (v === null || v === undefined) return null;
		const str = String(v).trim();
		if (!str) return null;
		return maxLen ? str.slice(0, maxLen) : str;
	},

	array: (v: any): string[] | null => {
		if (!v) return null;
		if (Array.isArray(v)) {
			const arr = v
				.map(String)
				.map((s) => s.trim())
				.filter(Boolean);
			return arr.length ? arr : null;
		}
		// Try parsing JSON
		try {
			const parsed = JSON.parse(v);
			if (Array.isArray(parsed)) return cleaners.array(parsed);
		} catch {
			/* ignore */
		}
		// Try splitting comma-separated string
		if (typeof v === 'string') {
			const arr = v
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			return arr.length ? arr : null;
		}
		return null;
	},

	number: (v: any, min?: number, max?: number): number | null => {
		if (v === null || v === undefined || v === '') return null;
		const n = Number(v);
		if (isNaN(n)) return null;
		if (min !== undefined && n < min) return min;
		if (max !== undefined && n > max) return max;
		return n;
	},

	boolean: (v: any): boolean | null => {
		if (v === null || v === undefined) return null;
		if (typeof v === 'boolean') return v;
		if (v === 'true' || v === 1 || v === '1') return true;
		if (v === 'false' || v === 0 || v === '0') return false;
		return null;
	},

	date: (v: any): string | null => {
		if (!v) return null;
		const s = String(v).trim();
		if (!validators.isValidDate(s)) return null;

		// For date-only values (YYYY-MM-DD format), we want to preserve
		// the exact date without timezone conversion
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
			// Already in YYYY-MM-DD format, return as-is
			return s;
		}

		// For ISO timestamp strings or other date formats, parse directly
		const date = new Date(s);
		if (isNaN(date.getTime())) {
			// If direct parsing fails, try adding time for date-only strings
			// (but only if it doesn't already contain time info)
			if (!s.includes('T') && !s.includes(':')) {
				const dateWithTime = new Date(s + 'T12:00:00');
				if (isNaN(dateWithTime.getTime())) return null;

				const year = dateWithTime.getFullYear();
				const month = String(dateWithTime.getMonth() + 1).padStart(2, '0');
				const day = String(dateWithTime.getDate()).padStart(2, '0');
				return `${year}-${month}-${day}`;
			}
			return null;
		}

		// Format as YYYY-MM-DD
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');

		return `${year}-${month}-${day}`;
	},

	timestamp: (v: any): string | null => {
		if (!v) return null;
		const s = String(v).trim();
		return validators.isValidDate(s) ? new Date(s).toISOString() : null;
	},

	time: (v: any): string | null => {
		if (!v) return null;
		const s = String(v).trim();
		return validators.isValidTime(s) ? s : null;
	},

	uuid: (v: any): string | null => {
		if (!v) return null;
		const s = String(v).trim();
		return validators.isValidUUID(s) ? s : null;
	},

	json: (v: any): any => {
		if (!v) return null;
		if (typeof v === 'object') return v;
		try {
			return JSON.parse(v);
		} catch {
			return null;
		}
	},

	enum: <T extends string>(v: any, values: readonly T[]): T | null => {
		if (!v) return null;
		const s = String(v).trim();
		return values.includes(s as T) ? (s as T) : null;
	}
};

// --- Table schema definitions ----------------------------------------------
const tableSchemas = {
	projects: {
		id: { type: 'uuid' },
		user_id: { type: 'uuid', required: true },
		name: { type: 'string', maxLength: 255, required: true },
		slug: { type: 'slug', maxLength: 255 },
		description: { type: 'string' },
		context: { type: 'string' },
		executive_summary: { type: 'string' },
		status: { type: 'enum', values: ['active', 'paused', 'completed', 'archived'] },
		start_date: { type: 'date' },
		end_date: { type: 'date' },
		tags: { type: 'array' },

		// Core dimension fields (extracted from brain dumps via preparatory analysis)
		core_context_descriptions: { type: 'json' },
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
		calendar_settings: { type: 'json' },
		calendar_sync_enabled: { type: 'boolean' },

		// Metadata fields
		source: { type: 'string' },
		source_metadata: { type: 'json' },

		created_at: { type: 'timestamp' },
		updated_at: { type: 'timestamp' }
	},

	tasks: {
		id: { type: 'uuid' },
		user_id: { type: 'uuid', required: true },
		project_id: { type: 'uuid' },
		parent_task_id: { type: 'uuid' },
		title: { type: 'string', maxLength: 255, required: true },
		description: { type: 'string' },
		details: { type: 'string' },
		status: { type: 'enum', values: ['backlog', 'in_progress', 'done', 'blocked'] },
		priority: { type: 'enum', values: ['low', 'medium', 'high'] },
		task_type: { type: 'enum', values: ['one_off', 'recurring'] },
		deleted_at: { type: 'timestamp' },
		dependencies: { type: 'json' },
		start_date: { type: 'date' },
		completed_at: { type: 'timestamp' },
		duration_minutes: { type: 'number', min: 0 },
		recurrence_pattern: { type: 'string' },
		recurrence_ends: { type: 'date' },
		tags: { type: 'array' },
		position: { type: 'number' },
		created_at: { type: 'timestamp' },
		updated_at: { type: 'timestamp' }
	},

	notes: {
		id: { type: 'uuid' },
		user_id: { type: 'uuid', required: true },
		project_id: { type: 'uuid' },
		title: { type: 'string', maxLength: 255 },
		content: { type: 'string' },
		category: { type: 'string', maxLength: 100 },
		tags: { type: 'array' },
		pinned: { type: 'boolean' },
		created_at: { type: 'timestamp' },
		updated_at: { type: 'timestamp' }
	},

	brain_dumps: {
		id: { type: 'uuid' },
		user_id: { type: 'uuid', required: true },
		project_id: { type: 'uuid' },
		title: { type: 'string', maxLength: 255 },
		content: { type: 'string', required: true },
		status: { type: 'enum', values: ['draft', 'saved', 'processed'] },
		tags: { type: 'array' },
		ai_insights: { type: 'json' },
		ai_summary: { type: 'string' },
		created_at: { type: 'timestamp' },
		updated_at: { type: 'timestamp' }
	},

	phases: {
		id: { type: 'uuid' },
		project_id: { type: 'uuid', required: true },
		name: { type: 'string', maxLength: 255, required: true },
		description: { type: 'string' },
		status: { type: 'enum', values: ['planning', 'active', 'completed', 'on_hold'] },
		start_date: { type: 'date' },
		end_date: { type: 'date' },
		position: { type: 'number' },
		color: { type: 'string', maxLength: 7 },
		created_at: { type: 'timestamp' },
		updated_at: { type: 'timestamp' }
	}
} as const;

// --- Main cleaner function -------------------------------------------------
export function cleanDataForTable(table: string, data: any): Record<string, any> {
	const schema = tableSchemas[table as keyof typeof tableSchemas];
	if (!schema) {
		console.warn(`No schema defined for table: ${table}`);
		return data;
	}

	const cleaned: Record<string, any> = {};

	// Handle user_id aliasing
	if (data.userId && !data.user_id) {
		data.user_id = data.userId;
	}

	for (const [field, config] of Object.entries(schema)) {
		// Check if field exists in data (including explicit null)
		if (!(field in data)) continue;

		const value = data[field];

		// For explicit null values, preserve them to allow clearing fields
		if (value === null) {
			cleaned[field] = null;
			continue;
		}

		// Clean based on type
		switch (config.type) {
			case 'uuid':
				const uuid = cleaners.uuid(value);
				if (uuid) cleaned[field] = uuid;
				break;

			case 'string':
				const str = cleaners.string(value, (config as any).maxLength);
				// Preserve null for strings to allow clearing
				if (str !== null) cleaned[field] = str;
				else if (value === '') cleaned[field] = null; // Empty string -> null
				break;

			case 'slug':
				const slug = cleaners.string(value, (config as any).maxLength);
				if (slug && validators.isValidSlug(slug)) {
					cleaned[field] = slug;
				}
				break;

			case 'array':
				const arr = cleaners.array(value);
				if (arr) cleaned[field] = arr;
				else if (value === null || (Array.isArray(value) && value.length === 0)) {
					cleaned[field] = null; // Allow clearing arrays
				}
				break;

			case 'number':
				const num = cleaners.number(value, (config as any).min, (config as any).max);
				if (num !== null) cleaned[field] = num;
				break;

			case 'boolean':
				const bool = cleaners.boolean(value);
				if (bool !== null) cleaned[field] = bool;
				break;

			case 'date':
				const date = cleaners.date(value);
				if (date) cleaned[field] = date;
				else if (value === '') cleaned[field] = null; // Empty string -> null for dates
				break;

			case 'timestamp':
				const ts = cleaners.timestamp(value);
				if (ts) cleaned[field] = ts;
				else if (value === '') cleaned[field] = null; // Empty string -> null
				break;

			case 'time':
				const time = cleaners.time(value);
				if (time) cleaned[field] = time;
				else if (value === '') cleaned[field] = null; // Empty string -> null
				break;

			case 'json':
				const json = cleaners.json(value);
				if (json !== null && json !== undefined) cleaned[field] = json;
				else cleaned[field] = null; // Allow clearing JSON fields
				break;

			case 'enum':
				const enumVal = cleaners.enum(value, (config as any).values);
				if (enumVal) cleaned[field] = enumVal;
				break;
		}
	}

	return cleaned;
}

// --- Validation function --------------------------------------------------
export function validateRequiredFields(
	table: string,
	data: any,
	operation: 'create' | 'update' = 'create'
): { isValid: boolean; missingFields: string[] } {
	if (operation === 'update') {
		// Updates don't require any specific fields
		return { isValid: true, missingFields: [] };
	}

	const schema = tableSchemas[table as keyof typeof tableSchemas];
	if (!schema) {
		return { isValid: true, missingFields: [] };
	}

	const missingFields: string[] = [];

	for (const [field, config] of Object.entries(schema)) {
		if ((config as any).required && !data[field]) {
			missingFields.push(field);
		}
	}

	return {
		isValid: missingFields.length === 0,
		missingFields
	};
}

// --- Embedding preparation ------------------------------------------------
export function cleanDataForEmbedding(data: any, table: string): string | null {
	if (!data || !table) return null;

	const embeddingFields = {
		projects: [
			'name',
			'description',
			'status',
			'tags',
			'context',
			'executive_summary',
			// Include core dimensions for semantic search
			'core_integrity_ideals',
			'core_people_bonds',
			'core_goals_momentum',
			'core_meaning_identity',
			'core_reality_understanding',
			'core_trust_safeguards',
			'core_opportunity_freedom',
			'core_power_resources',
			'core_harmony_integration'
		],
		tasks: ['title', 'description', 'priority', 'status', 'task_type', 'details'],
		notes: ['title', 'content', 'category', 'tags'],
		brain_dumps: ['title', 'content', 'ai_summary'],
		phases: ['name', 'description', 'status']
	};

	const fields = embeddingFields[table as keyof typeof embeddingFields];
	if (!fields) {
		return JSON.stringify(data);
	}

	const parts = fields
		.map((field) => {
			const value = data[field];
			if (Array.isArray(value)) {
				return value.join(' ');
			}
			return value;
		})
		.filter(Boolean);

	return parts.join(' ');
}

// --- Legacy exports for backward compatibility ----------------------------
export const cleanProjectData = (data: any) => cleanDataForTable('projects', data);
export const cleanTaskData = (data: any) => cleanDataForTable('tasks', data);
export const cleanNoteData = (data: any) => cleanDataForTable('notes', data);
export const cleanBrainDumpData = (data: any) => cleanDataForTable('brain_dumps', data);
