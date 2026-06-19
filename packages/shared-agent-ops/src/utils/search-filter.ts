// packages/shared-agent-ops/src/utils/search-filter.ts
//
// Pure Supabase search-filter helpers extracted from apps/web api-helpers.ts (R1)
// so the worker op layer can build search filters without SvelteKit. No deps.

function stripControlChars(value: string): string {
	// Remove C0 control chars (0x00-0x1F) and DEL (0x7F) to keep filters predictable.
	let out = '';
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code > 0x1f && code !== 0x7f) {
			out += value[i];
		}
	}
	return out;
}

function normalizeSearchQuery(query: string): string {
	if (!query || typeof query !== 'string') {
		return '';
	}

	let normalized = stripControlChars(query.trim());

	// Limit length to prevent abuse (reasonable search query length)
	if (normalized.length > 200) {
		normalized = normalized.substring(0, 200);
	}

	return normalized;
}

function escapeLikePattern(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function escapePostgrestValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Sanitizes a search query for use in Supabase ilike/or filters.
 * Escapes special characters that could cause issues in pattern matching.
 */
export function sanitizeSearchQuery(query: string): string {
	const normalized = normalizeSearchQuery(query);
	if (!normalized) {
		return '';
	}

	return escapeLikePattern(normalized);
}

/**
 * Builds a safe search filter string for Supabase .or() queries.
 * Returns the filter string, or null if the query is empty.
 */
export function buildSearchFilter(query: string, fields: string[]): string | null {
	const normalized = normalizeSearchQuery(query);
	if (!normalized) {
		return null;
	}

	const pattern = escapeLikePattern(normalized);
	const quotedValue = `"${escapePostgrestValue(`%${pattern}%`)}"`;
	return fields.map((field) => `${field}.ilike.${quotedValue}`).join(',');
}
