// apps/web/src/lib/server/project-loops.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import { createLogger } from '$lib/utils/logger';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import type { ProjectLoopTriggerReason } from '@buildos/shared-types';

const logger = createLogger('ProjectLoops');

// Automated triggers (end_of_day, burst) won't re-run a project more often than
// this. Manual runs bypass the cooldown (but still can't stack on an active run).
const AUTO_TRIGGER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export interface QueueProjectLoopResult {
	queued: boolean;
	runId?: string;
	jobId?: string;
	reason?: string;
}

async function createLoopChatSession(
	supabase: ReturnType<typeof createAdminSupabaseClient>,
	params: { userId: string; projectId: string; triggerReason: ProjectLoopTriggerReason }
): Promise<string> {
	const { data: chatSession, error: chatError } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: 'project',
			entity_id: params.projectId,
			status: 'active',
			chat_type: 'project',
			title:
				params.triggerReason === 'manual'
					? 'Manual Project Review'
					: 'Automated Project Review'
		})
		.select('id')
		.single();

	if (chatError || !chatSession?.id) {
		throw new Error(chatError?.message ?? 'Failed to create project review chat session');
	}

	await supabase
		.from('chat_sessions_projects')
		.insert({
			chat_session_id: chatSession.id,
			project_id: params.projectId
		})
		.throwOnError();

	return chatSession.id;
}

/**
 * Create a project_loop_runs row and enqueue a buildos_project_loop job.
 * Used by the manual "Run loop" trigger, the end-of-day scheduler, and the
 * activity-burst hook. No-ops when the feature flag is off or a run is already
 * in flight for the project (deduped).
 */
export async function queueProjectLoop(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectLoopTriggerReason;
}): Promise<QueueProjectLoopResult> {
	if (!PROJECT_LOOPS_ENABLED) {
		return { queued: false, reason: 'feature_disabled' };
	}

	const supabase = createAdminSupabaseClient();

	// Avoid stacking runs: if one is already queued/running, return it.
	const { data: active } = await supabase
		.from('project_loop_runs')
		.select('id')
		.eq('project_id', params.projectId)
		.in('status', ['queued', 'running'])
		.limit(1)
		.maybeSingle();
	if (active?.id) {
		return { queued: false, runId: active.id, reason: 'already_running' };
	}

	// Cooldown for automated triggers so bursts/schedules don't spam loops.
	if (params.triggerReason !== 'manual') {
		const { data: lastRun } = await supabase
			.from('project_loop_runs')
			.select('finished_at')
			.eq('project_id', params.projectId)
			.not('finished_at', 'is', null)
			.order('finished_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		const finishedAt = lastRun?.finished_at ? Date.parse(lastRun.finished_at) : NaN;
		if (!Number.isNaN(finishedAt) && Date.now() - finishedAt < AUTO_TRIGGER_COOLDOWN_MS) {
			return { queued: false, reason: 'cooldown_active' };
		}
	}

	let chatSessionId: string;
	try {
		chatSessionId = await createLoopChatSession(supabase, params);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to create loop session';
		logger.warn('Create loop chat session failed', {
			error: message,
			projectId: params.projectId
		});
		return { queued: false, reason: message };
	}

	const { data: runRow, error: runError } = await supabase
		.from('project_loop_runs')
		.insert({
			project_id: params.projectId,
			user_id: params.userId,
			trigger_reason: params.triggerReason,
			status: 'queued',
			chat_session_id: chatSessionId
		})
		.select('id')
		.single();

	if (runError || !runRow?.id) {
		const message = runError?.message ?? 'Failed to create loop run';
		logger.warn('Create loop run failed', { error: message, projectId: params.projectId });
		return { queued: false, reason: message };
	}

	try {
		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
			p_user_id: params.userId,
			p_job_type: 'buildos_project_loop',
			p_metadata: {
				runId: runRow.id,
				projectId: params.projectId,
				userId: params.userId,
				triggerReason: params.triggerReason
			},
			p_priority: 7,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `project-loop:${params.projectId}:${runRow.id}`
		});

		await supabase
			.from('project_loop_runs')
			.update({ queue_job_id: queueJobId })
			.eq('id', runRow.id);

		return { queued: true, runId: runRow.id, jobId: queueJobId };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Queue failed';
		logger.warn('Queue loop job failed', { error: message, projectId: params.projectId });
		await supabase
			.from('project_loop_runs')
			.update({
				status: 'failed',
				error_message: message,
				finished_at: new Date().toISOString()
			})
			.eq('id', runRow.id);
		return { queued: false, runId: runRow.id, reason: message };
	}
}
