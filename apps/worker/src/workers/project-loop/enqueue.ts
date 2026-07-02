// apps/worker/src/workers/project-loop/enqueue.ts
//
// Worker-side enqueue for project loops (mirrors the web
// project-loops.service.ts). Used by the end-of-day scheduler. The web app
// can't be imported here, so the run-row + add_queue_job logic is duplicated.

import type { Json, ProjectLoopTriggerReason } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { mapProjectLoopOwnerUserIds } from './ownerResolution';

const AUTO_TRIGGER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// A `running` run whose worker died before failRun could persist a terminal
// status would block this project's loops forever via the active-run guard
// below (the status-fenced claim in projectLoopWorker means retries skip it
// rather than re-run it). Real runs finish in minutes (cost-capped, ~5 LLM
// calls), so anything past these ages is an orphan we can safely fail and
// replace. `queued` gets a longer window to tolerate nightly queue backlogs.
const STALE_RUNNING_RUN_MS = 60 * 60 * 1000; // 1 hour
const STALE_QUEUED_RUN_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Stable queue dedup key for a project's loop within a single cadence window
 * (one UTC calendar day). Deliberately excludes the run id and trigger reason
 * so a manual web trigger racing the end-of-day cron collapses onto the same
 * `add_queue_job` dedup slot instead of double-running. add_queue_job only
 * dedups against pending/processing jobs, so a fresh run later the same day
 * (after the prior job completes) is still allowed.
 */
export function projectLoopDedupKey(projectId: string, at: Date = new Date()): string {
	const day = at.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
	return `project-loop:${projectId}:${day}`;
}

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
		.select('id, status, created_at, started_at')
		.eq('project_id', params.projectId)
		.in('status', ['queued', 'running'])
		.limit(1)
		.maybeSingle();
	if (active?.id) {
		const referenceIso =
			active.status === 'running'
				? (active.started_at ?? active.created_at)
				: active.created_at;
		const referenceMs = referenceIso ? Date.parse(referenceIso) : NaN;
		const staleAfterMs =
			active.status === 'running' ? STALE_RUNNING_RUN_MS : STALE_QUEUED_RUN_MS;
		const isStale = !Number.isNaN(referenceMs) && Date.now() - referenceMs > staleAfterMs;
		if (!isStale) {
			return { queued: false, runId: active.id, reason: 'already_running' };
		}
		// Guarded update: only the caller that flips the orphan out of its
		// active status proceeds; a concurrent enqueue loses the race and hits
		// the active-run guard on its own attempt.
		const { data: reclaimed, error: reclaimError } = await supabase
			.from('project_loop_runs')
			.update({
				status: 'failed',
				error_message: `Marked stale by enqueue: stuck in '${active.status}' since ${referenceIso}`,
				finished_at: new Date().toISOString()
			})
			.eq('id', active.id)
			.eq('status', active.status)
			.select('id')
			.maybeSingle();
		if (reclaimError || !reclaimed?.id) {
			return { queued: false, runId: active.id, reason: 'already_running' };
		}
		console.warn(
			`[ProjectLoops] Failed stale ${active.status} run ${active.id} for project ${params.projectId}; enqueueing a fresh run.`
		);
	}

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
		p_dedup_key: projectLoopDedupKey(params.projectId)
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
	skippedInvalidOwner?: number;
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

	const ownerUserIdsByProjectId = await resolveProjectLoopOwnerUserIds(projects ?? []);
	let enqueued = 0;
	let skippedInvalidOwner = 0;
	for (const project of projects ?? []) {
		if (!project.id) continue;
		const userId = ownerUserIdsByProjectId.get(project.id);
		if (!userId) {
			skippedInvalidOwner += 1;
			continue;
		}
		const result = await enqueueProjectLoop({
			projectId: project.id,
			userId,
			triggerReason: 'end_of_day'
		});
		if (result.queued) enqueued += 1;
	}

	return { enqueued, scanned: projects?.length ?? 0, skippedInvalidOwner };
}

async function resolveProjectLoopOwnerUserIds(
	projects: Array<{ id: string | null; created_by: string | null }>
): Promise<Map<string, string>> {
	const createdByIds = [
		...new Set(
			projects.map((project) => project.created_by).filter((id): id is string => Boolean(id))
		)
	];
	if (createdByIds.length === 0) return new Map();

	const { data: actorRows, error: actorError } = await supabase
		.from('onto_actors')
		.select('id, user_id')
		.in('id', createdByIds);
	if (actorError) {
		console.error('[ProjectLoops] failed to resolve project owner actors:', actorError.message);
	}

	const actorUserIds = [
		...new Set(
			(actorRows ?? [])
				.map((actor) => actor.user_id)
				.filter((id): id is string => Boolean(id))
		)
	];
	const candidateUserIds = [...new Set([...createdByIds, ...actorUserIds])];
	if (candidateUserIds.length === 0) return new Map();

	const { data: userRows, error: userError } = await supabase
		.from('users')
		.select('id')
		.in('id', candidateUserIds);
	if (userError) {
		console.error('[ProjectLoops] failed to validate project owner users:', userError.message);
		return new Map();
	}

	return mapProjectLoopOwnerUserIds(projects, actorRows ?? [], userRows ?? []);
}
