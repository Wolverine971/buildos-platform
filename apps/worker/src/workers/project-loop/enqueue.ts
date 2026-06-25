// apps/worker/src/workers/project-loop/enqueue.ts
//
// Worker-side enqueue for project loops (mirrors the web
// project-loops.service.ts). Used by the end-of-day scheduler. The web app
// can't be imported here, so the run-row + add_queue_job logic is duplicated.

import type { Json, ProjectLoopTriggerReason } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';

const AUTO_TRIGGER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

async function createLoopChatSession(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectLoopTriggerReason;
}): Promise<string> {
	const { data: chatSession, error: chatError } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: 'project',
			entity_id: params.projectId,
			status: 'active',
			chat_type: 'project_loop',
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

	const { error: linkError } = await supabase.from('chat_sessions_projects').insert({
		chat_session_id: chatSession.id,
		project_id: params.projectId
	});
	if (linkError) {
		throw new Error(linkError.message);
	}

	return chatSession.id;
}

export async function enqueueProjectLoop(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectLoopTriggerReason;
}): Promise<{ queued: boolean; runId?: string; reason?: string }> {
	if (!PROJECT_LOOPS_ENABLED) return { queued: false, reason: 'feature_disabled' };

	// Don't stack on an active run.
	const { data: active } = await supabase
		.from('project_loop_runs')
		.select('id')
		.eq('project_id', params.projectId)
		.in('status', ['queued', 'running'])
		.limit(1)
		.maybeSingle();
	if (active?.id) return { queued: false, runId: active.id, reason: 'already_running' };

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
		chatSessionId = await createLoopChatSession(params);
	} catch (error) {
		return {
			queued: false,
			reason: error instanceof Error ? error.message : 'create_chat_session_failed'
		};
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
		return { queued: false, reason: runError?.message ?? 'create_run_failed' };
	}

	const { error: queueError } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: 'buildos_project_loop',
		p_metadata: {
			runId: runRow.id,
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: params.triggerReason
		} as unknown as Json,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `project-loop:${params.projectId}:${runRow.id}`
	});

	if (queueError) {
		await supabase
			.from('project_loop_runs')
			.update({
				status: 'failed',
				error_message: queueError.message,
				finished_at: new Date().toISOString()
			})
			.eq('id', runRow.id);
		return { queued: false, runId: runRow.id, reason: queueError.message };
	}

	return { queued: true, runId: runRow.id };
}

/**
 * End-of-day pass: enqueue loops for active projects touched in the last 24h.
 * Cooldown + active-run checks above keep this idempotent across reruns.
 */
export async function enqueueEndOfDayProjectLoops(): Promise<{
	enqueued: number;
	scanned: number;
}> {
	if (!PROJECT_LOOPS_ENABLED) return { enqueued: 0, scanned: 0 };

	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const { data: projects, error } = await supabase
		.from('onto_projects')
		.select('id, created_by')
		.in('state_key', ['active', 'planning'])
		.is('deleted_at', null)
		.is('archived_at', null)
		.gte('updated_at', since)
		.limit(500);

	if (error) {
		console.error('[ProjectLoops] end-of-day scan failed:', error.message);
		return { enqueued: 0, scanned: 0 };
	}

	let enqueued = 0;
	for (const project of projects ?? []) {
		if (!project.id || !project.created_by) continue;
		const result = await enqueueProjectLoop({
			projectId: project.id,
			userId: project.created_by,
			triggerReason: 'end_of_day'
		});
		if (result.queued) enqueued += 1;
	}

	return { enqueued, scanned: projects?.length ?? 0 };
}
