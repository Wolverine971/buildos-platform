// apps/web/src/routes/api/workspace/suggestions/[id]/+server.ts
// POST { action: 'accept' | 'dismiss' }. Accepting a "file" suggestion moves its items into
// the suggested project (one undoable batch). "Start a project" suggestions are accepted
// through /api/workspace/graduate, after the person confirms the name and items.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureWorkspaceProjectId } from '$lib/services/ontology/ontology-projects.service';
import {
	loadOwnSuggestion,
	markSuggestion,
	moveItems,
	toSuggestion
} from '$lib/server/workspace/workspace.service';
import { suggestionActionRequest, workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, suggestionActionRequest);
	if (!parsed.ok) return parsed.response;
	const admin = createAdminSupabaseClient();
	try {
		const row = await loadOwnSuggestion(admin, user.id, params.id);
		if (row.status !== 'open')
			return ApiResponse.conflict('That suggestion was already answered.');
		if (parsed.data.action === 'dismiss') {
			await markSuggestion(admin, user.id, row.id, 'dismissed');
			return ApiResponse.success({ status: 'dismissed' });
		}
		const suggestion = toSuggestion(row);
		if (suggestion?.kind !== 'file' || !suggestion.target_project_id)
			return ApiResponse.badRequest('Open this suggestion to answer it.');
		const workspaceId = await ensureWorkspaceProjectId(locals.supabase as never);
		const receipt = await moveItems({
			session: locals.supabase,
			admin,
			userId: user.id,
			sourceId: workspaceId,
			destinationId: suggestion.target_project_id,
			items: suggestion.items
		});
		await markSuggestion(admin, user.id, row.id, 'accepted', {
			project_id: suggestion.target_project_id,
			batch_id: receipt.batch_id,
			moved: receipt.moved
		});
		return ApiResponse.success({
			status: 'accepted',
			project_id: suggestion.target_project_id,
			...receipt
		});
	} catch (error) {
		return workspaceFailure(error);
	}
};
