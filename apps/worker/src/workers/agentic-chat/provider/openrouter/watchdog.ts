// apps/worker/src/workers/agentic-chat/provider/openrouter/watchdog.ts
// Per-attempt deadlines: the header/body abort signal, the turn-budget bound on
// each attempt, abortable reads, and the slow-stream progress watch.
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatSlowStreamHedgeSignalV1 } from '../contracts';
import type { ActiveResponse, ClientInput, ProviderAttemptTiming, StreamState } from './types';
import { boundedDuration, estimateTokens } from './canonical';
import { AgenticChatFirstProgressStallError, AgenticChatSlowStreamError } from './errors';
import { OUTPUT_RECOVERY_MIN_REMAINING_MS, reportedReasoningTokens } from '../output-budget';

// A local progress heuristic, not a tokenizer or provider throughput guarantee.
// Only buffered V4.1 acting passes with an unused retry may abandon a slow stream.
const SLOW_STREAM_WINDOW_MS = 4_000;
const SLOW_STREAM_MIN_BYTES_PER_SECOND = 240;
/**
 * A watched pass with its retry left must stream its first reasoning, text, or
 * tool delta this soon after response headers (audit 2026-10-17 S9).
 */
export const WATCHED_FIRST_PROGRESS_TIMEOUT_MS = 15_000;
/**
 * DeepSeek ignores reasoning.max_tokens. In prod (09-25..10-17) every pass that hit
 * the 12k cap had >10.7k reasoning tokens, while six passes that reasoned 6.2k–11.5k
 * still answered well. 9k catches every cap-hitter and spares most long-but-good passes.
 */
export const RUNAWAY_REASONING_TOKEN_LIMIT = 9_000;
/** Attempt-receipt `error_class` and usage-log marker for the cutoff below. */
export const RUNAWAY_REASONING_CUTOFF = 'runaway_reasoning_cutoff';
/**
 * Reviewer first content. Prod 09-25..10-17 (OpenRouter generation latency,
 * 98 first attempts): max 8.8 s, p99 7.7 s, with reasoning excluded.
 */
export const REVIEWER_FIRST_PROGRESS_TIMEOUT_MS = 15_000;
/**
 * Reviewer output floor after first content. Same prod window: healthy reviews
 * streamed >= 49 tok/s; the degraded Azure attempts that ran 19–45 s streamed
 * 2.8–22.8 tok/s. ~100 B/s is ~25–30 tok/s of tool arguments.
 */
const REVIEWER_MIN_BYTES_PER_SECOND = 100;
const REVIEWER_PASS_ROLES: ReadonlySet<string> = new Set(['mutation_review', 'contract_review']);

/** A reviewer attempt abandoned by its watch; `errorClass` names it on the attempt receipt. */
export class AgenticChatReviewerStallError extends AgenticChatSlowStreamError {
	constructor(
		readonly errorClass: 'reviewer_first_progress_stall' | 'reviewer_slow_stream',
		windowMs: number,
		outputBytes: number,
		message: string
	) {
		super(windowMs, outputBytes, message);
	}
}

/** How one watched attempt is judged. Only an attempt with its retry left gets one. */
export type StreamWatchPolicy = {
	kind: 'acting' | 'reviewer';
	firstProgressTimeoutMs: number;
	minBytesPerSecond: number;
	appliesTo(model: string): boolean;
	firstProgressStall(waitedMs: number): Error;
	slowStream(windowMs: number, outputBytes: number): Error;
};

const ACTING_STREAM_WATCH: StreamWatchPolicy = {
	kind: 'acting',
	firstProgressTimeoutMs: WATCHED_FIRST_PROGRESS_TIMEOUT_MS,
	minBytesPerSecond: SLOW_STREAM_MIN_BYTES_PER_SECOND,
	appliesTo: (model) => isV41FlashModel(model),
	firstProgressStall: (waitedMs) =>
		new AgenticChatFirstProgressStallError(waitedMs, WATCHED_FIRST_PROGRESS_TIMEOUT_MS),
	slowStream: (windowMs, outputBytes) => new AgenticChatSlowStreamError(windowMs, outputBytes)
};

// Any reviewer model: the route's in-request fallbacks share the request.
const REVIEWER_STREAM_WATCH: StreamWatchPolicy = {
	kind: 'reviewer',
	firstProgressTimeoutMs: REVIEWER_FIRST_PROGRESS_TIMEOUT_MS,
	minBytesPerSecond: REVIEWER_MIN_BYTES_PER_SECOND,
	appliesTo: () => true,
	firstProgressStall: (waitedMs) =>
		new AgenticChatReviewerStallError(
			'reviewer_first_progress_stall',
			waitedMs,
			0,
			`Agentic Chat reviewer sent no output within ${REVIEWER_FIRST_PROGRESS_TIMEOUT_MS}ms of opening; retrying the review`
		),
	slowStream: (windowMs, outputBytes) =>
		new AgenticChatReviewerStallError(
			'reviewer_slow_stream',
			windowMs,
			outputBytes,
			`Agentic Chat reviewer streamed ${outputBytes} bytes in ${windowMs}ms; retrying the review`
		)
};
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

