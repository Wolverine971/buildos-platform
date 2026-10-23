// apps/web/src/routes/api/workspace/graduate/undo/+server.ts
// POST: undo "start a project from these": items go back to the Workspace, and the new
// project is removed if nothing else was added to it.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { undoGraduate } from '$lib/server/workspace/workspace.service';
import { graduateUndoRequest, workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, graduateUndoRequest);
	if (!parsed.ok) return parsed.response;
	try {
		return ApiResponse.success(
			await undoGraduate({
				session: locals.supabase,
				admin: createAdminSupabaseClient(),
				userId: user.id,
				projectId: parsed.data.project_id,
				batchId: parsed.data.batch_id
			})
		);
	} catch (error) {
		return workspaceFailure(error);
	}
};
