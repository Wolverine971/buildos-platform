// apps/web/src/routes/api/users/preferences/+server.ts
/**
 * User Preferences API Endpoint
 *
 * GET: Fetch current user's global preferences
 * PUT: Update current user's global preferences (merges with existing)
 *
 * Validates: communication_style, proactivity_level, response_length
 * Free-form: primary_role, domain_context
 *
 * @see /apps/web/docs/features/preferences/README.md - Full API documentation
 */
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

const COMMUNICATION_STYLES = new Set(['direct', 'supportive', 'socratic']);
const PROACTIVITY_LEVELS = new Set(['minimal', 'moderate', 'high']);
const RESPONSE_LENGTHS = new Set(['concise', 'detailed', 'adaptive']);

type PreferenceUpdates = Record<string, unknown>;

function coercePreferences(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function sanitizePreferences(updates: PreferenceUpdates) {
	const sanitized: Record<string, unknown> = {};
	const invalidFields: string[] = [];

	if ('communication_style' in updates) {
		const value = updates.communication_style;
		if (value === null || value === '') {
			sanitized.communication_style = null;
		} else if (typeof value === 'string' && COMMUNICATION_STYLES.has(value)) {
			sanitized.communication_style = value;
		} else {
			invalidFields.push('communication_style');
		}
	}

	if ('proactivity_level' in updates) {
		const value = updates.proactivity_level;
		if (value === null || value === '') {
			sanitized.proactivity_level = null;
		} else if (typeof value === 'string' && PROACTIVITY_LEVELS.has(value)) {
			sanitized.proactivity_level = value;
		} else {
			invalidFields.push('proactivity_level');
		}
	}

	if ('response_length' in updates) {
		const value = updates.response_length;
		if (value === null || value === '') {
			sanitized.response_length = null;
		} else if (typeof value === 'string' && RESPONSE_LENGTHS.has(value)) {
			sanitized.response_length = value;
		} else {
			invalidFields.push('response_length');
		}
	}

	if ('primary_role' in updates) {
		const value = updates.primary_role;
		if (value === null || value === '') {
			sanitized.primary_role = null;
		} else if (typeof value === 'string') {
			sanitized.primary_role = value.trim();
		} else {
			invalidFields.push('primary_role');
		}
	}

	if ('domain_context' in updates) {
		const value = updates.domain_context;
		if (value === null || value === '') {
			sanitized.domain_context = null;
		} else if (typeof value === 'string') {
			sanitized.domain_context = value.trim();
		} else {
			invalidFields.push('domain_context');
		}
	}

	return { sanitized, invalidFields };
}

function stripEmptyPreferences(preferences: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(preferences).filter(
			([_, value]) => value !== null && value !== undefined && value !== ''
		)
	);
}

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		const { data: userData, error } = await supabase
			.from('users')
			.select('preferences')
			.eq('id', user.id)
			.single();

		if (error) {
			console.error('Error fetching user preferences:', error);
			return ApiResponse.internalError(error, 'Failed to fetch preferences');
		}

		const preferences = coercePreferences(userData?.preferences);
		return ApiResponse.success({ preferences });
	} catch (error) {
		console.error('Error in user preferences GET:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Internal server error'
		);
	}
};

export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		const updates = await request.json().catch(() => null);
		if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
			return ApiResponse.badRequest('Invalid preferences payload');
		}

		const { data: userData, error: fetchError } = await supabase
			.from('users')
			.select('preferences')
			.eq('id', user.id)
			.single();

		if (fetchError) {
			console.error('Error fetching existing preferences:', fetchError);
			return ApiResponse.internalError(fetchError, 'Failed to fetch preferences');
		}

		const { sanitized, invalidFields } = sanitizePreferences(updates as PreferenceUpdates);
		if (invalidFields.length > 0) {
			return ApiResponse.badRequest('Invalid preference values', { invalidFields });
		}

		const existingPreferences = coercePreferences(userData?.preferences);
		const mergedPreferences = stripEmptyPreferences({
			...existingPreferences,
			...sanitized
		});

		const { data: saved, error } = await supabase
			.from('users')
			.update({ preferences: mergedPreferences })
			.eq('id', user.id)
			.select('preferences')
			.single();

		if (error) {
			console.error('Error updating user preferences:', error);
			return ApiResponse.internalError(error, 'Failed to update preferences');
		}

		return ApiResponse.success({ preferences: coercePreferences(saved?.preferences) });
	} catch (error) {
		console.error('Error in user preferences PUT:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Internal server error'
		);
	}
};
