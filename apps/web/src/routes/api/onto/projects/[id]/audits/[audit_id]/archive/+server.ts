// apps/web/src/routes/api/onto/projects/[id]/audits/[audit_id]/archive/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { syncInboxItemForProjectAudit } from '@buildos/shared-agent-ops/inbox-index';

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
			status: 'archived',
			archived_at: now
		})
		.eq('id', params.audit_id)
		.eq('project_id', access.projectId)
		.select('*')
		.maybeSingle();

	if (error) return ApiResponse.databaseError(error);
	if (!data) return ApiResponse.notFound('Project audit');

	let inboxItem = null;
	try {
		inboxItem = await syncInboxItemForProjectAudit({
			supabase: createAdminSupabaseClient() as any,
			audit: data as Record<string, unknown>
		});
	} catch (error) {
		console.warn('[AI Inbox] Failed to sync archived project audit inbox item', {
			projectId: access.projectId,
			auditId: params.audit_id,
			error: error instanceof Error ? error.message : error
		});
	}

	return ApiResponse.success({ audit: data, inboxItem });
};
