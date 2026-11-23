// apps/web/src/routes/api/knowledge/merge/+server.ts
/**
 * GET   /api/knowledge/merge                       → pending "same person?" suggestions, plus
 *                                                    same-name groups ("Craig" ×2), and what
 *                                                    tells each entry apart (`about`, by id)
 * GET   /api/knowledge/merge?ids=a,b,c              → what merging these would move
 * POST  /api/knowledge/merge { keep, merge }        → fold `merge` (one id, or up to 25) into
 *                                                    `keep` (own entries)
 * PATCH /api/knowledge/merge { candidate_id }        → "These are different"
 * PATCH /api/knowledge/merge { entity_ids }          → "Different people" for a same-name group
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { MERGE_MAX } from '@buildos/shared-agent-ops/knowledge';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';
import { widenTagsToName } from '$lib/server/knowledge/tag-widening.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const store = knowledgeStoreFor(locals.supabase, user.id);
	const ids = url.searchParams.get('ids');
	if (ids !== null) {
		const list = ids.split(',').filter(Boolean);
		if (
			!list.length ||
			list.length > MERGE_MAX + 1 ||
			list.some((id) => !UUID_PATTERN.test(id))
		)
			return ApiResponse.badRequest('Invalid ids');
		try {
			return ApiResponse.success(await store.mergePreview(list));
		} catch (error) {
			return knowledgeErrorResponse(error, 'Could not load those entries');
		}
	}
	try {
		const [candidates, twins] = await Promise.all([
			store.listMergeCandidates(50),
			store.listNameTwins(50)
		]);
		// What each entry is, so two look-alikes can be told apart without opening them.
		const about = await store.describeForReview([
			...twins.flatMap((group) => group.ids),
			...candidates.flatMap((candidate) => [candidate.a.id, candidate.b.id])
		]);
		return ApiResponse.success({ candidates, twins, about });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load suggestions');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: { keep?: string; merge?: string | string[] };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const keep = body.keep ?? '';
	const merge = Array.isArray(body.merge) ? body.merge : [body.merge ?? ''];
	if (
		!UUID_PATTERN.test(keep) ||
		!merge.length ||
		merge.length > MERGE_MAX ||
		merge.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id) || id === keep)
	) {
		return ApiResponse.badRequest('Pick two different entries');
	}
	try {
		const store = knowledgeStoreFor(locals.supabase, user.id);
		// The folded entries' tags now belong to `keep`; any that sat on part of its name
		// ("Strategies" inside "Wayne Strategies") grow to the whole name. Best effort.
		const widen = () =>
			widenTagsToName(knowledgeDb(locals.supabase), user.id, keep).catch((error) => {
				console.warn('[knowledge] widening tags after merge failed', error);
				return { widened: 0, records: 0 };
			});
		if (!Array.isArray(body.merge)) {
			const merged = await store.merge(keep, merge[0]!);
			return ApiResponse.success({ ...merged, widened: (await widen()).widened });
		}
		const result = await store.mergeMany(keep, merge);
		if (!result.merged.length && result.failed.length)
			return ApiResponse.badRequest('Could not combine these');
		return ApiResponse.success({ ...result, widened: (await widen()).widened });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not combine these');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: { candidate_id?: string; entity_ids?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const store = knowledgeStoreFor(locals.supabase, user.id);
	if (body.entity_ids !== undefined) {
		const ids = body.entity_ids;
		if (
			!Array.isArray(ids) ||
			ids.length < 2 ||
			ids.length > MERGE_MAX + 1 ||
			ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
		)
			return ApiResponse.badRequest('Invalid ids');
		try {
			await store.markDifferent(ids as string[]);
			return ApiResponse.success({ ok: true });
		} catch (error) {
			return knowledgeErrorResponse(error, 'Could not save that');
		}
	}
	if (!UUID_PATTERN.test(body.candidate_id ?? '')) return ApiResponse.badRequest('Invalid id');
	try {
		await store.resolveMergeCandidate(body.candidate_id!, 'rejected');
		return ApiResponse.success({ ok: true });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not save that');
	}
};
