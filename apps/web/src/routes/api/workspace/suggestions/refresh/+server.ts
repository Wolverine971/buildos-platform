// apps/web/src/routes/api/workspace/suggestions/refresh/+server.ts
// POST: ask the agent to look over the Workspace now (one pending run per person).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureWorkspaceProjectId } from '$lib/services/ontology/ontology-projects.service';
import { requestSuggestions } from '$lib/server/workspace/workspace.service';
import { workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		const workspaceId = await ensureWorkspaceProjectId(locals.supabase as never);
		await requestSuggestions(createAdminSupabaseClient(), user.id, workspaceId);
		return ApiResponse.success({ status: 'queued' });
	} catch (error) {
		return workspaceFailure(error);
	}
};
