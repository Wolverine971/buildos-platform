// apps/web/src/lib/server/project-icon-generation.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ProjectIconGeneration');
const PROJECT_ICON_GENERATION_ENABLED =
	String(process.env.ENABLE_PROJECT_ICON_GENERATION ?? 'false').toLowerCase() === 'true';
const PROJECT_ICON_GENERATION_DISABLED_MESSAGE = 'Project image generation is temporarily disabled';

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
	if (!PROJECT_ICON_GENERATION_ENABLED) {
		logger.info('Project icon generation queue call skipped because feature is disabled', {
			projectId: params.projectId,
			generationId: params.generationId,
			userId: params.userId,
			triggerSource: params.triggerSource
		});
		return { queued: false, reason: PROJECT_ICON_GENERATION_DISABLED_MESSAGE };
	}

	try {
		const supabase = createAdminSupabaseClient();
		const dedupKey = params.dedupKey ?? `project-icon:generation:${params.generationId}`;
		logger.info('Queueing project icon generation job', {
			projectId: params.projectId,
			generationId: params.generationId,
			userId: params.userId,
			triggerSource: params.triggerSource,
			candidateCount: params.candidateCount,
			autoSelect: params.autoSelect,
			priority: params.priority ?? 8,
			dedupKey
		});

		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
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

		logger.info('Queued project icon generation job', {
			projectId: params.projectId,
			generationId: params.generationId,
			jobId: queueJobId,
			triggerSource: params.triggerSource
		});
		return { queued: true, jobId: queueJobId, reason: 'queued' };
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
