// apps/web/src/routes/api/knowledge/shares/inbox/+server.ts
/** GET /api/knowledge/shares/inbox → { asks }: waiting asks on your entries, newest first (tasker 168). */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { loadShareInbox, sharingErrorResponse } from '$lib/server/knowledge/sharing.server';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		return ApiResponse.success({ asks: await loadShareInbox(locals.supabase) });
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not load asks');
	}
};
