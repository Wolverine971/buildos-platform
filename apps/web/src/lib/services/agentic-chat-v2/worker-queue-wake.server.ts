// apps/web/src/lib/services/agentic-chat-v2/worker-queue-wake.server.ts
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { runAfterResponse } from '$lib/server/background';

/**
 * Private Realtime Broadcast topic the dedicated chat worker listens on. Must
 * match AGENTIC_CHAT_QUEUE_WAKE_TOPIC in
 * apps/worker/src/workers/agentic-chat/host/queue-wake-listener.ts. Browser clients
 * cannot join or publish it: realtime.messages only authorizes
 * `chat-user:<auth.uid()>` for authenticated users, and the service role
 * bypasses RLS.
 */
export const AGENTIC_CHAT_QUEUE_WAKE_TOPIC = 'agentic-chat-queue:wake';
export const AGENTIC_CHAT_QUEUE_WAKE_EVENT = 'wake';

/**
 * How long admission waits for the wake. A slow or lost wake costs nothing but
 * latency: the worker's durable safety poll still claims the turn (normally 5 s).
 */
export const AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS = 150;

/**
 * How long a wake may keep running after admission stopped waiting. Aborting
 * at the wait deadline cancelled wakes that were merely slow (tasker 101: 17
 * timed-out wakes in one gate, median queue wait 882 ms), so the request now
 * finishes in the background and only this bound aborts it.
 */
export const AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS = 5_000;

const DISABLED_VALUES = new Set(['off', 'false', '0', 'disabled']);
const WAIT_ELAPSED = Symbol('agentic_chat_queue_wake_wait_elapsed');
const FAILURE_LOG_INTERVAL_MS = 60_000;

export type AgenticChatWorkerQueueWakeOutcome =
	| 'sent'
	| 'not_configured'
	| 'timed_out'
	| 'rejected'
	| 'failed';

export type AgenticChatWorkerQueueWakeOptions = {
	supabaseUrl: string | undefined;
	serviceKey: string | undefined;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	/**
	 * Keeps a wake that outlives the admission wait alive until it settles.
	 * Defaults to `runAfterResponse` (Vercel `waitUntil`), because a frozen
	 * serverless instance would otherwise drop it.
	 */
	keepAlive?: (pending: Promise<AgenticChatWorkerQueueWakeOutcome>) => void;
};

/**
 * Build a bounded, never-throwing wake emitter. It publishes one private
 * Broadcast through Realtime's REST endpoint: no socket to open, no channel
 * state to leak across serverless invocations. The payload carries no user or
 * turn data; the worker treats any wake as "claim now" and the durable queue
 * decides what, if anything, is ready.
 */
