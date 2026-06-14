// apps/web/src/routes/api/onto/projects/[id]/loops/+server.ts
//
// GET  /api/onto/projects/[id]/loops   -> recent runs + pending suggestions
// POST /api/onto/projects/[id]/loops   -> enqueue a manual loop run
//
// Gated by PROJECT_LOOPS_ENABLED (dev-only until green-lit). When disabled the
// routes 404 so the feature is fully hidden.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { queueProjectLoop } from '$lib/server/project-loops.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const { supabase } = locals;

	const [runsRes, suggestionsRes] = await Promise.all([
		supabase
			.from('project_loop_runs')
			.select('*')
			.eq('project_id', access.projectId)
			.order('created_at', { ascending: false })
			.limit(5),
		supabase
			.from('project_suggestions')
			.select('*')
			.eq('project_id', access.projectId)
			.eq('status', 'pending')
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true })
	]);

	if (runsRes.error) return ApiResponse.databaseError(runsRes.error);
	if (suggestionsRes.error) return ApiResponse.databaseError(suggestionsRes.error);

	return ApiResponse.success({
		runs: runsRes.data ?? [],
		latestRun: runsRes.data?.[0] ?? null,
		suggestions: suggestionsRes.data ?? []
	});
};

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	const result = await queueProjectLoop({
		projectId: access.projectId,
		userId: access.userId,
		triggerReason: 'manual'
	});

	if (!result.queued && result.reason && result.reason !== 'already_running') {
		return ApiResponse.error(result.reason, 502);
	}

	return ApiResponse.success(result);
};
