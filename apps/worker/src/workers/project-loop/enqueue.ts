// apps/worker/src/workers/project-loop/enqueue.ts
//
// Worker-side enqueue for project loops (mirrors the web
// project-loops.service.ts). Used by the end-of-day scheduler. The web app
// can't be imported here, so the run-row + add_queue_job logic is duplicated.

import type { Json, ProjectLoopTriggerReason } from '@buildos/shared-types';
import { projectLoopDedupKey } from '@buildos/shared-agent-ops';
import { supabase } from '../../lib/supabase';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { mapProjectLoopOwnerUserIds } from './ownerResolution';

// Re-exported so existing importers (and the enqueue tests) keep resolving it
// from this module while the definition lives in @buildos/shared-agent-ops.
export { projectLoopDedupKey };

const AUTO_TRIGGER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// A `running` run whose worker died before failRun could persist a terminal
// status would block this project's loops forever via the active-run guard
// below (the status-fenced claim in projectLoopWorker means retries skip it
// rather than re-run it). Real runs finish in minutes (cost-capped, ~5 LLM
// calls), so anything past these ages is an orphan we can safely fail and
// replace. `queued` gets a longer window to tolerate nightly queue backlogs.
const STALE_RUNNING_RUN_MS = 60 * 60 * 1000; // 1 hour
const STALE_QUEUED_RUN_MS = 6 * 60 * 60 * 1000; // 6 hours

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
			// 'project_loop' is NOT in the chat_sessions_chat_type_check allowlist —
			// it would 23514 the moment the end-of-day loop runs with the flag on.
			// The web manual/burst path already uses 'project'; match it. (Discovered
			// during Tier 1 work; blocks the item #9 enable-and-validate step.)
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

/**
 * Proactively reclaim runs that never reached a terminal state, independent of
 * whether the project gets re-enqueued (audit Tier 1 #7). Two failure modes:
 *
 *  - `running`/`queued` orphans — a worker died after the status-fenced claim
 *    (or before picking the job up). Previously only the NEXT enqueue for that
 *    exact project cleared these; a project with no further activity stayed
 *    stuck forever. Here we fail any past the same stale thresholds enqueue uses.
 *  - `waiting_review` runs whose every child suggestion is already decided —
 *    a backstop to the web-side finalizer for runs decided before this shipped.
 *
 * All updates are status-fenced so a run that changes state concurrently is left
 * to whoever won the race.
 */
export async function reclaimStalledProjectLoopRuns(): Promise<{
	failedRunning: number;
	failedQueued: number;
	finalizedReview: number;
}> {
	if (!PROJECT_LOOPS_ENABLED) {
		return { failedRunning: 0, failedQueued: 0, finalizedReview: 0 };
	}

	const now = Date.now();
	const nowIso = new Date(now).toISOString();
	const runningCutoff = new Date(now - STALE_RUNNING_RUN_MS).toISOString();
	const queuedCutoff = new Date(now - STALE_QUEUED_RUN_MS).toISOString();

	const failStuck = async (
		status: 'running' | 'queued',
		cutoffColumn: 'started_at' | 'created_at',
		cutoffIso: string
	): Promise<number> => {
		const { data: rows, error } = await supabase
			.from('project_loop_runs')
			.select('id')
			.eq('status', status)
			.lt(cutoffColumn, cutoffIso)
			.limit(200);
		if (error) {
			console.error(`[ProjectLoops] reclaim scan (${status}) failed:`, error.message);
			return 0;
		}
		let failed = 0;
		for (const row of rows ?? []) {
			if (!row.id) continue;
			const { data: reclaimed } = await supabase
				.from('project_loop_runs')
				.update({
					status: 'failed',
					error_message: `Reclaimed: stuck in '${status}' past the stale threshold`,
					finished_at: nowIso
				})
				.eq('id', row.id)
				.eq('status', status)
				.select('id')
				.maybeSingle();
			if (reclaimed?.id) failed += 1;
		}
		return failed;
	};

	const failedRunning = await failStuck('running', 'started_at', runningCutoff);
	const failedQueued = await failStuck('queued', 'created_at', queuedCutoff);

	// Finalize waiting_review runs with no undecided child suggestions.
	let finalizedReview = 0;
	const { data: reviewRuns, error: reviewError } = await supabase
		.from('project_loop_runs')
		.select('id')
		.eq('status', 'waiting_review')
		.limit(200);
	if (reviewError) {
		console.error('[ProjectLoops] reclaim scan (waiting_review) failed:', reviewError.message);
	} else {
		for (const row of reviewRuns ?? []) {
			if (!row.id) continue;
			const { data: pending, error: pendingError } = await supabase
				.from('project_suggestions')
				.select('id')
				.eq('run_id', row.id)
				.eq('status', 'pending')
				.limit(1);
			if (pendingError || pending?.length) continue;
			const { data: finalized } = await supabase
				.from('project_loop_runs')
				.update({ status: 'completed' })
				.eq('id', row.id)
				.eq('status', 'waiting_review')
				.select('id')
				.maybeSingle();
			if (finalized?.id) finalizedReview += 1;
		}
	}

	return { failedRunning, failedQueued, finalizedReview };
}

export async function resolveProjectLoopOwnerUserIds(
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
