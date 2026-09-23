// apps/worker/src/workers/agentic-chat/provider/openrouter/watchdog.ts
// Per-attempt deadlines: the header/body abort signal, the turn-budget bound on
// each attempt, abortable reads, and the slow-stream progress watch.
import type { JsonObject } from '@buildos/shared-types';
import type { ActiveResponse, ClientInput, ProviderAttemptTiming, StreamState } from './types';
import { boundedDuration } from './canonical';
import { AgenticChatSlowStreamError } from './errors';

// A local progress heuristic, not a tokenizer or provider throughput guarantee.
// Only buffered V4.1 acting passes with an unused retry may abandon a slow stream.
const SLOW_STREAM_WINDOW_MS = 4_000;
const SLOW_STREAM_MIN_BYTES_PER_SECOND = 240;
/**
 * Every attempt keeps at least this long, and reserves this much of the turn
 * budget for the executor to finalize after the last provider pass. Below it a
 * request cannot realistically open a stream, so a nearly-spent budget fails
 * fast instead of being spread across a doomed attempt.
 */
const MIN_ATTEMPT_TIMEOUT_MS = 5_000;
const BUDGET_FINALIZATION_RESERVE_MS = 5_000;

/**
 * Per-attempt timeout bounded by the turn's remaining wall-clock budget.
 * Without this, 90s × two attempts × every acting and reviewer pass composes
 * past the executor's 300s wall and the turn dies at the wall after
 * durable writes (turn-executor audit 2026-09-02, finding 14).
 */
export function attemptTimeoutMs(requestTimeoutMs: number, input: ClientInput): number {
	const deadlineAtMs = input.budget?.deadlineAtMs;
	if (!Number.isFinite(deadlineAtMs)) return requestTimeoutMs;
	const remaining = (deadlineAtMs as number) - Date.now() - BUDGET_FINALIZATION_RESERVE_MS;
	return Math.max(MIN_ATTEMPT_TIMEOUT_MS, Math.min(requestTimeoutMs, Math.floor(remaining)));
}

export function isV41FlashModel(model: string): boolean {
	// OpenRouter can report a dated deployment in either headers or SSE frames.
	// Both spellings must use the same policy; other models remain ineligible.
	return /^deepseek\/deepseek-v4\.1-flash(?:-\d{8})?$/.test(model);
}

export function watchStreamProgress(
	active: ActiveResponse,
	state: StreamState,
	input: ClientInput
): () => void {
	let startedAtMs = Date.now();
	let startedBytes = state.generatedBytes;
	const check = () => {
		if (active.signal.aborted || state.finishReason !== null) return;
		if (!isV41FlashModel(state.modelUsed ?? active.route.model)) return;
		const now = Date.now();
		// Preserve enough time for the existing retry and terminal settlement.
		if (
			input.budget &&
			input.budget.deadlineAtMs - now <
				MIN_ATTEMPT_TIMEOUT_MS + BUDGET_FINALIZATION_RESERVE_MS
		)
			return;
		// Reasoning is requested with `exclude: true`, so a thinking model emits
		// nothing until its first text or tool call. Judge throughput only once
		// output has begun; the attempt deadline still bounds a silent stream.
		if (state.generatedBytes === 0) {
			startedAtMs = now;
			timer = setTimeout(check, SLOW_STREAM_WINDOW_MS);
			timer.unref?.();
			return;
		}
		const elapsed = now - startedAtMs;
		const bytes = state.generatedBytes - startedBytes;
		// A suspended host is not evidence of slow provider generation.
		if (
			elapsed <= SLOW_STREAM_WINDOW_MS * 2 &&
			bytes * 1_000 < SLOW_STREAM_MIN_BYTES_PER_SECOND * elapsed
		) {
			active.abort(new AgenticChatSlowStreamError(elapsed, bytes));
			return;
		}
		startedAtMs = now;
		startedBytes = state.generatedBytes;
		timer = setTimeout(check, SLOW_STREAM_WINDOW_MS);
		timer.unref?.();
	};
	let timer = setTimeout(check, SLOW_STREAM_WINDOW_MS);
	timer.unref?.();
	return () => clearTimeout(timer);
}

export function createAttemptSignal(
	external: AbortSignal,
	timeoutMs: number,
	responseHeadersTimeoutMs: number
): {
	signal: AbortSignal;
	cleanup(): void;
	timedOut(): boolean;
	markResponseOpened(): void;
	timing(): ProviderAttemptTiming;
	abort(reason: Error): void;
} {
	const controller = new AbortController();
	const networkStartedAtMs = Date.now();
	let deadlineAtMs = networkStartedAtMs + responseHeadersTimeoutMs;
	let didTimeout = false;
	let responseOpenedAtMs: number | null = null;
	let timeoutFiredAtMs: number | null = null;
	const onAbort = () => controller.abort(external.reason);
	if (external.aborted) controller.abort(external.reason);
	else external.addEventListener('abort', onAbort, { once: true });
	const timeOut = () => {
		didTimeout = true;
		timeoutFiredAtMs = Date.now();
		controller.abort(
			new Error(`Agentic Chat provider timeout after ${deadlineAtMs - networkStartedAtMs}ms`)
		);
	};
	let timer = setTimeout(timeOut, responseHeadersTimeoutMs);
	timer.unref?.();
	return {
		signal: controller.signal,
		abort: (reason) => controller.abort(reason),
		cleanup: () => {
			clearTimeout(timer);
			external.removeEventListener('abort', onAbort);
		},
		timedOut: () => didTimeout,
		markResponseOpened: () => {
			if (responseOpenedAtMs !== null || controller.signal.aborted) return;
			responseOpenedAtMs ??= Date.now();
			clearTimeout(timer);
			deadlineAtMs = networkStartedAtMs + timeoutMs;
			timer = setTimeout(timeOut, Math.max(0, deadlineAtMs - Date.now()));
			timer.unref?.();
		},
		timing: () => ({
			networkStartedAtMs,
			deadlineAtMs,
			responseOpenedAtMs,
			timeoutFiredAtMs
		})
	};
}

export function providerAttemptTimingPayload(
	timing: ProviderAttemptTiming,
	endedAtMs: number
): JsonObject {
	return {
		network_started_at_ms: timing.networkStartedAtMs,
		deadline_at_ms: timing.deadlineAtMs,
		response_opened_at_ms: timing.responseOpenedAtMs,
		timeout_fired_at_ms: timing.timeoutFiredAtMs,
		timeout_overshoot_ms:
			timing.timeoutFiredAtMs === null
				? null
				: Math.max(0, timing.timeoutFiredAtMs - timing.deadlineAtMs),
		post_timeout_cleanup_ms:
			timing.timeoutFiredAtMs === null
				? null
				: Math.max(0, endedAtMs - timing.timeoutFiredAtMs),
		network_boundary_ms: boundedDuration(timing.networkStartedAtMs, endedAtMs)
	};
}

export function abortableProviderRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) {
		return Promise.reject(
			signal.reason instanceof Error ? signal.reason : new Error('Provider request aborted')
		);
	}
	const pendingRead = read();
	return new Promise<T>((resolve, reject) => {
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		const onAbort = () => {
			cleanup();
			reject(
				signal.reason instanceof Error
					? signal.reason
					: new Error('Provider request aborted')
			);
		};
		signal.addEventListener('abort', onAbort, { once: true });
		void pendingRead.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			}
		);
	});
}
