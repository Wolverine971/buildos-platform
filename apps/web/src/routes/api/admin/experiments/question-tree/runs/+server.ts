// apps/web/src/routes/api/admin/experiments/question-tree/runs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getAdminUserId } from '$lib/server/question-tree-admin';

type AnySupabase = {
	from: (table: string) => any;
	rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession }, url }) => {
	const adminUserId = await getAdminUserId({ supabase, safeGetSession });
	if (!adminUserId) return ApiResponse.forbidden('Admin access required');
	const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '40', 10);
	const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 40;
	try {
		const admin = createAdminSupabaseClient() as unknown as AnySupabase;
		const { data, error } = await admin
			.from('question_tree_runs')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(limit);
		if (error) throw error;
		return ApiResponse.success({ runs: data ?? [] });
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load Question Tree runs');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const adminUserId = await getAdminUserId({ supabase, safeGetSession });
	if (!adminUserId) return ApiResponse.forbidden('Admin access required');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const question = typeof body?.question === 'string' ? body.question.trim() : '';
	const policy = body?.model_policy === 'free_strict' ? 'free_strict' : 'paid_floor_strict';
	const requestedLimit =
		typeof body?.node_limit === 'number'
			? Math.floor(body.node_limit)
			: Number(body?.node_limit);
	const nodeLimit = Number.isFinite(requestedLimit)
		? Math.min(100, Math.max(1, requestedLimit))
		: 100;

	if (question.length < 3 || question.length > 4000) {
		return ApiResponse.validationError(
			'question',
			'Question must be between 3 and 4,000 characters'
		);
	}

	try {
		const admin = createAdminSupabaseClient() as unknown as AnySupabase;
		const { data, error } = await admin.rpc('create_question_tree_run_with_job', {
			p_created_by: adminUserId,
			p_root_question: question,
			p_model_policy: policy,
			p_node_limit: nodeLimit,
			p_config: {}
		});
		if (error) throw error;
		return ApiResponse.created(data, 'Question Tree run created');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to create Question Tree run');
	}
};
