// apps/worker/src/workers/chat/classificationSweep.ts
//
// Server-side trigger for 'classify_chat_session' (chat titles, summaries, topics).
// The browser queues that job when a chat is closed, but most chats are never closed:
// the user starts another chat, switches session, closes the tab, or is on the phone.
// The scheduler runs this sweep so every chat is titled once it has been quiet.
//
// The browser close stays the fast path. Both use one dedup key per session, and
// add_queue_job dedups pending/processing jobs, so the two can never double-run.
// The job's own "already classified, no new messages" skip is the final guard.
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SupabaseQueue } from '../../lib/supabaseQueue';

export const CLASSIFY_CHAT_SESSION_JOB = 'classify_chat_session' as const;
export const CLASSIFY_CHAT_SESSION_PRIORITY = 8;
export const CLASSIFICATION_IDLE_MS = 10 * 60 * 1000;
/** Long enough that chats left untitled before the sweep existed drain on their own. */
export const CLASSIFICATION_SWEEP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
export const CLASSIFICATION_SWEEP_MAX_PER_TICK = 5;
const SESSION_SCAN_LIMIT = 200;
/** Sessions per queue_jobs lookup; keeps the `in (...)` filter well inside URL limits. */
const JOB_LOOKUP_CHUNK = 50;
const IN_FLIGHT_JOB_STATUSES: ReadonlySet<string> = new Set(['pending', 'processing', 'retrying']);
const FINISHED_JOB_STATUSES: ReadonlySet<string> = new Set(['completed', 'failed']);

/** Default ON; set CHAT_CLASSIFICATION_SWEEP_ENABLED=false to stop the sweep. */
export function chatClassificationSweepEnabled(): boolean {
	return process.env.CHAT_CLASSIFICATION_SWEEP_ENABLED !== 'false';
}

export function classifySessionDedupKey(sessionId: string): string {
	return `classify-session-${sessionId}`;
}

/** The one enqueue path for chat classification: the HTTP route and the sweep both use it. */
export function enqueueChatSessionClassification(
	queue: Pick<SupabaseQueue, 'add'>,
	params: { sessionId: string; userId: string }
) {
	return queue.add(
		CLASSIFY_CHAT_SESSION_JOB,
		params.userId,
		{ sessionId: params.sessionId, userId: params.userId },
		{
			priority: CLASSIFY_CHAT_SESSION_PRIORITY,
			dedupKey: classifySessionDedupKey(params.sessionId)
		}
	);
}

export type ClassificationSweepSession = {
	id: string;
	user_id: string;
	last_message_at: string | null;
	last_classified_at: string | null;
};

export type ClassificationSweepJob = {
	dedup_key: string | null;
	status: string;
	started_at: string | null;
	updated_at: string | null;
};

function instant(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
}

/**
 * Pure: the session has been quiet for 10 minutes, is inside the lookback, and has never
 * been classified or has messages newer than its last classification.
 */
export function classificationDue(session: ClassificationSweepSession, now: Date): boolean {
	const lastMessageAt = instant(session.last_message_at);
	if (lastMessageAt === null) return false;
	const idleMs = now.getTime() - lastMessageAt;
	if (idleMs < CLASSIFICATION_IDLE_MS || idleMs > CLASSIFICATION_SWEEP_LOOKBACK_MS) return false;
	const lastClassifiedAt = instant(session.last_classified_at);
	return lastClassifiedAt === null || lastMessageAt > lastClassifiedAt;
}

/**
 * Pure: leave the session alone while a classify job for it is queued or running, and
 * after one that started since the session's last message has finished. A finished job
 * has done what it can for these messages: a failed one must not be queued again every
 * tick (it already used its retries), and a completed one has nothing left to add. A new
 * message makes the session due again.
 */
export function classificationHandledByJob(
	session: ClassificationSweepSession,
	jobs: readonly ClassificationSweepJob[]
): boolean {
	const lastMessageAt = instant(session.last_message_at);
	if (lastMessageAt === null) return true;
	return jobs.some((job) => {
		if (IN_FLIGHT_JOB_STATUSES.has(job.status)) return true;
		if (!FINISHED_JOB_STATUSES.has(job.status)) return false;
		const ranAt = instant(job.started_at) ?? instant(job.updated_at);
		return ranAt !== null && ranAt >= lastMessageAt;
	});
}

