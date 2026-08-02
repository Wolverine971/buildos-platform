// apps/web/src/routes/api/admin/experiments/question-tree/runs/[runId]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getAdminUserId } from '$lib/server/question-tree-admin';

type AnySupabase = { from: (table: string) => any };

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const adminUserId = await getAdminUserId({ supabase, safeGetSession });
	if (!adminUserId) return ApiResponse.forbidden('Admin access required');
	try {
		const admin = createAdminSupabaseClient() as unknown as AnySupabase;
		const [runResult, nodesResult, proposalsResult, eventsResult] = await Promise.all([
			admin.from('question_tree_runs').select('*').eq('id', params.runId).maybeSingle(),
			admin
				.from('question_tree_nodes')
				.select('*')
				.eq('run_id', params.runId)
				.order('node_number', { ascending: true }),
			admin
				.from('question_tree_proposals')
				.select('*')
				.eq('run_id', params.runId)
				.order('created_at', { ascending: true }),
			admin
				.from('question_tree_events')
				.select('*')
				.eq('run_id', params.runId)
				.order('seq', { ascending: false })
				.limit(300)
		]);
		if (runResult.error) throw runResult.error;
		if (!runResult.data) return ApiResponse.notFound('Question Tree run');
		if (nodesResult.error) throw nodesResult.error;
		if (proposalsResult.error) throw proposalsResult.error;
		if (eventsResult.error) throw eventsResult.error;
		return ApiResponse.success({
			run: runResult.data,
			nodes: nodesResult.data ?? [],
			proposals: proposalsResult.data ?? [],
			events: eventsResult.data ?? []
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load Question Tree run');
	}
};
