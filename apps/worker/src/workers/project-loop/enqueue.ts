// apps/worker/src/workers/project-loop/enqueue.ts
//
// Worker-side enqueue for project loops (mirrors the web
// project-loops.service.ts). Used by the end-of-day scheduler. The web app
// can't be imported here, so the run-row + add_queue_job logic is duplicated.

import type { Json, ProjectLoopTriggerReason } from '@buildos/shared-types';
import { projectLoopDedupKey, readProjectLoopQueueMetadata } from '@buildos/shared-agent-ops';
import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { supabase } from '../../lib/supabase';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { getSafeTimezone } from '../../http/timezone';
import { mapProjectLoopOwnerUserIds } from './ownerResolution';

// Re-exported so existing importers (and the enqueue tests) keep resolving it
// from this module while the definition lives in @buildos/shared-agent-ops.
export { projectLoopDedupKey };

const AUTO_TRIGGER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const END_OF_DAY_PROJECT_PAGE_SIZE = 500;
const END_OF_DAY_SCAN_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const DEFAULT_END_OF_DAY_MAX_PROJECTS_PER_USER = 10;

// A `running` run whose worker died before failRun could persist a terminal
// status would block this project's loops forever via the active-run guard
// below (the status-fenced claim in projectLoopWorker means retries skip it
// rather than re-run it). Real runs finish in minutes (cost-capped, ~5 LLM
// calls), so anything past these ages is an orphan we can safely fail and
// replace. `queued` gets a longer window to tolerate nightly queue backlogs.
const STALE_RUNNING_RUN_MS = 60 * 60 * 1000; // 1 hour
const STALE_QUEUED_RUN_MS = 6 * 60 * 60 * 1000; // 6 hours

async function resolveQueueJobDetails(
	queueRecordId: string
): Promise<{ queueJobId: string; metadata: unknown }> {
	const { data, error } = await supabase
		.from('queue_jobs')
		.select('queue_job_id, metadata')
		.eq('id', queueRecordId)
		.maybeSingle();
	if (error || !data?.queue_job_id) {
		throw new Error(
			error?.message ?? `Failed to resolve queue job details for record ${queueRecordId}`
		);
	}
	return {
		queueJobId: data.queue_job_id,
		metadata: data?.metadata
	};
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

async function archiveChatSession(chatSessionId: string): Promise<void> {
	const { error } = await supabase
		.from('chat_sessions')
		.update({ status: 'archived' })
		.eq('id', chatSessionId)
		.eq('status', 'active');
	if (error) {
		console.warn(
			`[ProjectLoops] Failed to archive duplicate chat session ${chatSessionId}: ${error.message}`
		);
	}
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
		await archiveChatSession(chatSessionId);
		return { queued: false, reason: runError?.message ?? 'create_run_failed' };
	}

	const { data: queueRecordId, error: queueError } = await supabase.rpc('add_queue_job', {
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

	if (queueError || typeof queueRecordId !== 'string') {
		const message = queueError?.message ?? 'Queue RPC did not return a queue record id';
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({
					status: 'failed',
					error_message: message,
					finished_at: new Date().toISOString()
				})
				.eq('id', runRow.id),
			archiveChatSession(chatSessionId)
		]);
		return { queued: false, runId: runRow.id, reason: message };
	}

	let queueJob: { queueJobId: string; metadata: unknown };
	try {
		queueJob = await resolveQueueJobDetails(queueRecordId);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to resolve queued project loop job';
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({
					status: 'failed',
					error_message: message,
					finished_at: new Date().toISOString()
				})
				.eq('id', runRow.id)
				.eq('status', 'queued'),
			archiveChatSession(chatSessionId)
		]);
		return { queued: false, runId: runRow.id, reason: message };
	}
	const queueMetadata = readProjectLoopQueueMetadata(queueJob.metadata);
	if (queueMetadata.runId !== runRow.id) {
		const message = queueMetadata.runId
			? `Deduplicated onto active project loop job ${queueJob.queueJobId} for run ${queueMetadata.runId}`
			: `Queue job ${queueJob.queueJobId} metadata did not include the new loop run ${runRow.id}`;
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({
					status: 'failed',
					error_message: message,
					finished_at: new Date().toISOString()
				})
				.eq('id', runRow.id)
				.eq('status', 'queued'),
			archiveChatSession(chatSessionId)
		]);
		return {
			queued: false,
			runId: queueMetadata.runId ?? runRow.id,
			reason: queueMetadata.runId ? 'already_running' : 'queue_metadata_mismatch'
		};
	}

	await supabase
		.from('project_loop_runs')
		.update({ queue_job_id: queueJob.queueJobId })
		.eq('id', runRow.id);

	return { queued: true, runId: runRow.id };
}

