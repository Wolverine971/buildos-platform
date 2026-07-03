// apps/web/src/routes/api/onto/projects/[id]/audits/latest/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse } from '$lib/utils/api-response';

function buildTrackerState(params: {
	audit: Record<string, unknown> | null;
	evaluation: Record<string, unknown> | null;
}): { state: string; summary: string | null } {
	const auditStatus = typeof params.audit?.status === 'string' ? params.audit.status : null;
	const decision =
		typeof params.evaluation?.decision === 'string' ? params.evaluation.decision : null;
	const reasonSummary =
		typeof params.evaluation?.reason_summary === 'string'
			? params.evaluation.reason_summary
			: null;

	if (auditStatus === 'ready' || auditStatus === 'reviewed') {
		return { state: 'audit_ready', summary: params.audit?.summary as string | null };
	}
	if (auditStatus === 'queued' || auditStatus === 'running') {
		return { state: `audit_${auditStatus}`, summary: reasonSummary };
	}
	if (decision === 'deferred_quiet_period') {
		return { state: 'deferred_quiet_period', summary: reasonSummary };
	}
	if (decision === 'skipped_ineligible') {
		return { state: 'below_baseline', summary: reasonSummary };
	}
	if (decision === 'manual_required') {
		return { state: 'manual_required', summary: reasonSummary };
	}
	if (decision?.startsWith('skipped_')) {
		return { state: decision, summary: reasonSummary };
	}
	return { state: 'no_audit', summary: reasonSummary };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const [auditRes, evaluationRes] = await Promise.all([
		locals.supabase
			.from('project_audits')
			.select('*')
			.eq('project_id', access.projectId)
			.neq('status', 'archived')
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
		locals.supabase
			.from('project_audit_trigger_evaluations')
			.select('*')
			.eq('project_id', access.projectId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle()
	]);

	if (auditRes.error) return ApiResponse.databaseError(auditRes.error);
	if (evaluationRes.error) return ApiResponse.databaseError(evaluationRes.error);

	const latestAudit = (auditRes.data as Record<string, unknown> | null) ?? null;
	const latestEvaluation = (evaluationRes.data as Record<string, unknown> | null) ?? null;

	return ApiResponse.success({
		latestAudit,
		latestEvaluation,
		trackerState: buildTrackerState({
			audit: latestAudit,
			evaluation: latestEvaluation
		})
	});
};
