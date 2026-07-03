// apps/web/src/routes/api/onto/projects/[id]/audits/[audit_id]/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { captureServerEvent } from '$lib/server/posthog';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const [auditRes, suggestionsRes] = await Promise.all([
		locals.supabase
			.from('project_audits')
			.select('*')
			.eq('id', params.audit_id)
			.eq('project_id', access.projectId)
			.maybeSingle(),
		locals.supabase
			.from('project_audit_suggestions')
			.select('id, role, created_at, project_suggestions(*)')
			.eq('audit_id', params.audit_id)
	]);

	if (auditRes.error) return ApiResponse.databaseError(auditRes.error);
	if (suggestionsRes.error) return ApiResponse.databaseError(suggestionsRes.error);
	if (!auditRes.data) return ApiResponse.notFound('Project audit');

	await captureServerEvent(access.userId, 'project_audit_read', {
		project_id: access.projectId,
		audit_id: params.audit_id,
		status: auditRes.data.status ?? null,
		trigger_reason: auditRes.data.trigger_reason ?? null,
		delivery_confidence: auditRes.data.delivery_confidence ?? null,
		generated_suggestion_count: auditRes.data.generated_suggestion_count ?? null,
		unresolved_suggestion_count: auditRes.data.unresolved_suggestion_count ?? null,
		child_suggestion_count: suggestionsRes.data?.length ?? 0
	});

	return ApiResponse.success({
		audit: auditRes.data,
		childSuggestions: suggestionsRes.data ?? []
	});
};