const WATCHED_PASS_ROLES: ReadonlySet<string> = new Set(['acting', 'repair', 'final_response']);

/**
 * Whether this attempt may be abandoned as a slow stream. A watched attempt
 * also asks the provider to stream its reasoning so the watch can see it.
 */
export function watchesStreamProgress(input: ClientInput, passRole: string, model: string) {
	return (
		input.allowSlowStreamRecovery === true &&
		WATCHED_PASS_ROLES.has(passRole) &&
		isV41FlashModel(model)
	);
}

/**
 * The watch for this attempt, or null. Reviewer passes are watched too, but
 * their request is unchanged: reasoning stays excluded (see the first-content
 * figures above), so only their tool-call output counts as progress.
 */
export function streamWatchPolicy(
	input: ClientInput,
	passRole: string,
	model: string
): StreamWatchPolicy | null {
	if (watchesStreamProgress(input, passRole, model)) return ACTING_STREAM_WATCH;
	if (input.allowSlowStreamRecovery === true && REVIEWER_PASS_ROLES.has(passRole))
		return REVIEWER_STREAM_WATCH;
	return null;
}

/**
 * Reasoning tokens streamed so far: the provider's count when a frame already
 * carried usage, else streamed reasoning characters / 4.
 */
export function streamedReasoningTokens(state: StreamState): number {
	return reportedReasoningTokens(state.rawUsage) ?? estimateTokens(state.reasoningChars);
}

/**
 * The estimated reasoning tokens when a watched pass that may still claim its
 * reasoning-off recovery has reasoned past the limit without any text or
 * tool-call delta; otherwise null. Checked as frames arrive, so a runaway pass
 * ends at the limit instead of at the output cap (audit 2026-10-17 S2).
 */
export function runawayReasoningTokens(
	state: StreamState,
	input: ClientInput,
	model: string,
	limit = RUNAWAY_REASONING_TOKEN_LIMIT
): number | null {
	if (input.allowRunawayReasoningCutoff !== true) return null;
	if (input.mayAbandon?.() === false) return null;
	if (state.finishReason !== null || state.completionChars > 0) return null;
	if (!isV41FlashModel(model)) return null;
	// Too little budget left for the recovery: let the pass run as before.
	if (input.budget && input.budget.deadlineAtMs - Date.now() < OUTPUT_RECOVERY_MIN_REMAINING_MS)
		return null;
	const tokens = streamedReasoningTokens(state);
	return tokens > limit ? tokens : null;
}

export function watchStreamProgress(
	active: ActiveResponse,
	state: StreamState,
	input: ClientInput,
	policy: StreamWatchPolicy = ACTING_STREAM_WATCH
): () => void {
	const openedAtMs = Date.now();
	let startedAtMs = openedAtMs;
	let startedBytes = 0;
	let dueAtMs = openedAtMs;
	const progressBytes = () => state.generatedBytes + state.reasoningBytes;
	const schedule = (delayMs: number) => {
		dueAtMs = Date.now() + delayMs;
		timer = setTimeout(check, delayMs);
		timer.unref?.();
	};
	const check = () => {
		if (active.signal.aborted || state.finishReason !== null) return;
		if (!policy.appliesTo(state.modelUsed ?? active.route.model)) return;
		// The pass's last chance (its backup failed): slow beats nothing.
		if (input.mayAbandon?.() === false) return;
		const now = Date.now();
		// Preserve enough time for the existing retry and terminal settlement.
		if (
			input.budget &&
			input.budget.deadlineAtMs - now <
				MIN_ATTEMPT_TIMEOUT_MS + BUDGET_FINALIZATION_RESERVE_MS
		)
			return;
		// Judge throughput only over full windows of generation. Measuring from
		// stream open killed healthy streams whose first byte came late: 9 of 9
		// gate aborts on 2026-09-24 were generating at 80–200 tok/s, mostly
		// reasoning (tasker 101). Silence before the first delta (reasoning
		// counts) has its own, longer deadline instead of the 90 s attempt one.
		if (state.firstProgressAtMs === null) {
			const waited = now - openedAtMs;
			// A late timer may mean a suspended host with unread bytes: give the
			// pending read one turn of the event loop before judging.
			if (waited >= policy.firstProgressTimeoutMs && now - dueAtMs <= SLOW_STREAM_WINDOW_MS) {
				active.abort(policy.firstProgressStall(waited));
				return;
			}
			startedAtMs = now;
			schedule(
				Math.max(1, Math.min(SLOW_STREAM_WINDOW_MS, policy.firstProgressTimeoutMs - waited))
			);
			return;
		}
		startedAtMs = Math.max(startedAtMs, state.firstProgressAtMs);
		const elapsed = now - startedAtMs;
		if (elapsed < SLOW_STREAM_WINDOW_MS) {
			schedule(SLOW_STREAM_WINDOW_MS - elapsed);
			return;
		}
		const bytes = progressBytes() - startedBytes;
		// A suspended host is not evidence of slow provider generation.
		if (
			elapsed <= SLOW_STREAM_WINDOW_MS * 2 &&
			bytes * 1_000 < policy.minBytesPerSecond * elapsed
		) {
			active.abort(policy.slowStream(elapsed, bytes));
			return;
		}
		startedAtMs = now;
		startedBytes = progressBytes();
		schedule(SLOW_STREAM_WINDOW_MS);
	};
	let timer: ReturnType<typeof setTimeout>;
	schedule(SLOW_STREAM_WINDOW_MS);
	return () => clearTimeout(timer);
}

