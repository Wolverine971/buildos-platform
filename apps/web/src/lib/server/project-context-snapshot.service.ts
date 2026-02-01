// apps/web/src/lib/server/project-context-snapshot.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
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
		const { data, error } = await supabase.rpc('add_queue_job', {
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

		if (error) {
			logger.warn('Failed to queue project snapshot job', {
				error,
				projectId: params.projectId
			});
			return { queued: false, reason: error.message };
		}

		return { queued: true, jobId: data as string, reason: 'queued' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Queue failed';
		logger.warn('Queue project snapshot job failed', {
			error: message,
			projectId: params.projectId
		});
		return { queued: false, reason: message };
	}
}
