// apps/web/src/routes/api/people/history/+server.ts
//
// GET → access history for the projects you own: who joined, left, or was invited,
//       and changes to roles and what their agents can do. Newest first.
//       ?limit=50 (max 200) &before=<iso>&before_id=<uuid> (from next_before /
//       next_before_id) &project_id=<uuid> (one project).
//
// The reader RPC is server-only and takes the user id explicitly, so this calls it
// with the admin client for the session user only. It resolves the names of people
// who have since left, which RLS would hide from a user-scoped read.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { peopleRpcErrorResponse } from '$lib/server/people/people-api';
import { loadAccessHistory, parseAccessHistoryQuery } from '$lib/server/people/access-history';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const parsed = parseAccessHistoryQuery(url.searchParams);
	if (!parsed.ok) return ApiResponse.badRequest(parsed.message);

	const result = await loadAccessHistory(createAdminSupabaseClient(), user.id, parsed.query);
	if (!result.ok) return peopleRpcErrorResponse(result.error, 'Could not load access history');

	return ApiResponse.success(result.page);
};
