// apps/web/src/routes/api/knowledge/shares/+server.ts
/**
 * POST /api/knowledge/shares (tasker 168)
 *   { action: 'ask', entity_id, project_id, what: 'contact' | 'all' }
 *     Ask the owner of someone else's entry (seen in a shared project) to show you more.
 *     → { status: requested | declined | already_shared | not_found | rate_limited, id? }
 *     The owner gets one email per new ask; a repeat ask merges into the open one.
 *   { action: 'share', entity_id, project_id, grantee_id?, what, predicates?, duration, expires_at? }
 *     Share your own entry without being asked: with one member, or everyone in the project.
 *     → { status: 'granted', id }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import {
	readShareTerms,
	requestShare,
	shareEntity,
	sharingErrorResponse
} from '$lib/server/knowledge/sharing.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const entityId = typeof body.entity_id === 'string' ? body.entity_id : '';
	const projectId = typeof body.project_id === 'string' ? body.project_id : '';
	if (!UUID_PATTERN.test(entityId)) return ApiResponse.badRequest('Invalid entry');

	try {
		if (body.action === 'ask') {
			if (!UUID_PATTERN.test(projectId)) return ApiResponse.badRequest('Invalid project');
			const result = await requestShare(locals.supabase, {
				entityId,
				projectId,
				what: body.what === 'all' ? 'all' : 'contact'
			});
			return ApiResponse.success(result);
		}
		if (body.action === 'share') {
			const granteeId =
				typeof body.grantee_id === 'string' && UUID_PATTERN.test(body.grantee_id)
					? body.grantee_id
					: null;
			const result = await shareEntity(locals.supabase, {
				entityId,
				projectId: UUID_PATTERN.test(projectId) ? projectId : null,
				granteeId,
				...readShareTerms(body)
			});
			return ApiResponse.success(result);
		}
		return ApiResponse.badRequest('Ask or share');
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not do that');
	}
};
