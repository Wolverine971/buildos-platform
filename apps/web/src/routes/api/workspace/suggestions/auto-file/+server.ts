// apps/web/src/routes/api/workspace/suggestions/auto-file/+server.ts
// POST: carry out the agent's confident filings (notes and docs it is sure belong in a
// project). The page calls this when the Workspace opens and shows each move with Undo.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureWorkspaceProjectId } from '$lib/services/ontology/ontology-projects.service';
import { autoFileConfident } from '$lib/server/workspace/workspace.service';
import { workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		const workspaceId = await ensureWorkspaceProjectId(locals.supabase as never);
		const filed = await autoFileConfident({
			session: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: user.id,
			workspaceId
		});
		return ApiResponse.success({ filed });
	} catch (error) {
		return workspaceFailure(error);
	}
};
