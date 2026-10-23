// apps/web/src/routes/api/workspace/+server.ts
// GET: the signed-in person's Workspace (loose items + open suggestions), created on first visit.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { loadWorkspaceHome } from '$lib/server/workspace/workspace.service';
import { workspaceFailure } from '$lib/server/workspace/workspace-http';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		return ApiResponse.success(await loadWorkspaceHome(locals.supabase));
	} catch (error) {
		return workspaceFailure(error);
	}
};
