// apps/web/src/routes/api/knowledge/entities/[id]/+server.ts
/**
 * GET    /api/knowledge/entities/:id  → the entry, its facts with sources, relationships both
 *        ways, linked tasks/docs the caller can still open, and research runs. For your own
 *        entry, also `sharing` (tasker 168): shared projects it shows in, asks and grants.
 * PATCH  /api/knowledge/entities/:id  { name?, summary?, status?: 'active'|'hidden',
 *          circle?: 'inner'|'public', kind? }  (circle: the user's answer, part of my world / just
 *          mentioned; kind: what the entry is, e.g. an "organization" that is really a person →
 *          `kind_change` says what was retracted and which same-name entries now look like duplicates)
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
import { loadEntityShares } from '$lib/server/knowledge/sharing.server';
import { isKnowledgeKind, type KnowledgeKindChange } from '@buildos/shared-agent-ops/knowledge';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	try {
		const detail = await knowledgeStoreFor(locals.supabase, user.id).getEntity(params.id);
		if (!detail) return ApiResponse.notFound('Entry');
		const [records, sharing] = await Promise.all([
			loadLinkedRecords(locals.supabase, detail.links),
			detail.entity.scope === 'private'
				? loadEntityShares(locals.supabase, params.id).catch(() => null)
				: Promise.resolve(null)
		]);
		return ApiResponse.success({ ...detail, records, sharing });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load this entry');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	let body: {
		name?: string;
		summary?: string | null;
		status?: string;
		circle?: string;
		kind?: string;
	};
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (body.status !== undefined && body.status !== 'active' && body.status !== 'hidden') {
		return ApiResponse.badRequest('Invalid status');
	}
	if (body.circle !== undefined && body.circle !== 'inner' && body.circle !== 'public') {
		return ApiResponse.badRequest('Invalid circle');
	}
	if (body.kind !== undefined && !isKnowledgeKind(body.kind)) {
		return ApiResponse.badRequest('Invalid kind');
	}

	try {
		const store = knowledgeStoreFor(locals.supabase, user.id);
		let kindChange: KnowledgeKindChange | null = null;
		if (isKnowledgeKind(body.kind))
			kindChange = await store.changeEntityKind(params.id, body.kind);
		await store.updateEntity(params.id, {
			...(typeof body.name === 'string' ? { name: body.name } : {}),
			...(body.summary !== undefined ? { summary: body.summary } : {}),
			...(body.status ? { status: body.status as 'active' | 'hidden' } : {}),
			...(body.circle ? { circle: body.circle as 'inner' | 'public' } : {})
		});
		return ApiResponse.success({
			ok: true,
			...(kindChange ? { kind_change: kindChange } : {})
		});
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
