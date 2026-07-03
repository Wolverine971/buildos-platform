// apps/web/src/routes/api/onto/projects/[id]/audits/[audit_id]/chat-session/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { createOrReuseProjectAuditChatSession } from '$lib/server/project-audit-chat-session.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const access = await requireProjectMemberAccess({
		locals,
		user,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	try {
		const result = await createOrReuseProjectAuditChatSession({
			supabase: locals.supabase as any,
			auditId: params.audit_id,
			userId: user.id,
			projectId: access.projectId
		});
		return result.created ? ApiResponse.created(result) : ApiResponse.success(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to open project audit chat';
		if (message === 'Project audit not found') return ApiResponse.notFound('Project audit');
		return ApiResponse.databaseError(error);
	}
};
