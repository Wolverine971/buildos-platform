// apps/web/src/routes/api/knowledge/runs/+server.ts
/**
 * GET /api/knowledge/runs?limit=20[&id=<run id>]
 * The caller's recent imports and research runs; with id, that run and its targets.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN, knowledgeDb } from '$lib/server/knowledge/knowledge.server';

const RUN_COLUMNS =
	'id, run_type, status, title, stats, error, budget_usd, cost_usd, created_at, started_at, finished_at';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const supabase = knowledgeDb(locals.supabase);

	const id = url.searchParams.get('id');
	if (id) {
		if (!UUID_PATTERN.test(id)) return ApiResponse.badRequest('Invalid id');
		const [run, targets] = await Promise.all([
			supabase
				.from('knowledge_runs')
				.select(RUN_COLUMNS)
				.eq('id', id)
				.eq('owner_user_id', user.id)
				.maybeSingle(),
			supabase
				.from('knowledge_run_targets')
				.select(
					'entity_id, status, fields, summary, facts_added, error, finished_at, entity:knowledge_entities(id, name, kind)'
				)
				.eq('run_id', id)
				.eq('owner_user_id', user.id)
				.order('created_at')
		]);
		if (run.error || targets.error)
			return ApiResponse.databaseError(run.error ?? targets.error);
		if (!run.data) return ApiResponse.notFound('Run');
		return ApiResponse.success({ run: run.data, targets: targets.data ?? [] });
	}

	const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 50);
	const { data, error } = await supabase
		.from('knowledge_runs')
		.select(RUN_COLUMNS)
		.eq('owner_user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);
	if (error) return ApiResponse.databaseError(error);
	return ApiResponse.success({ runs: data ?? [] });
};
