// apps/web/src/lib/utils/operations/validation-utils.ts
import { UUID_REGEX } from './validation-schemas';

// Generate slug from text
export const generateSlug = (text: string): string => {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, '') // Remove special characters
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
		.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Date validation - accepts ISO strings, Date objects, or YYYY-MM-DD format
export const isValidDate = (value: any): boolean => {
	if (!value) return true; // null/undefined dates are valid

	// If it's already a Date object
	if (value instanceof Date) {
		return !isNaN(value.getTime());
	}

	// Try to parse as string
	if (typeof value === 'string') {
		// Check for YYYY-MM-DD format
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			const date = new Date(value + 'T00:00:00');
			return !isNaN(date.getTime());
		}

		// Try general date parsing
		const date = new Date(value);
		return !isNaN(date.getTime());
	}

	return false;
};

// Convert various date formats to YYYY-MM-DD
export const normalizeDate = (value: any): string | null => {
	if (!value) return null;

	let date: Date;
	if (value instanceof Date) {
		date = value;
	} else if (typeof value === 'string') {
		// If already in YYYY-MM-DD format, return as is
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return value;
		}
		date = new Date(value);
	} else {
		return null;
	}

	if (isNaN(date.getTime())) return null;

	// Convert to YYYY-MM-DD format
	return date.toISOString().split('T')[0] || null;
};

// Validate UUID format
export const isValidUUID = (value: string): boolean => {
	return UUID_REGEX.test(value);
};

// Sanitize string value
export const sanitizeString = (value: any, maxLength?: number): string | null => {
	if (value === null || value === undefined) return null;

	let str = String(value).trim();
	if (maxLength && str.length > maxLength) {
		str = str.substring(0, maxLength);
	}

	return str || null;
};

// Sanitize array values
export const sanitizeArray = (value: any, arrayType?: 'uuid' | 'string'): any[] | null => {
	if (!value) return null;
	if (!Array.isArray(value)) return null;

	if (arrayType === 'uuid') {
		return value.filter((v) => typeof v === 'string' && isValidUUID(v));
	}

	return value.map((v) => String(v).trim()).filter(Boolean);
};

// Sanitize boolean value
export const sanitizeBoolean = (value: any): boolean => {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		return value.toLowerCase() === 'true';
	}
	return !!value;
};

// Sanitize number value
export const sanitizeNumber = (value: any): number | null => {
	if (value === null || value === undefined) return null;
	const num = Number(value);
	return isNaN(num) ? null : num;
};

// Clean and validate JSONB data
export const sanitizeJsonb = (value: any): any => {
	if (!value) return null;

	// If it's already an object, return as is
	if (typeof value === 'object' && !Array.isArray(value)) {
		return value;
	}

	// If it's a string, try to parse it
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}

	// For arrays, return as is
	if (Array.isArray(value)) {
		return value;
	}

	return null;
};

// Check if a date is in the past (before today)
export const isPastDate = (value: any): boolean => {
	if (!value) return false;

	const today = new Date();
	today.setHours(0, 0, 0, 0); // Reset time to start of day

	let date: Date;
	if (value instanceof Date) {
		date = new Date(value);
	} else if (typeof value === 'string') {
		// Handle YYYY-MM-DD format
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			date = new Date(value + 'T00:00:00');
		} else {
			date = new Date(value);
		}
	} else {
		return false;
	}

	if (isNaN(date.getTime())) return false;
	date.setHours(0, 0, 0, 0); // Reset time to start of day

	return date < today;
};
