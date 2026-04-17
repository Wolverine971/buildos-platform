// apps/web/src/routes/api/profile/me/username/+server.ts
//
// Get / set the current user's `users.username`. When set, it takes precedence
// over derived-from-name as the slug_prefix on public pages
// (see `resolve_onto_public_page_slug_prefix` RPC).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const USERNAME_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
	'admin',
	'api',
	'auth',
	'blogs',
	'docs',
	'gallery',
	'help',
	'integrations',
	'p',
	'pricing',
	'profile',
	'projects',
	'road-map',
	'settings',
	'showcase',
	'signup',
	'user'
]);

function validateUsername(
	raw: string
): { ok: true; value: string } | { ok: false; message: string } {
	const trimmed = raw.trim().toLowerCase();
	if (trimmed.length < 3 || trimmed.length > 24) {
		return { ok: false, message: 'Username must be 3–24 characters.' };
	}
	if (!USERNAME_SHAPE.test(trimmed)) {
		return {
			ok: false,
			message:
				'Username can only contain lowercase letters, numbers, and single hyphens. Cannot start or end with a hyphen.'
		};
	}
	if (RESERVED.has(trimmed)) {
		return { ok: false, message: 'That username is reserved.' };
	}
	return { ok: true, value: trimmed };
}

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const { data, error } = await (supabase as any)
		.from('users')
		.select('username, name, email')
		.eq('id', user.id)
		.maybeSingle();
	if (error) {
		return ApiResponse.databaseError(error);
	}
	return ApiResponse.success({
		username: typeof data?.username === 'string' ? data.username : null,
		derived_fallback:
			typeof data?.name === 'string' && data.name.trim()
				? data.name
				: typeof data?.email === 'string'
					? data.email.split('@')[0]
					: 'user'
	});
};

export const PATCH: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const rawUsername = payload?.username;

	// null / empty string clears the custom username, reverts to derived.
	if (rawUsername === null || rawUsername === '') {
		const { error } = await (supabase as any)
			.from('users')
			.update({ username: null })
			.eq('id', user.id);
		if (error) return ApiResponse.databaseError(error);
		return ApiResponse.success({ username: null });
	}

	if (typeof rawUsername !== 'string') {
		return ApiResponse.badRequest('username must be a string or null');
	}

	const validation = validateUsername(rawUsername);
	if (!validation.ok) {
		return ApiResponse.validationError('username', validation.message);
	}

	const { error } = await (supabase as any)
		.from('users')
		.update({ username: validation.value })
		.eq('id', user.id);
	if (error) {
		// Unique-index violation → friendly error message rather than generic 500.
		if ((error as any)?.code === '23505') {
			return ApiResponse.error(
				'That username is already taken. Try another.',
				409,
				'USERNAME_TAKEN'
			);
		}
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ username: validation.value });
};
