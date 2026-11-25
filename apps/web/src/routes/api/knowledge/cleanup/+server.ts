// apps/web/src/routes/api/knowledge/cleanup/+server.ts
/**
 * Clean up on the knowledge page: go through your organizations, likeliest junk first.
 *
 * POST /api/knowledge/cleanup
 *   { action: 'queue', source?: 'work'|'linkedin'|'contacts'|'research'|'manual', skip?: string[] }
 *     → { entries, remaining, by_source }: the next batch you haven't answered for, each with
 *       where it came from, what names it, who is attached and which entries may be the same
 *       company. `skip` leaves out entries you passed over this session. Free: counts and name
 *       comparisons, no model. Changes nothing.
 *   { action: 'remove', ids: string[] }   → { ids }: removed for good. They leave the list, their
 *       highlights leave tasks and docs, and reading the name again does not bring them back.
 *   { action: 'restore', ids: string[] }  → { ids }: Undo for a remove.
 *
 * Keep, merge, "it's a person", "part of" and "works here" go through the existing entry,
 * merge and facts endpoints.
 */
import type { RequestHandler } from './$types';
import { isKnowledgeSource } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

const MAX_IDS = 500;

function idList(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > MAX_IDS) return null;
	const ids = value.filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id));
	return ids.length === value.length ? ids : null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: { action?: unknown; source?: unknown; skip?: unknown; ids?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (!body || typeof body !== 'object') return ApiResponse.badRequest('Invalid request body');

	const store = knowledgeStoreFor(locals.supabase, user.id);
	try {
		if (body.action === 'queue') {
			if (body.source != null && !isKnowledgeSource(body.source))
				return ApiResponse.badRequest('Invalid source');
			const skip = body.skip == null ? [] : idList(body.skip);
			if (!skip) return ApiResponse.badRequest('Invalid skip list');
			return ApiResponse.success(
				await store.cleanupQueue({
					source: isKnowledgeSource(body.source) ? body.source : null,
					skip
				})
			);
		}
		if (body.action === 'remove' || body.action === 'restore') {
			const ids = idList(body.ids);
			if (!ids?.length) return ApiResponse.badRequest(`Pick up to ${MAX_IDS} entries`);
			const done =
				body.action === 'remove'
					? await store.removeEntries(ids)
					: await store.restoreEntries(ids);
			return ApiResponse.success({ ids: done });
		}
		return ApiResponse.badRequest('Unknown action');
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not do that');
	}
};