export interface EndOfDayProjectLoopCandidateProject {
	id: string | null;
	created_by: string | null;
	updated_at: string | null;
}

export interface EndOfDayProjectLoopCandidate {
	projectId: string;
	userId: string;
	timezone: string;
	completedLocalDate: string;
	updatedAt: string;
}

export interface EndOfDayProjectLoopSelection {
	candidates: EndOfDayProjectLoopCandidate[];
	skippedInvalidOwner: number;
	skippedTimezoneWindow: number;
	skippedOutsideLocalDay: number;
	skippedFanoutCap: number;
}

function parseEndOfDayMaxProjectsPerUser(value: string | undefined): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return DEFAULT_END_OF_DAY_MAX_PROJECTS_PER_USER;
}

function shiftLocalDate(dateStr: string, timezone: string, days: number): string {
	const localNoonUtc = fromZonedTime(`${dateStr} 12:00:00`, timezone);
	return formatInTimeZone(addDays(localNoonUtc, days), timezone, 'yyyy-MM-dd');
}

export function getProjectLoopEndOfDayWindow(
	now: Date,
	timezone: string
): { completedLocalDate: string; start: Date; end: Date } | null {
	const nowInTimezone = toZonedTime(now, timezone);
	if (nowInTimezone.getHours() !== 0) return null;

	const currentLocalDate = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
	const completedLocalDate = shiftLocalDate(currentLocalDate, timezone, -1);
	const nextLocalDate = shiftLocalDate(completedLocalDate, timezone, 1);

	return {
		completedLocalDate,
		start: fromZonedTime(`${completedLocalDate} 00:00:00`, timezone),
		end: fromZonedTime(`${nextLocalDate} 00:00:00`, timezone)
	};
}

export function selectEndOfDayProjectLoopCandidates(params: {
	projects: EndOfDayProjectLoopCandidateProject[];
	ownerUserIdsByProjectId: Map<string, string>;
	timezoneByUserId: Map<string, string | null | undefined>;
	now?: Date;
	maxProjectsPerUser?: number;
}): EndOfDayProjectLoopSelection {
	const now = params.now ?? new Date();
	const maxProjectsPerUser =
		params.maxProjectsPerUser ?? DEFAULT_END_OF_DAY_MAX_PROJECTS_PER_USER;
	const groupedByUserId = new Map<string, EndOfDayProjectLoopCandidate[]>();
	let skippedInvalidOwner = 0;
	let skippedTimezoneWindow = 0;
	let skippedOutsideLocalDay = 0;

	for (const project of params.projects) {
		if (!project.id) continue;
		const userId = params.ownerUserIdsByProjectId.get(project.id);
		if (!userId) {
			skippedInvalidOwner += 1;
			continue;
		}
		if (!project.updated_at) {
			skippedOutsideLocalDay += 1;
			continue;
		}

		const timezone = getSafeTimezone(params.timezoneByUserId.get(userId) ?? 'UTC', userId);
		const window = getProjectLoopEndOfDayWindow(now, timezone);
		if (!window) {
			skippedTimezoneWindow += 1;
			continue;
		}

		const updatedAtMs = Date.parse(project.updated_at);
		if (
			Number.isNaN(updatedAtMs) ||
			updatedAtMs < window.start.getTime() ||
			updatedAtMs >= window.end.getTime()
		) {
			skippedOutsideLocalDay += 1;
			continue;
		}

		const candidates = groupedByUserId.get(userId) ?? [];
		candidates.push({
			projectId: project.id,
			userId,
			timezone,
			completedLocalDate: window.completedLocalDate,
			updatedAt: project.updated_at
		});
		groupedByUserId.set(userId, candidates);
	}

	const candidates: EndOfDayProjectLoopCandidate[] = [];
	let skippedFanoutCap = 0;
	for (const userCandidates of groupedByUserId.values()) {
		userCandidates.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
		candidates.push(...userCandidates.slice(0, maxProjectsPerUser));
		skippedFanoutCap += Math.max(0, userCandidates.length - maxProjectsPerUser);
	}

	return {
		candidates,
		skippedInvalidOwner,
		skippedTimezoneWindow,
		skippedOutsideLocalDay,
		skippedFanoutCap
	};
}

