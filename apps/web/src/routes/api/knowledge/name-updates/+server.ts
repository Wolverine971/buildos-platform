// apps/web/src/routes/api/knowledge/name-updates/+server.ts
/**
 * POST /api/knowledge/name-updates { changes: Array<{ mention_id, to }> }
 *   Replace exactly the tagged words with `to` in each record (tasker 167), through the normal
 *   task/doc update routes, so permissions, history and versions apply. Spans whose words
 *   changed since are skipped. Undo = the same call with the old words.
 *   { applied: Array<{ mention_id, from, to, record_kind, record_id }>, skipped: Array<{ mention_id, reason }> }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import {
	applyNameUpdates,
	MAX_NAME_UPDATE_PLACES,
	type NameUpdateChange
} from '$lib/server/knowledge/name-updates.server';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	let body: { changes?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const raw = Array.isArray(body.changes) ? body.changes : [];
	const changes: NameUpdateChange[] = [];
	for (const item of raw) {
		const change = item as { mention_id?: unknown; to?: unknown };
		const to = typeof change.to === 'string' ? change.to.trim() : '';
		if (typeof change.mention_id !== 'string' || !UUID_PATTERN.test(change.mention_id))
			return ApiResponse.badRequest('Invalid tag id');
		if (!to || to.length > 300 || /[\r\n]/.test(to))
			return ApiResponse.badRequest('Invalid name');
		changes.push({ mention_id: change.mention_id, to });
	}
	if (!changes.length) return ApiResponse.badRequest('Nothing to update');
	if (changes.length > MAX_NAME_UPDATE_PLACES)
		return ApiResponse.badRequest('Too many places at once');
	try {
		const result = await applyNameUpdates(
			{
				db: knowledgeDb(locals.supabase),
				userId: user.id,
				fetch,
				canEdit: async (projectId) =>
					(
						await requireProjectMemberAccess({
							locals,
							projectId,
							requiredAccess: 'write',
							user
						})
					).ok
			},
			changes
		);
		return ApiResponse.success(result);
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not update the names');
	}
};
