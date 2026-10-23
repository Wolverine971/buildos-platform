// apps/web/src/routes/api/profile/me/discoverability/+server.ts
//
// PATCH { discoverability?: 'none' | 'handle', accepts_agent_requests?: boolean }
//
// Who can find me: 'handle' lets anyone who types my exact @handle see my name,
// handle, and bio, and ask me for access (never my email). It needs a username.
// accepts_agent_requests: whether requests sent by someone's agent reach me.
// The current values come back from GET /api/profile/me/username.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const PATCH: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const updates: { discoverability?: 'none' | 'handle'; accepts_agent_requests?: boolean } = {};

	if (payload?.discoverability !== undefined) {
		if (payload.discoverability !== 'none' && payload.discoverability !== 'handle') {
			return ApiResponse.badRequest("discoverability must be 'none' or 'handle'");
		}
		updates.discoverability = payload.discoverability;
	}
	if (payload?.accepts_agent_requests !== undefined) {
		if (typeof payload.accepts_agent_requests !== 'boolean') {
			return ApiResponse.badRequest('accepts_agent_requests must be true or false');
		}
		updates.accepts_agent_requests = payload.accepts_agent_requests;
	}
	if (Object.keys(updates).length === 0) {
		return ApiResponse.badRequest('Nothing to update');
	}

	if (updates.discoverability === 'handle') {
		const { data: row, error: readError } = await (supabase as any)
			.from('users')
			.select('username')
			.eq('id', user.id)
			.maybeSingle();
		if (readError) return ApiResponse.databaseError(readError);
		if (typeof row?.username !== 'string' || !row.username.trim()) {
			return ApiResponse.error(
				'Claim a username first. People find you by it.',
				409,
				'USERNAME_REQUIRED'
			);
		}
	}

	const { data, error } = await (supabase as any)
		.from('users')
		.update(updates)
		.eq('id', user.id)
		.select('discoverability, accepts_agent_requests')
		.maybeSingle();
	if (error) return ApiResponse.databaseError(error);
	if (!data) return ApiResponse.notFound('Profile');

	return ApiResponse.success({
		discoverability: data?.discoverability === 'handle' ? 'handle' : 'none',
		accepts_agent_requests: data?.accepts_agent_requests !== false
	});
};
