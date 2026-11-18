// apps/web/src/routes/api/knowledge/mentions/[id]/+server.ts
/**
 * PATCH /api/knowledge/mentions/:id { status: 'removed' | 'active' }
 *   "Remove tag" on one place a name is tagged (tasker 167), or its Undo. Remembered at that
 *   spot: a re-read never tags it again. The spot's link to the record goes when it was the
 *   entry's last tag there (and comes back on Undo). Signed-in client: RLS + owner filter.
 */
import type { RequestHandler } from './$types';
import { setMentionTagStatus } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');
	let body: { status?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (body.status !== 'removed' && body.status !== 'active')
		return ApiResponse.badRequest('status must be removed or active');
	try {
		const result = await setMentionTagStatus(
			knowledgeDb(locals.supabase),
			user.id,
			params.id,
			body.status
		);
		return ApiResponse.success(result);
	} catch (error) {
		if (error instanceof Error && error.message === 'Tag not found')
			return ApiResponse.notFound('Tag');
		return ApiResponse.internalError(error, 'Could not update the tag');
	}
};
