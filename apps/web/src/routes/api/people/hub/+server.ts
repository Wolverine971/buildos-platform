// apps/web/src/routes/api/people/hub/+server.ts
//
// GET → everything Profile > People & agents shows about people, in one call:
// your handle settings, requests waiting on you, everyone in your projects
// (grouped by person), invites nobody answered, and projects shared with you.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadPeopleHub } from '$lib/server/people/people-hub';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	try {
		const hub = await loadPeopleHub({
			supabase: locals.supabase as any,
			admin: createAdminSupabaseClient() as any,
			userId: user.id
		});
		return ApiResponse.success(hub);
	} catch (error) {
		console.error('[PeopleHub API] Failed to load', error);
		return ApiResponse.internalError(error, 'Could not load people');
	}
};