async function loadEndOfDayCandidateProjects(
	sinceIso: string
): Promise<{ projects: EndOfDayProjectLoopCandidateProject[]; errorMessage?: string }> {
	const projects: EndOfDayProjectLoopCandidateProject[] = [];
	let from = 0;

	while (true) {
		const to = from + END_OF_DAY_PROJECT_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from('onto_projects')
			.select('id, created_by, updated_at')
			.in('state_key', ['active', 'planning'])
			.is('deleted_at', null)
			.is('archived_at', null)
			.gte('updated_at', sinceIso)
			.order('updated_at', { ascending: false })
			.range(from, to);

		if (error) {
			return { projects, errorMessage: error.message };
		}

		const page = (data ?? []) as EndOfDayProjectLoopCandidateProject[];
		projects.push(...page);
		if (page.length < END_OF_DAY_PROJECT_PAGE_SIZE) break;
		from += END_OF_DAY_PROJECT_PAGE_SIZE;
	}

	return { projects };
}

async function loadUserTimezones(userIds: string[]): Promise<Map<string, string | null>> {
	if (userIds.length === 0) return new Map();
	const { data, error } = await supabase.from('users').select('id, timezone').in('id', userIds);
	if (error) {
		console.error('[ProjectLoops] failed to load project owner timezones:', error.message);
		return new Map();
	}
	const timezoneByUserId = new Map<string, string | null>();
	for (const user of data ?? []) {
		if (user.id) timezoneByUserId.set(user.id, user.timezone ?? null);
	}
	return timezoneByUserId;
}

/**
 * End-of-day pass: enqueue loops for active projects touched during the local
 * day that just ended for each user. Cooldown + active-run checks above keep
 * this idempotent across reruns.
 */
export async function enqueueEndOfDayProjectLoops(
	options: {
		now?: Date;
		maxProjectsPerUser?: number;
	} = {}
): Promise<{
	enqueued: number;
	scanned: number;
	skippedInvalidOwner?: number;
	skippedTimezoneWindow?: number;
	skippedOutsideLocalDay?: number;
	skippedFanoutCap?: number;
}> {
	if (!PROJECT_LOOPS_ENABLED) return { enqueued: 0, scanned: 0 };

	const now = options.now ?? new Date();
	const since = new Date(now.getTime() - END_OF_DAY_SCAN_LOOKBACK_MS).toISOString();
	const { projects, errorMessage } = await loadEndOfDayCandidateProjects(since);

	if (errorMessage) {
		console.error('[ProjectLoops] end-of-day scan failed:', errorMessage);
		return { enqueued: 0, scanned: 0 };
	}

	const ownerUserIdsByProjectId = await resolveProjectLoopOwnerUserIds(projects);
	const timezoneByUserId = await loadUserTimezones([
		...new Set([...ownerUserIdsByProjectId.values()])
	]);
	const selection = selectEndOfDayProjectLoopCandidates({
		projects,
		ownerUserIdsByProjectId,
		timezoneByUserId,
		now,
		maxProjectsPerUser:
			options.maxProjectsPerUser ??
			parseEndOfDayMaxProjectsPerUser(
				process.env.PROJECT_LOOPS_END_OF_DAY_MAX_PROJECTS_PER_USER
			)
	});

	let enqueued = 0;
	for (const candidate of selection.candidates) {
		const result = await enqueueProjectLoop({
			projectId: candidate.projectId,
			userId: candidate.userId,
			triggerReason: 'end_of_day'
		});
		if (result.queued) enqueued += 1;
	}

	return {
		enqueued,
		scanned: projects.length,
		skippedInvalidOwner: selection.skippedInvalidOwner,
		skippedTimezoneWindow: selection.skippedTimezoneWindow,
		skippedOutsideLocalDay: selection.skippedOutsideLocalDay,
		skippedFanoutCap: selection.skippedFanoutCap
	};
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
