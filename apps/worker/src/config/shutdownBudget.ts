// apps/worker/src/config/shutdownBudget.ts

/**
 * Railway sends SIGKILL at roughly 30 seconds. The worker reserves 2 seconds
 * for HTTP close, 3 seconds for analytics flush, and 1 second for scheduling
 * overhead beneath its own 28-second hard stop. Both queue drains run in
 * parallel, so each may consume at most this shared 22-second window.
 */
export const MAX_QUEUE_DRAIN_TIMEOUT_MS = 22_000;

export function resolveDefaultQueueDrainTimeout(value: string | undefined): number {
	if (value === undefined || value === '') return MAX_QUEUE_DRAIN_TIMEOUT_MS;
	if (!/^\d+$/.test(value)) return MAX_QUEUE_DRAIN_TIMEOUT_MS;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return MAX_QUEUE_DRAIN_TIMEOUT_MS;
	return Math.min(parsed, MAX_QUEUE_DRAIN_TIMEOUT_MS);
}
