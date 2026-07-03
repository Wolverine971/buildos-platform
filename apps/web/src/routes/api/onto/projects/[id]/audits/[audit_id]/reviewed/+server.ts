// apps/web/src/routes/api/onto/projects/[id]/audits/[audit_id]/reviewed/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { captureServerEvent } from '$lib/server/posthog';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	const now = new Date().toISOString();
	const { data, error } = await locals.supabase
		.from('project_audits')
		.update({
			status: 'reviewed',
			reviewed_at: now
		})
		.eq('id', params.audit_id)
		.eq('project_id', access.projectId)
		.in('status', ['ready', 'reviewed'])
		.select('*')
		.maybeSingle();

	if (error) return ApiResponse.databaseError(error);
	if (!data) return ApiResponse.notFound('Project audit');

	await captureServerEvent(access.userId, 'project_audit_reviewed', {
		project_id: access.projectId,
		audit_id: params.audit_id,
		status: data.status ?? null,
		trigger_reason: data.trigger_reason ?? null,
		delivery_confidence: data.delivery_confidence ?? null,
		generated_suggestion_count: data.generated_suggestion_count ?? null,
		unresolved_suggestion_count: data.unresolved_suggestion_count ?? null
	});

	return ApiResponse.success({ audit: data });
};
