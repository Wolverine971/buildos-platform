// apps/web/src/routes/api/onto/projects/[id]/audits/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse } from '$lib/utils/api-response';

function parseLimit(value: string | null): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 10;
	return Math.min(parsed, 50);
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const limit = parseLimit(url.searchParams.get('limit'));
	const [auditsRes, evaluationRes] = await Promise.all([
		locals.supabase
			.from('project_audits')
			.select('*')
			.eq('project_id', access.projectId)
			.order('created_at', { ascending: false })
			.limit(limit),
		locals.supabase
			.from('project_audit_trigger_evaluations')
			.select('*')
			.eq('project_id', access.projectId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle()
	]);

	if (auditsRes.error) return ApiResponse.databaseError(auditsRes.error);
	if (evaluationRes.error) return ApiResponse.databaseError(evaluationRes.error);

	const audits = auditsRes.data ?? [];
	return ApiResponse.success({
		audits,
		latestAudit: audits[0] ?? null,
		latestEvaluation: evaluationRes.data ?? null
	});
};
