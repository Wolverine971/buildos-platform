// apps/worker/src/workers/agentic-chat/host/shutdown-budget.ts

/**
 * How a dedicated chat worker spends Railway's deploy drain window
 * (docs: Deployment teardown → `drainingSeconds`, SIGTERM → SIGKILL).
 *
 * The chat worker runs no general queue, so it does not share the general
 * worker's 22 s budget (config/shutdownBudget.ts). On SIGTERM it:
 *   1. stops claiming at once (new replicas are already live and claim instead),
 *   2. lets running turns finish naturally for up to `CHAT_DRAIN_TIMEOUT_MS`,
 *   3. aborts the rest as a worker shutdown and waits `abortCleanupGraceMs` for
 *      each one's recovery handoff (an immediate requeue when nothing it did is
 *      durable, today's failure handling otherwise),
 *   4. only then stops the stream publisher and Realtime, and exits before
 *      `processHardStopMs`, ahead of Railway's SIGKILL.
 *
 * `drainingWindowMs` must equal `[deploy].drainingSeconds` in /railway.chat.toml;
 * a test reads the file and fails when they drift.
 */
export const AGENTIC_CHAT_RAILWAY_DRAINING_SECONDS = 90;

const DRAINING_WINDOW_MS = AGENTIC_CHAT_RAILWAY_DRAINING_SECONDS * 1_000;
/** Exit this long before SIGKILL: process exit, log flush, scheduling slack. */
const EXIT_MARGIN_MS = 3_000;
/** Publisher shutdown flush (5 s), Realtime close, and HTTP close run after the queue. */
const TAIL_RESERVE_MS = 8_000;
/**
 * One aborted turn's handoff: pending effect drain, billing settle, then the
 * recovery RPC (10 s overhead deadline). A requeue normally lands in ~1 s.
 */
const ABORT_CLEANUP_GRACE_MS = 12_000;

export const AGENTIC_CHAT_SHUTDOWN_BUDGET_V1 = Object.freeze({
	drainingWindowMs: DRAINING_WINDOW_MS,
	processHardStopMs: DRAINING_WINDOW_MS - EXIT_MARGIN_MS,
	abortCleanupGraceMs: ABORT_CLEANUP_GRACE_MS,
	/** Longest natural drain (`CHAT_DRAIN_TIMEOUT_MS` ceiling) that still leaves room for 3 and 4. */
	maxQueueDrainTimeoutMs:
		DRAINING_WINDOW_MS - EXIT_MARGIN_MS - TAIL_RESERVE_MS - ABORT_CLEANUP_GRACE_MS
});
