// apps/worker/src/lib/queueShutdown.ts
// Side-effect free (no Supabase client), so processors can import it freely.

/**
 * Abort reason a draining queue gives the jobs still running when its drain
 * window ends. Processors can tell "this worker is shutting down" apart from a
 * worker timeout or their own cancellation, and choose a safe handoff (the chat
 * executor reports `worker_shutdown`, which requeues a turn whose work is not
 * yet durable anywhere).
 */
export class QueueShutdownAbortError extends Error {
	readonly code = 'queue_shutdown';

	constructor(message = 'Queue shutdown: drain timeout reached') {
		super(message);
		this.name = 'QueueShutdownAbortError';
	}
}

export function isQueueShutdownAbort(signal: AbortSignal): boolean {
	return signal.aborted && signal.reason instanceof QueueShutdownAbortError;
}
