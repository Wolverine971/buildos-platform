// apps/web/src/routes/api/admin/experiments/question-tree/runs/[runId]/nodes/[nodeId]/retry/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getAdminUserId } from '$lib/server/question-tree-admin';

type AnySupabase = {
	rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const adminUserId = await getAdminUserId({ supabase, safeGetSession });
	if (!adminUserId) return ApiResponse.forbidden('Admin access required');

	try {
		const admin = createAdminSupabaseClient() as unknown as AnySupabase;
		const { data, error } = await admin.rpc('retry_question_tree_node', {
			p_run_id: params.runId,
			p_node_id: params.nodeId
		});
		if (error) throw error;
		return ApiResponse.success(data, 'Question Tree node retry accepted');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to retry Question Tree node');
	}
};
