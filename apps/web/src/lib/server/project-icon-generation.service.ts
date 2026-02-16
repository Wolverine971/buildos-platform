// apps/web/src/lib/server/project-icon-generation.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ProjectIconGeneration');

export type ProjectIconTriggerSource = 'auto' | 'manual' | 'regenerate';

export async function queueProjectIconGeneration(params: {
	projectId: string;
	generationId: string;
	userId: string;
	triggerSource: ProjectIconTriggerSource;
	steeringPrompt?: string;
	candidateCount: number;
	autoSelect: boolean;
	priority?: number;
	dedupKey?: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const dedupKey = params.dedupKey ?? `project-icon:generation:${params.generationId}`;
		const { data, error } = await supabase.rpc('add_queue_job', {
			p_user_id: params.userId,
			p_job_type: 'generate_project_icon',
			p_metadata: {
				generationId: params.generationId,
				projectId: params.projectId,
				requestedByUserId: params.userId,
				triggerSource: params.triggerSource,
				steeringPrompt: params.steeringPrompt,
				candidateCount: params.candidateCount,
				autoSelect: params.autoSelect
			},
			p_priority: params.priority ?? 8,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: dedupKey
		});

		if (error) {
			logger.warn('Failed to queue project icon generation job', {
				error,
				projectId: params.projectId,
				generationId: params.generationId,
				triggerSource: params.triggerSource
			});
			return { queued: false, reason: error.message };
		}

		return { queued: true, jobId: data as string, reason: 'queued' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Queue failed';
		logger.warn('Queue project icon generation failed', {
			error: message,
			projectId: params.projectId,
			generationId: params.generationId,
			triggerSource: params.triggerSource
		});
		return { queued: false, reason: message };
	}
}
