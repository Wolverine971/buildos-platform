// apps/web/src/lib/components/agent/agent-chat-worker-status.ts
import type { ChatTurnStatusV1 } from '@buildos/shared-types';

/**
 * A turn normally sits in `queued` for well under a second. Past this, the
 * wait is worth naming so the user isn't staring at an unchanging "Thinking…".
 */
export const WORKER_QUEUED_SLOW_AFTER_MS = 20_000;

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
		? 'Taking longer than usual…'
		: 'Thinking…';
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