export type ClassificationSweepResult = { due: number; enqueued: number };

/** Scheduler entry: queue classification for idle chats of any context type, newest first. */
export async function sweepChatClassifications(deps: {
	db: Pick<TypedSupabaseClient, 'from'>;
	enqueue: (params: { sessionId: string; userId: string }) => Promise<unknown>;
	now?: Date;
}): Promise<ClassificationSweepResult> {
	const now = deps.now ?? new Date();
	const since = new Date(now.getTime() - CLASSIFICATION_SWEEP_LOOKBACK_MS).toISOString();
	const idleBefore = new Date(now.getTime() - CLASSIFICATION_IDLE_MS).toISOString();
	const idleSessions = () =>
		deps.db
			.from('chat_sessions')
			.select('id, user_id, last_message_at, last_classified_at')
			.gt('message_count', 0)
			.gte('last_message_at', since)
			.lte('last_message_at', idleBefore);
	// PostgREST cannot compare two columns, so "new messages since the last classification"
	// is checked in code over the most recently active classified sessions. A session that
	// gains messages is at the top of that list when it goes idle.
	const [neverClassified, classifiedBefore] = await Promise.all([
		idleSessions()
			.is('last_classified_at', null)
			.order('last_message_at', { ascending: false })
			.limit(SESSION_SCAN_LIMIT),
		idleSessions()
			.not('last_classified_at', 'is', null)
			.order('last_message_at', { ascending: false })
			.limit(SESSION_SCAN_LIMIT)
	]);
	if (neverClassified.error) {
		throw new Error(`classification sweep sessions: ${neverClassified.error.message}`);
	}
	if (classifiedBefore.error) {
		throw new Error(`classification sweep sessions: ${classifiedBefore.error.message}`);
	}

	const due = [...(neverClassified.data ?? []), ...(classifiedBefore.data ?? [])]
		.filter((session) => classificationDue(session, now))
		.sort((a, b) => (instant(b.last_message_at) ?? 0) - (instant(a.last_message_at) ?? 0));

	const picked: ClassificationSweepSession[] = [];
	for (let offset = 0; offset < due.length; offset += JOB_LOOKUP_CHUNK) {
		if (picked.length >= CLASSIFICATION_SWEEP_MAX_PER_TICK) break;
		const chunk = due.slice(offset, offset + JOB_LOOKUP_CHUNK);
		const { data: jobs, error: jobsError } = await deps.db
			.from('queue_jobs')
			.select('dedup_key, status, started_at, updated_at')
			.eq('job_type', CLASSIFY_CHAT_SESSION_JOB)
			.in(
				'dedup_key',
				chunk.map((session) => classifySessionDedupKey(session.id))
			)
			.order('created_at', { ascending: false });
		if (jobsError) throw new Error(`classification sweep jobs: ${jobsError.message}`);
		const jobsByKey = new Map<string, ClassificationSweepJob[]>();
		for (const job of jobs ?? []) {
			if (!job.dedup_key) continue;
			const list = jobsByKey.get(job.dedup_key);
			if (list) list.push(job);
			else jobsByKey.set(job.dedup_key, [job]);
		}
		for (const session of chunk) {
			if (picked.length >= CLASSIFICATION_SWEEP_MAX_PER_TICK) break;
			const sessionJobs = jobsByKey.get(classifySessionDedupKey(session.id)) ?? [];
			if (classificationHandledByJob(session, sessionJobs)) continue;
			picked.push(session);
		}
	}

	let enqueued = 0;
	for (const session of picked) {
		try {
			await deps.enqueue({ sessionId: session.id, userId: session.user_id });
			enqueued += 1;
		} catch (enqueueError) {
			console.warn(
				`⚠️ Classification enqueue failed for session ${session.id}:`,
				enqueueError instanceof Error ? enqueueError.message : enqueueError
			);
		}
	}
	return { due: due.length, enqueued };
}
