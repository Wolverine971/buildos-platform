// apps/web/src/routes/api/knowledge/entities/[id]/+server.ts
/**
 * GET    /api/knowledge/entities/:id  → the entry, its facts with sources, relationships both
 *        ways, linked tasks/docs the caller can still open, and research runs.
 * PATCH  /api/knowledge/entities/:id  { name?, summary?, status?: 'active'|'hidden' }
 * DELETE /api/knowledge/entities/:id  (own entries only)
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	loadLinkedRecords,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	try {
		const detail = await knowledgeStoreFor(locals.supabase, user.id).getEntity(params.id);
		if (!detail) return ApiResponse.notFound('Entry');
		const records = await loadLinkedRecords(locals.supabase, detail.links);
		return ApiResponse.success({ ...detail, records });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load this entry');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	let body: { name?: string; summary?: string | null; status?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (body.status !== undefined && body.status !== 'active' && body.status !== 'hidden') {
		return ApiResponse.badRequest('Invalid status');
	}

	try {
		await knowledgeStoreFor(locals.supabase, user.id).updateEntity(params.id, {
			...(typeof body.name === 'string' ? { name: body.name } : {}),
			...(body.summary !== undefined ? { summary: body.summary } : {}),
			...(body.status ? { status: body.status as 'active' | 'hidden' } : {})
		});
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not update this entry');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	try {
		await knowledgeStoreFor(locals.supabase, user.id).deleteEntity(params.id);
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not delete this entry');
	}
};
