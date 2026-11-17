// apps/web/src/routes/api/knowledge/facts/[id]/+server.ts
/**
 * PATCH  /api/knowledge/facts/:id  { status: 'active' | 'retracted' | 'disputed' }
 *        Accept a suggestion (active), mark it wrong (retracted), or flag it (disputed).
 * DELETE /api/knowledge/facts/:id
 * Own private facts only.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

const STATUSES = ['active', 'retracted', 'disputed'] as const;

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
	if (!(STATUSES as readonly string[]).includes(body.status ?? ''))
		return ApiResponse.badRequest('Invalid status');

	try {
		await knowledgeStoreFor(locals.supabase, user.id).setFactStatus(
			params.id,
			body.status as (typeof STATUSES)[number]
		);
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not update that detail');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	try {
		await knowledgeStoreFor(locals.supabase, user.id).deleteFact(params.id);
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not delete that detail');
	}
};