/**
 * Backup-request trigger (hedge). The slow-stream watch above ends a stream only
 * after a full 4 s window below the floor; the hedge asks for a backup sooner and
 * leaves the stream running, so the faster of the two wins. Prod 10-18: one
 * Together stream fell to ~18 tok/s mid-pass and was ended at 8.45 s. OpenRouter
 * generation stats for 267 successful V4.1 acting passes (10-04..10-18): p50
 * 265 tok/s, p10 160, slowest 29 (a 14 s Together pass this would have hedged);
 * the 240 B/s floor is ~60 tok/s.
 */
export const HEDGE_SLOW_WINDOW_MS = 2_000;
/**
 * Silence after response headers before a backup is requested (the stall abort
 * waits 15 s). Same 300 passes: time to first token p50 314 ms, p99 3.1 s, max 4.9 s.
 */
export const HEDGE_FIRST_PROGRESS_MS = 6_000;
const HEDGE_SAMPLE_MS = 500;

/**
 * Calls `onHedge` at most once: when output over the last 2 s of generation
 * falls below the acting floor, or when nothing has streamed 6 s after the
 * response opened. Never aborts. Stops when the stream ends or the turn has
 * too little budget left for a second request. A late timer (a suspended or
 * busy host) restarts the judgment instead of counting as provider silence.
 */
export function watchForSlowStreamHedge(
	active: ActiveResponse,
	state: StreamState,
	input: ClientInput,
	onHedge: (signal: Omit<AgenticChatSlowStreamHedgeSignalV1, 'providerSlug'>) => void
): () => void {
	let openedAtMs = Date.now();
	let dueAtMs = openedAtMs + HEDGE_SAMPLE_MS;
	const progressBytes = () => state.generatedBytes + state.reasoningBytes;
	let samples: { atMs: number; bytes: number }[] = [];
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const fire = (signal: Omit<AgenticChatSlowStreamHedgeSignalV1, 'providerSlug'>) => {
		stopped = true;
		try {
			onHedge(signal);
		} catch {
			// A backup that cannot start leaves this stream exactly as it was.
		}
	};
	const tick = () => {
		if (stopped || active.signal.aborted || state.finishReason !== null) return;
		const now = Date.now();
		if (
			input.budget &&
			input.budget.deadlineAtMs - now <
				MIN_ATTEMPT_TIMEOUT_MS + BUDGET_FINALIZATION_RESERVE_MS
		)
			return;
		const late = now - dueAtMs > HEDGE_SLOW_WINDOW_MS;
		if (state.firstProgressAtMs === null) {
			// Silence measured across a suspended host is not the provider's.
			if (late) openedAtMs = now - HEDGE_SAMPLE_MS;
			const waited = now - openedAtMs;
			if (waited >= HEDGE_FIRST_PROGRESS_MS) {
				fire({ reason: 'no_first_progress', elapsedMs: waited, outputBytes: 0 });
				return;
			}
		} else {
			const bytes = progressBytes();
			samples.push({ atMs: now, bytes });
			// Keep the newest sample that is at least a window old as the baseline.
			while (samples.length > 1 && now - samples[1]!.atMs >= HEDGE_SLOW_WINDOW_MS) {
				samples.shift();
			}
			const baseline = samples[0]!;
			const span = now - baseline.atMs;
			if (late || span > HEDGE_SLOW_WINDOW_MS * 2) {
				// Late timers mean a suspended host, not a slow provider: start over.
				samples = [{ atMs: now, bytes }];
			} else if (
				span >= HEDGE_SLOW_WINDOW_MS &&
				(bytes - baseline.bytes) * 1_000 < SLOW_STREAM_MIN_BYTES_PER_SECOND * span
			) {
				fire({
					reason: 'slow_stream',
					elapsedMs: span,
					outputBytes: bytes - baseline.bytes
				});
				return;
			}
		}
		dueAtMs = Date.now() + HEDGE_SAMPLE_MS;
		timer = setTimeout(tick, HEDGE_SAMPLE_MS);
		timer.unref?.();
	};
	timer = setTimeout(tick, HEDGE_SAMPLE_MS);
	timer.unref?.();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
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
