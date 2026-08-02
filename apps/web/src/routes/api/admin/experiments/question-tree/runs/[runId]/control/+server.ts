// apps/web/src/routes/api/admin/experiments/question-tree/runs/[runId]/control/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getAdminUserId } from '$lib/server/question-tree-admin';

type AnySupabase = {
	rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const adminUserId = await getAdminUserId({ supabase, safeGetSession });
	if (!adminUserId) return ApiResponse.forbidden('Admin access required');
	const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
	const action = body?.action;
	if (action !== 'pause' && action !== 'resume' && action !== 'cancel' && action !== 'retry') {
		return ApiResponse.badRequest('action must be pause, resume, cancel, or retry');
	}

	try {
		const admin = createAdminSupabaseClient() as unknown as AnySupabase;
		const { data, error } = await admin.rpc('control_question_tree_run', {
			p_run_id: params.runId,
			p_action: action
		});
		if (error) throw error;
		return ApiResponse.success(data, `Question Tree run ${action} accepted`);
	} catch (error) {
		return ApiResponse.internalError(error, `Failed to ${action} Question Tree run`);
	}
};
