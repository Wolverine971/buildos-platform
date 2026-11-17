// apps/web/src/routes/api/knowledge/merge/+server.ts
/**
 * GET   /api/knowledge/merge                       → pending "same person?" suggestions
 * POST  /api/knowledge/merge { keep, merge }        → fold `merge` into `keep` (own entries)
 * PATCH /api/knowledge/merge { candidate_id }        → "These are different"
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		return ApiResponse.success({
			candidates: await knowledgeStoreFor(locals.supabase, user.id).listMergeCandidates(50)
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load suggestions');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: { keep?: string; merge?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (
		!UUID_PATTERN.test(body.keep ?? '') ||
		!UUID_PATTERN.test(body.merge ?? '') ||
		body.keep === body.merge
	) {
		return ApiResponse.badRequest('Pick two different entries');
	}
	try {
		const result = await knowledgeStoreFor(locals.supabase, user.id).merge(
			body.keep!,
			body.merge!
		);
		return ApiResponse.success(result);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not combine these');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: { candidate_id?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (!UUID_PATTERN.test(body.candidate_id ?? '')) return ApiResponse.badRequest('Invalid id');
	try {
		await knowledgeStoreFor(locals.supabase, user.id).resolveMergeCandidate(
			body.candidate_id!,
			'rejected'
		);
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not save that');
	}
};
