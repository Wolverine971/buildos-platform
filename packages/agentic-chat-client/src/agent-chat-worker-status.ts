// packages/agentic-chat-client/src/agent-chat-worker-status.ts
import type { ChatTurnStatusV1 } from '@buildos/shared-types';

/**
 * A turn normally sits in `queued` for well under a second. Past this, the
 * wait is worth naming so the user isn't staring at an unchanging "Thinking…".
 */
export const WORKER_QUEUED_SLOW_AFTER_MS = 20_000;

/** Status line once a wait has run past WORKER_QUEUED_SLOW_AFTER_MS. */
export const WORKER_SLOW_WAIT_STATUS = 'Taking longer than usual…';

/**
 * Status line while a reply starts over: a deploy interrupted the attempt that
 * was already writing, the server put the turn back in line (20261017181000),
 * and the partial answer was cleared. Shown until the new attempt produces
 * its own progress.
 */
export const WORKER_RESUMING_STATUS = 'Picking back up after an update…';

/**
 * Shown when a turn no chat worker ever picked up is timed out by the
 * stranded-queued-turn sweeper (reap_stranded_queued_agentic_chat_turns).
 */
export const WORKER_QUEUE_TIMEOUT_MESSAGE =
	"BuildOS couldn't start this reply because the chat service was unavailable. Please send it again.";

/** Short thinking-block detail for the same timeout (the banner carries the full sentence). */
export const WORKER_QUEUE_TIMEOUT_NOTE = "Couldn't start this reply";

/**
 * UI-only `finished_reason` the worker adapter puts on the `done` event of a
 * queued-turn timeout, so the SSE handler renders a failure instead of a Stop.
 */
export const WORKER_QUEUE_TIMEOUT_FINISHED_REASON = 'queue_timeout';

/** Shown when this browser can no longer follow a reply (it may still finish). */
export const WORKER_CONNECTION_LOST_MESSAGE =
	'Lost connection to this reply. Reopen the chat to check on it.';

/**
 * UI-only failure code for a turn this browser stopped following because the
 * server will never reconcile it here (404/409). Never a server value.
 */
export const WORKER_CONNECTION_LOST_FAILURE_CODE = 'client_connection_lost';

/** Thinking-block and button copy while a Stop request is in flight. */
export const WORKER_STOPPING_STATUS = 'Stopping…';

/**
 * One projection for every worker-backed waiting/processing surface. Calm,
 * plain copy: the user sees what BuildOS is doing, never the infrastructure
 * (no "worker", "queue", or transport words). A queued turn reads as the same
 * "Thinking…" as a running one until it has waited past
 * WORKER_QUEUED_SLOW_AFTER_MS, measured from the durable time it entered the
 * queue (`queuedSince`), so a reload shows the same text as a live session.
 */
export function workerActivityForStatus(
	status: ChatTurnStatusV1,
	options: { queuedSince?: string | null; now?: number } = {}
): string {
	if (status === 'running') return 'Thinking…';
	if (status !== 'queued') return '';
	const queuedSinceMs = options.queuedSince ? Date.parse(options.queuedSince) : Number.NaN;
	const now = options.now ?? Date.now();
	return Number.isFinite(queuedSinceMs) && now - queuedSinceMs >= WORKER_QUEUED_SLOW_AFTER_MS
		? WORKER_SLOW_WAIT_STATUS
		: 'Thinking…';
}

/**
 * Status line while a reply starts over after its attempt was interrupted.
 * The slow-wait clock starts when this browser saw the restart, not when the
 * interrupted attempt last wrote, so it never opens with "Taking longer…".
 */
export function workerResumingActivity(resumingSinceMs: number, now: number = Date.now()): string {
	return now - resumingSinceMs >= WORKER_QUEUED_SLOW_AFTER_MS
		? WORKER_SLOW_WAIT_STATUS
		: WORKER_RESUMING_STATUS;
}

/**
 * The wait lines this module produces. Exact matches against its own
 * constants (never free-text classification): a running turn's status line
 * normally belongs to its live events, but these lines are written while the
 * turn has none.
 */
export function isWorkerWaitActivity(activity: string): boolean {
	return activity === WORKER_RESUMING_STATUS || activity === WORKER_SLOW_WAIT_STATUS;
}

/**
 * The sweeper finalizes a never-started turn as status `cancelled` with
 * finished reason `timeout`. People only ever cancel with `user_cancelled` or
 * `superseded`, so this pair means "the chat service never picked it up", not
 * a Stop. Read from structured terminal fields only.
 */
export function isWorkerQueueTimeout(
	status: string | null | undefined,
	finishedReason: string | null | undefined
): boolean {
	return status === 'cancelled' && finishedReason === 'timeout';
}
