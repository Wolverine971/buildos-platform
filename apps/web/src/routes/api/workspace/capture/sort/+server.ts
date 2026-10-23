// apps/web/src/routes/api/workspace/capture/sort/+server.ts
// POST: sort a note the person just captured (one fast model call). It may become tasks
// or notes, land in a project it clearly belongs to, or update a task that already exists.
// The response carries a receipt for Undo. The note was saved before this runs, so a
// failure here leaves it as it is.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { sortCapturedNote } from '$lib/server/workspace/capture-sort.service';
import { captureSortRequest, workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals, request, fetch }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, captureSortRequest);
	if (!parsed.ok) return parsed.response;
	try {
		const actorId = await ensureActorId(locals.supabase, user.id);
		const result = await sortCapturedNote({
			session: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: user.id,
			actorId,
			documentId: parsed.data.document_id,
			source: parsed.data.source,
			fetch
		});
		return ApiResponse.success(result);
	} catch (error) {
		return workspaceFailure(error);
	}
};
