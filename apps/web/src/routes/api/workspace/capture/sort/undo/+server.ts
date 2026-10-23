// apps/web/src/routes/api/workspace/capture/sort/undo/+server.ts
// POST: undo what sorting a capture did. Runs as the person, so the receipt can only
// touch what they can already edit.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { undoCaptureSort } from '$lib/server/workspace/capture-sort.service';
import { captureSortUndoRequest, workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals, request, fetch }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, captureSortUndoRequest);
	if (!parsed.ok) return parsed.response;
	try {
		const actorId = await ensureActorId(locals.supabase, user.id);
		const result = await undoCaptureSort({
			session: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: user.id,
			actorId,
			fetch,
			receipt: parsed.data.receipt
		});
		return ApiResponse.success(result);
	} catch (error) {
		return workspaceFailure(error);
	}
};