export function createAgenticChatWorkerQueueWake(
	options: AgenticChatWorkerQueueWakeOptions
): () => Promise<AgenticChatWorkerQueueWakeOutcome> {
	const timeoutMs = boundedTimeout(options.timeoutMs);
	const endpoint = broadcastEndpoint(options.supabaseUrl);
	const serviceKey = options.serviceKey?.trim() ?? '';
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const keepAlive =
		options.keepAlive ??
		((pending: Promise<AgenticChatWorkerQueueWakeOutcome>) =>
			runAfterResponse(pending, 'agentic chat queue wake'));

	return async () => {
		if (!endpoint || !serviceKey || typeof fetchImpl !== 'function') return 'not_configured';

		// Two clocks: the wait deadline only stops admission from waiting, and the
		// safety bound is the one that aborts, so a slow wake still reaches the
		// worker while nothing outlives the bound.
		const controller = new AbortController();
		let abortTimer: ReturnType<typeof setTimeout> | null = null;
		const safetyBound = new Promise<'timed_out'>((resolve) => {
			abortTimer = setTimeout(() => {
				controller.abort();
				resolve('timed_out');
			}, AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS);
		});
		const request = (async (): Promise<AgenticChatWorkerQueueWakeOutcome> => {
			const response = await fetchImpl(endpoint, {
				method: 'POST',
				headers: {
					apikey: serviceKey,
					Authorization: `Bearer ${serviceKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					messages: [
						{
							topic: AGENTIC_CHAT_QUEUE_WAKE_TOPIC,
							event: AGENTIC_CHAT_QUEUE_WAKE_EVENT,
							payload: { v: 1 },
							private: true
						}
					]
				}),
				signal: controller.signal
			});
			// Release the connection for keep-alive reuse; the body is never needed.
			void response.body?.cancel().catch(() => undefined);
			return response.ok ? 'sent' : 'rejected';
		})().catch((): AgenticChatWorkerQueueWakeOutcome => {
			return controller.signal.aborted ? 'timed_out' : 'failed';
		});
		// Settles by the safety bound even if a fetch ignores its abort signal.
		const settled = Promise.race([request, safetyBound]).finally(() => {
			if (abortTimer !== null) clearTimeout(abortTimer);
		});

		let waitTimer: ReturnType<typeof setTimeout> | null = null;
		const waitElapsed = new Promise<typeof WAIT_ELAPSED>((resolve) => {
			waitTimer = setTimeout(() => resolve(WAIT_ELAPSED), timeoutMs);
		});
		try {
			const outcome = await Promise.race([settled, waitElapsed]);
			if (outcome !== WAIT_ELAPSED) return outcome;
			try {
				keepAlive(settled);
			} catch {
				// The request is already running; losing keep-alive only risks the wake.
			}
			return 'timed_out';
		} catch {
			return 'failed';
		} finally {
			if (waitTimer !== null) clearTimeout(waitTimer);
		}
	};
}

let defaultWake: (() => Promise<AgenticChatWorkerQueueWakeOutcome>) | null = null;
let lastFailureLoggedAt = Number.NEGATIVE_INFINITY;

/**
 * Nudge the Agentic Chat worker to claim a just-admitted turn now instead of
 * on its next poll. Call only after a successful `newly_admitted` admission
 * committed. Resolves within ~150ms, never rejects, and never throws; a wake
 * still in flight at 150ms reports `timed_out` and finishes in the background.
 *
 * Kill switch: PRIVATE_AGENTIC_CHAT_QUEUE_WAKE=off.
 */
export async function wakeAgenticChatWorkerQueue(): Promise<void> {
	try {
		defaultWake ??= createAgenticChatWorkerQueueWake({
			supabaseUrl: PUBLIC_SUPABASE_URL,
			serviceKey: PRIVATE_SUPABASE_SERVICE_KEY
		});
		if (isDisabled(env.PRIVATE_AGENTIC_CHAT_QUEUE_WAKE)) return;
		const outcome = await defaultWake();
		if (outcome !== 'sent') reportWakeFailure(outcome);
	} catch (error) {
		reportWakeFailure('failed', error);
	}
}

function reportWakeFailure(outcome: AgenticChatWorkerQueueWakeOutcome, error?: unknown): void {
	try {
		const now = Date.now();
		if (now - lastFailureLoggedAt < FAILURE_LOG_INTERVAL_MS) return;
		lastFailureLoggedAt = now;
		console.warn(
			JSON.stringify({
				event: 'agentic_chat_queue_wake_degraded',
				outcome,
				error: error instanceof Error ? error.message.slice(0, 200) : undefined,
				impact: 'The worker claims this turn on its next durable poll (about 1s).'
			})
		);
	} catch {
		// Observability cannot fail admission.
	}
}

function isDisabled(value: string | undefined): boolean {
	return DISABLED_VALUES.has(value?.trim().toLowerCase() ?? '');
}

function boundedTimeout(value: number | undefined): number {
	if (value === undefined) return AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS;
	if (!Number.isSafeInteger(value) || value < 1) return AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS;
	return Math.min(value, AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS);
}

function broadcastEndpoint(supabaseUrl: string | undefined): string | null {
	try {
		const base = supabaseUrl?.trim();
		if (!base) return null;
		return new URL('realtime/v1/api/broadcast', base.endsWith('/') ? base : `${base}/`).href;
	} catch {
		return null;
	}
}

/** Test-only: forget the lazily built emitter and the failure-log throttle. */
export function resetAgenticChatWorkerQueueWakeForTests(): void {
	defaultWake = null;
	lastFailureLoggedAt = Number.NEGATIVE_INFINITY;
}
