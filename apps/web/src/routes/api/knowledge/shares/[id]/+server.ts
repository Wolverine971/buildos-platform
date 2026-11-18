// apps/web/src/routes/api/knowledge/shares/[id]/+server.ts
/**
 * PATCH  /api/knowledge/shares/:id  { decision: 'grant' | 'decline', what?, predicates?,
 *        duration?, expires_at? }   The owner answers an ask (tasker 168). Grant emails the asker.
 * DELETE /api/knowledge/shares/:id             The owner stops sharing (revoke).
 * DELETE /api/knowledge/shares/:id?as=asker    The asker withdraws a waiting ask.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import {
	cancelShareRequest,
	decideShare,
	readShareTerms,
	revokeShare,
	sharingErrorResponse
} from '$lib/server/knowledge/sharing.server';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid share');
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (body.decision !== 'grant' && body.decision !== 'decline')
		return ApiResponse.badRequest('Grant or decline');
	try {
		const terms = readShareTerms(body);
		return ApiResponse.success(
			await decideShare(locals.supabase, params.id, body.decision, {
				...terms,
				what: body.what === undefined ? null : terms.what
			})
		);
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not answer that');
	}
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid share');
	try {
		const result =
			url.searchParams.get('as') === 'asker'
				? await cancelShareRequest(locals.supabase, params.id)
				: await revokeShare(locals.supabase, params.id);
		return ApiResponse.success(result);
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not stop sharing');
	}
};
