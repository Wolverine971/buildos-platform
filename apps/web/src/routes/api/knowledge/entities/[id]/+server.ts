// apps/web/src/routes/api/knowledge/entities/[id]/+server.ts
/**
 * GET    /api/knowledge/entities/:id  → the entry, its facts with sources, relationships both
 *        ways, linked tasks/docs the caller can still open, and research runs. For your own
 *        entry, also `sharing` (tasker 168): shared projects it shows in, asks and grants.
 * PATCH  /api/knowledge/entities/:id  { name?, summary?, status?: 'active'|'hidden',
 *          circle?: 'inner'|'public', kind? }  (circle: the user's answer, part of my world / just
 *          mentioned; kind: what the entry is, e.g. an "organization" that is really a person →
 *          `kind_change` says what was retracted and which same-name entries now look like duplicates;
 *          name: `rename` says how many tags grew to the new name, e.g. "Strategies" → "Wayne
 *          Strategies" where that is written, and which entries of the same kind already have it)
 * DELETE /api/knowledge/entities/:id  (own entries only; ?found=1 = only a web find still
 *        outside Your world, for "Don't save" in chat)
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	knowledgeStoreFor,
	loadLinkedRecords,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';
import { loadEntityShares } from '$lib/server/knowledge/sharing.server';
import { widenTagsToName } from '$lib/server/knowledge/tag-widening.server';
import {
	isKnowledgeKind,
	normalizeKnowledgeName,
	type KnowledgeKindChange
} from '@buildos/shared-agent-ops/knowledge';

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
		const rename =
			typeof body.name === 'string'
				? await afterRename(locals.supabase, user.id, params.id)
				: null;
		return ApiResponse.success({
			ok: true,
			...(kindChange ? { kind_change: kindChange } : {}),
			...(rename ? { rename } : {})
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not update this entry');
	}
};

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	try {
		const store = knowledgeStoreFor(locals.supabase, user.id);
		// ?found=1 is "Don't save" on a web search's find: only an entry research created that
		// is still outside the user's world may go this way (checked in the database).
		if (url.searchParams.get('found') === '1') await store.discardFoundEntry(params.id);
		else await store.deleteEntity(params.id);
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not delete this entry');
	}
};

/**
 * After a rename: grow the entry's tags to the new name where it is written, and list entries of
 * the same kind that already have the name (the card offers to combine them). Best effort: the
 * rename itself already succeeded.
 */
async function afterRename(
	supabase: App.Locals['supabase'],
	userId: string,
	entityId: string
): Promise<{ widened: number; records: number; same_name: Array<{ id: string; name: string }> }> {
	const db = knowledgeDb(supabase);
	const result = { widened: 0, records: 0, same_name: [] as Array<{ id: string; name: string }> };
	try {
		const { data: entity } = await db
			.from('knowledge_entities')
			.select('id, kind, name')
			.eq('id', entityId)
			.eq('owner_user_id', userId)
			.maybeSingle();
		if (!entity) return result;
		const [widen, twins] = await Promise.all([
			widenTagsToName(db, userId, entityId).catch((error) => {
				console.warn('[knowledge] widening tags after rename failed', error);
				return { widened: 0, records: 0 };
			}),
			db
				.from('knowledge_entities')
				.select('id, name')
				.eq('owner_user_id', userId)
				.eq('kind', entity.kind)
				.eq('normalized_name', normalizeKnowledgeName(entity.name))
				.eq('status', 'active')
				.neq('id', entityId)
				.limit(10)
		]);
		result.widened = widen.widened;
		result.records = widen.records;
		result.same_name = (twins.data ?? []) as Array<{ id: string; name: string }>;
	} catch (error) {
		console.warn('[knowledge] after-rename checks failed', error);
	}
	return result;
}
