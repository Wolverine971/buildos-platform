// apps/web/src/lib/server/project-context-snapshot.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ProjectContextSnapshot');

export async function queueProjectContextSnapshot(params: {
	projectId: string;
	userId: string;
	reason?: string;
	force?: boolean;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
			p_user_id: params.userId,
			p_job_type: 'build_project_context_snapshot',
			p_metadata: {
				projectId: params.projectId,
				reason: params.reason ?? 'unspecified',
				force: params.force ?? false
			},
			p_priority: 7,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `project-context-snapshot-${params.projectId}`
		});

		return { queued: true, jobId: queueJobId, reason: 'queued' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Queue failed';
		logger.warn('Queue project snapshot job failed', {
			error: message,
			projectId: params.projectId
		});
		return { queued: false, reason: message };
	}
}
