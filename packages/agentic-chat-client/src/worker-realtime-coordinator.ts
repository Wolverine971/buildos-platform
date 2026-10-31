// packages/agentic-chat-client/src/worker-realtime-coordinator.ts
import type {
	AgenticChatLiveTextPreviewV1,
	AgenticChatReconcileRpcResultV1,
	AgentStreamEventV1,
	TurnHandleV1
} from '@buildos/shared-types';
import {
	AgenticChatWorkerRealtimeInbox,
	type AgenticChatWorkerReconciledReceipt,
	type AgenticChatWorkerReconciliationReason,
	type AgenticChatWorkerTurnObserver
} from './worker-realtime-inbox';
import { parseAgenticChatLiveTextPreview } from './worker-realtime-preview';

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

export type AgenticChatWorkerReconciliationRequest = Parameters<
	AgenticChatWorkerTurnObserver['requestReconciliation']
>[0];

export type AgenticChatWorkerReconciliationLoss = {
	/**
	 * True when this browser can never reconcile the turn (HTTP 404/409): the
	 * coordinator has stopped following it. False after repeated failures of
	 * any kind; reconciliation keeps retrying and a success restores it.
	 */
	permanent: boolean;
	httpStatus: number | null;
};

export type AgenticChatWorkerApplicationObserver = {
	applyLiveEvent(event: AgentStreamEventV1): void;
	applyReconciliation(receipt: AgenticChatWorkerReconciledReceipt): void;
	/**
	 * Display-only live answer preview. Delivered outside the sequenced inbox:
	 * it never advances the durable cursor, buffers, or triggers reconciliation.
	 */
	applyPreview?(preview: AgenticChatLiveTextPreviewV1): void;
	/** Reconciliation cannot follow this turn (see AgenticChatWorkerReconciliationLoss). */
	reportReconciliationLost?(loss: AgenticChatWorkerReconciliationLoss): void;
	/** A reconcile succeeded after a non-permanent loss was reported. */
	reportReconciliationRestored?(): void;
};

export type AgenticChatWorkerRealtimeCoordinatorOptions = {
	inbox?: AgenticChatWorkerRealtimeInbox;
	fetchImpl?: typeof fetch;
	changedWatchdogMs?: number;
	unchangedWatchdogMs?: number;
	/**
	 * While the private channel is subscribed and a contiguous live event landed
	 * within this window, a due watchdog is deferred instead of reconciling. A
	 * watchdog reconcile buffers live events until its receipt returns, which
	 * froze streaming text every ~2s even though nothing was missing.
	 */
	liveHealthyWindowMs?: number;
	/** Upper bound on consecutive deferrals: durable truth is re-read at least this often. */
	maxLiveOnlyMs?: number;
	retryMs?: number;
	/** Consecutive failed reconciles before the turn's observer hears it is lost. */
	maxConsecutiveFailures?: number;
	/** Retry delay cap once a loss has been reported (the delay doubles up to it). */
	maxRetryMs?: number;
	requestTimeoutMs?: number;
	/**
	 * Refresh the auth session after a 401; resolves true when a fresh session
	 * exists. Tried once per failure streak, then the request retries at once.
	 */
	refreshAuthSession?: () => Promise<boolean>;
	random?: () => number;
	now?: () => number;
	onError?: (error: unknown) => void;
};

type CoordinatedTurn = {
	handle: WorkerTurnHandle;
	observer: AgenticChatWorkerApplicationObserver;
	unregisterInbox: (() => void) | null;
	queuedRequest: AgenticChatWorkerReconciliationRequest | null;
	inFlightRequest: AgenticChatWorkerReconciliationRequest | null;
	inFlightController: AbortController | null;
	inFlight: Promise<void> | null;
	timer: ReturnType<typeof setTimeout> | null;
	requestEpoch: number;
	lastFingerprint: string | null;
	terminal: boolean;
	backingOff: boolean;
	throttlingQueuedRequest: boolean;
	lastLiveEventAt: number | null;
	lastReconciledAt: number | null;
	consecutiveFailures: number;
	authRefreshTried: boolean;
	lossReported: boolean;
	/**
	 * The known generation whose generation_changed follow-up already skipped the
	 * changed-state throttle. One skip per generation keeps a lagging receipt
	 * from turning the exemption into a request loop.
	 */
	generationBypassFrom: number | null;
};

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
/** The turn is gone or not a worker turn for this user: retrying cannot help. */
const PERMANENT_RECONCILE_STATUSES = new Set([404, 409]);

export class AgenticChatReconciliationHttpError extends Error {
	constructor(readonly status: number) {
		super(`Agentic Chat reconciliation failed with HTTP ${status}`);
		this.name = 'AgenticChatReconciliationHttpError';
	}
}

export class AgenticChatReconciliationProtocolError extends Error {
	constructor() {
		super('Agentic Chat reconciliation returned an invalid receipt');
		this.name = 'AgenticChatReconciliationProtocolError';
	}
}

export class AgenticChatReconciliationTimeoutError extends Error {
	constructor(readonly timeoutMs: number) {
		super(`Agentic Chat reconciliation exceeded ${timeoutMs}ms`);
		this.name = 'AgenticChatReconciliationTimeoutError';
	}
}

export class AgenticChatWorkerRealtimeCoordinator {
	readonly inbox: AgenticChatWorkerRealtimeInbox;
	readonly #fetch: typeof fetch;
	readonly #changedWatchdogMs: number;
	readonly #unchangedWatchdogMs: number;
	readonly #liveHealthyWindowMs: number;
	readonly #maxLiveOnlyMs: number;
	readonly #retryMs: number;
	readonly #maxConsecutiveFailures: number;
	readonly #maxRetryMs: number;
	readonly #requestTimeoutMs: number;
	readonly #refreshAuthSession?: () => Promise<boolean>;
	readonly #random: () => number;
	readonly #now: () => number;
	readonly #onError?: (error: unknown) => void;
	readonly #turns = new Map<string, CoordinatedTurn>();
	#running = false;
	#liveChannelSubscribed = false;

	constructor(options: AgenticChatWorkerRealtimeCoordinatorOptions = {}) {
		this.inbox =
			options.inbox ?? new AgenticChatWorkerRealtimeInbox({ onError: options.onError });
		this.#fetch = options.fetchImpl ?? fetch;
		this.#changedWatchdogMs = positiveSafeInteger(
			options.changedWatchdogMs ?? 2_000,
			'changedWatchdogMs'
		);
		this.#unchangedWatchdogMs = positiveSafeInteger(
			options.unchangedWatchdogMs ?? 5_000,
			'unchangedWatchdogMs'
		);
		this.#liveHealthyWindowMs = positiveSafeInteger(
			options.liveHealthyWindowMs ?? 4_000,
			'liveHealthyWindowMs'
		);
		this.#maxLiveOnlyMs = positiveSafeInteger(options.maxLiveOnlyMs ?? 30_000, 'maxLiveOnlyMs');
		this.#retryMs = positiveSafeInteger(options.retryMs ?? 5_000, 'retryMs');
		this.#maxConsecutiveFailures = positiveSafeInteger(
			options.maxConsecutiveFailures ?? 5,
			'maxConsecutiveFailures'
		);
		this.#maxRetryMs = Math.max(
			this.#retryMs,
			positiveSafeInteger(options.maxRetryMs ?? 60_000, 'maxRetryMs')
		);
		this.#requestTimeoutMs = positiveSafeInteger(
			options.requestTimeoutMs ?? 15_000,
			'requestTimeoutMs'
		);
		this.#refreshAuthSession = options.refreshAuthSession;
		this.#random = options.random ?? Math.random;
		this.#now = options.now ?? Date.now;
		this.#onError = options.onError;
	}

	get running(): boolean {
		return this.#running;
	}

	get trackedTurnCount(): number {
		return this.#turns.size;
	}

	/**
	 * Transport status from the owning channel. Only a subscribed channel lets a
	 * healthy live stream defer the watchdog; everything else polls as before.
	 */
	setLiveChannelSubscribed(subscribed: boolean): void {
		this.#liveChannelSubscribed = subscribed;
	}

	start(): void {
		if (this.#running) return;
		this.#running = true;
		for (const state of this.#turns.values()) {
			if (state.terminal) continue;
			if (state.queuedRequest) {
				void this.#drain(state);
			} else {
				this.inbox.requestReconciliation(state.handle.turnRunId, 'watchdog');
			}
		}
	}

	stop(): void {
		if (!this.#running && this.#turns.size === 0) return;
		this.#running = false;
		for (const state of this.#turns.values()) {
			this.#clearTimer(state);
			state.requestEpoch += 1;
			state.inFlightController?.abort();
			state.inFlightController = null;
			state.inFlightRequest = null;
			state.inFlight = null;
			state.queuedRequest = null;
			state.backingOff = false;
			state.throttlingQueuedRequest = false;
			this.inbox.releaseReconciliationRequest(state.handle.turnRunId);
		}
	}

	clearTurns(): void {
		for (const turnRunId of [...this.#turns.keys()]) {
			this.unregisterTurn(turnRunId);
		}
	}

	registerTurn(input: {
		handle: WorkerTurnHandle;
		observer: AgenticChatWorkerApplicationObserver;
		executionGeneration?: number;
		lastAppliedSequence?: number;
	}): () => void {
		if (this.#turns.has(input.handle.turnRunId)) {
			throw new Error(`Worker turn ${input.handle.turnRunId} is already coordinated`);
		}

		const state: CoordinatedTurn = {
			handle: input.handle,
			observer: input.observer,
			unregisterInbox: null,
			queuedRequest: null,
			inFlightRequest: null,
			inFlightController: null,
			inFlight: null,
			timer: null,
			requestEpoch: 0,
			lastFingerprint: null,
			terminal: false,
			backingOff: false,
			throttlingQueuedRequest: false,
			lastLiveEventAt: null,
			lastReconciledAt: null,
			consecutiveFailures: 0,
			authRefreshTried: false,
			lossReported: false,
			generationBypassFrom: null
		};
		this.#turns.set(input.handle.turnRunId, state);
		try {
			state.unregisterInbox = this.inbox.registerTurn({
				handle: input.handle,
				executionGeneration: input.executionGeneration,
				lastAppliedSequence: input.lastAppliedSequence,
				observer: {
					applyLiveEvent: (event) => {
						input.observer.applyLiveEvent(event);
						// The inbox only applies contiguous current-generation events.
						state.lastLiveEventAt = this.#now();
					},
					applyReconciliation: (receipt) => input.observer.applyReconciliation(receipt),
					requestReconciliation: (request) => this.#queue(state, request)
				}
			});
		} catch (error) {
			this.#turns.delete(input.handle.turnRunId);
			throw error;
		}

		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			this.unregisterTurn(input.handle.turnRunId);
		};
	}

	unregisterTurn(turnRunId: string): void {
		const state = this.#turns.get(turnRunId);
		if (!state) return;
		this.#turns.delete(turnRunId);
		this.#clearTimer(state);
		state.requestEpoch += 1;
		state.inFlightController?.abort();
		state.inFlightController = null;
		state.unregisterInbox?.();
		state.unregisterInbox = null;
	}

	/**
	 * Route a live-preview broadcast to its registered turn. Invalid, unknown,
	 * cross-session, or terminal-turn previews are dropped silently: a preview is
	 * never evidence of anything, so it never requests reconciliation.
	 */
	receivePreview(value: unknown): void {
		const preview = parseAgenticChatLiveTextPreview(value);
		if (!preview) return;
		const state = this.#turns.get(preview.turn_run_id);
		if (!state || state.terminal || preview.session_id !== state.handle.sessionId) return;
		try {
			state.observer.applyPreview?.(preview);
		} catch (error) {
			this.#reportError(error);
		}
	}

	requestAll(reason: AgenticChatWorkerReconciliationReason = 'watchdog'): void {
		if (!this.#running) return;
		for (const state of this.#turns.values()) {
			if (!state.terminal) {
				this.inbox.requestReconciliation(state.handle.turnRunId, reason);
			}
		}
	}

	#queue(state: CoordinatedTurn, request: AgenticChatWorkerReconciliationRequest): void {
		if (this.#turns.get(state.handle.turnRunId) !== state || state.terminal) return;
		state.queuedRequest = request;
		if (state.backingOff) return;
		if (state.throttlingQueuedRequest) {
			if (state.inFlight || !this.#takeGenerationBypass(state, request)) return;
		}
		this.#clearTimer(state);
		if (this.#running && !state.inFlight) void this.#drain(state);
	}

	async #drain(state: CoordinatedTurn): Promise<void> {
		if (
			!this.#running ||
			state.inFlight ||
			state.terminal ||
			this.#turns.get(state.handle.turnRunId) !== state
		) {
			return;
		}
		const request = state.queuedRequest;
		if (!request) return;
		state.queuedRequest = null;
		state.inFlightRequest = request;
		const controller = new AbortController();
		state.inFlightController = controller;
		const epoch = ++state.requestEpoch;

		const operation = this.#runRequest(state, request, controller.signal, epoch);
		state.inFlight = operation;
		try {
			await operation;
		} finally {
			if (state.inFlight === operation) state.inFlight = null;
			if (state.inFlightController === controller) state.inFlightController = null;
			if (state.inFlightRequest === request) state.inFlightRequest = null;
			if (
				this.#running &&
				state.queuedRequest &&
				!state.backingOff &&
				!state.terminal &&
				this.#turns.get(state.handle.turnRunId) === state
			) {
				// Triggers that arrive during a request stay behind the normal
				// changed-state cadence. A signal/channel storm therefore cannot drain
				// back-to-back and recreate the canary-10 ~3 requests/second runaway.
				// The one exception is a newer generation (a claim landing while the
				// pre-claim receipt was in flight): at most once per generation.
				if (this.#takeGenerationBypass(state, state.queuedRequest)) {
					void this.#drain(state);
				} else {
					this.#schedule(state, this.#jitteredChangedDelay(), true);
				}
			}
		}
	}

	async #runRequest(
		state: CoordinatedTurn,
		request: AgenticChatWorkerReconciliationRequest,
		signal: AbortSignal,
		epoch: number
	): Promise<void> {
		let nextDelay: number | null = null;
		try {
			const receipt = await this.#fetchReceipt(request, signal);
			if (!this.#isCurrent(state, epoch)) return;
			const accepted = this.inbox.applyReconciliation(state.handle.turnRunId, receipt);
			if (!this.#isCurrent(state, epoch)) return;
			if (!accepted) {
				// The inbox deliberately requests reconciliation again when receipt
				// validation or application fails. Consume that synchronous request here
				// so a malformed 200 response cannot become an immediate retry loop.
				state.queuedRequest = request;
				this.inbox.releaseReconciliationRequest(state.handle.turnRunId);
				state.backingOff = true;
				this.#reportError(new AgenticChatReconciliationProtocolError());
				nextDelay = this.#recordFailure(state);
			} else {
				this.#recordSuccess(state);
				const reconciled = receipt as AgenticChatWorkerReconciledReceipt;
				state.lastReconciledAt = this.#now();
				const fingerprint = reconciliationFingerprint(reconciled);
				const unchanged = state.lastFingerprint === fingerprint;
				state.lastFingerprint = fingerprint;
				state.terminal = TERMINAL_STATUSES.has(reconciled.status);
				if (!state.terminal) {
					nextDelay = unchanged
						? this.#unchangedWatchdogMs
						: this.#jitteredChangedDelay();
				}
			}
		} catch (error) {
			if (!this.#isCurrent(state, epoch) || isAbortError(error)) return;
			state.queuedRequest = request;
			this.inbox.releaseReconciliationRequest(state.handle.turnRunId);
			state.backingOff = true;
			this.#reportError(error);
			const httpStatus =
				error instanceof AgenticChatReconciliationHttpError ? error.status : null;
			if (httpStatus !== null && PERMANENT_RECONCILE_STATUSES.has(httpStatus)) {
				this.#abandon(state, httpStatus);
				return;
			}
			nextDelay = this.#recordFailure(state, httpStatus);
			if (httpStatus === 401 && this.#refreshAuthSession && !state.authRefreshTried) {
				state.authRefreshTried = true;
				const refreshed = await this.#tryRefreshAuthSession();
				if (!this.#isCurrent(state, epoch)) return;
				if (refreshed) nextDelay = 0;
			}
		}

		if (
			nextDelay !== null &&
			this.#isCurrent(state, epoch) &&
			(state.backingOff || !state.queuedRequest) &&
			!state.terminal
		) {
			this.#schedule(state, nextDelay);
		}
	}

	async #fetchReceipt(
		request: AgenticChatWorkerReconciliationRequest,
		signal: AbortSignal
	): Promise<AgenticChatReconcileRpcResultV1> {
		const query = new URLSearchParams({
			generation: String(request.executionGeneration),
			after: String(request.afterDurableSequence),
			// Diagnostic only, ignored by the route: puts the requesting loop's
			// trigger into edge logs so a reconcile runaway (1,314 calls at ~3/s
			// during the 2026-08-06 canary) names its own cause next time.
			reason: request.reason
		});
		const controller = new AbortController();
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let abortListener: (() => void) | null = null;
		const operation = (async () => {
			const response = await this.#fetch(
				`/api/agent/v2/turns/${encodeURIComponent(request.handle.turnRunId)}/reconcile?${query}`,
				{
					method: 'GET',
					headers: { Accept: 'application/json' },
					credentials: 'same-origin',
					cache: 'no-store',
					signal: controller.signal
				}
			);
			if (!response.ok) throw new AgenticChatReconciliationHttpError(response.status);
			const payload: unknown = await response.json();
			if (!isRecord(payload) || payload.success !== true || !('data' in payload)) {
				throw new Error('Invalid Agentic Chat reconciliation API response');
			}
			return payload.data as AgenticChatReconcileRpcResultV1;
		})();
		const lifecycleAbort = new Promise<never>((_resolve, reject) => {
			abortListener = () => {
				controller.abort();
				reject(createAbortError());
			};
			if (signal.aborted) abortListener();
			else signal.addEventListener('abort', abortListener, { once: true });
		});
		const requestTimeout = new Promise<never>((_resolve, reject) => {
			timeout = setTimeout(() => {
				// Reject the authoritative deadline first so a fetch implementation that
				// reports its abort synchronously cannot make this look like lifecycle
				// teardown and accidentally suppress the retry.
				reject(new AgenticChatReconciliationTimeoutError(this.#requestTimeoutMs));
				controller.abort();
			}, this.#requestTimeoutMs);
		});

		try {
			return await Promise.race([operation, lifecycleAbort, requestTimeout]);
		} finally {
			if (timeout !== null) clearTimeout(timeout);
			if (abortListener) signal.removeEventListener('abort', abortListener);
		}
	}

	/** Counts a failed reconcile and returns the delay before the next try. */
	#recordFailure(state: CoordinatedTurn, httpStatus: number | null = null): number {
		state.consecutiveFailures += 1;
		const overLimit = state.consecutiveFailures - this.#maxConsecutiveFailures;
		if (overLimit < 0) return this.#retryMs;
		if (!state.lossReported) {
			state.lossReported = true;
			this.#notifyObserver(state, (observer) =>
				observer.reportReconciliationLost?.({ permanent: false, httpStatus })
			);
		}
		return Math.min(this.#retryMs * 2 ** (overLimit + 1), this.#maxRetryMs);
	}

	#recordSuccess(state: CoordinatedTurn): void {
		state.consecutiveFailures = 0;
		state.authRefreshTried = false;
		if (!state.lossReported) return;
		state.lossReported = false;
		this.#notifyObserver(state, (observer) => observer.reportReconciliationRestored?.());
	}

	/** The server will never reconcile this turn here: stop and tell the observer. */
	#abandon(state: CoordinatedTurn, httpStatus: number): void {
		state.terminal = true;
		state.queuedRequest = null;
		state.backingOff = false;
		this.#clearTimer(state);
		this.inbox.releaseReconciliationRequest(state.handle.turnRunId);
		this.#notifyObserver(state, (observer) =>
			observer.reportReconciliationLost?.({ permanent: true, httpStatus })
		);
	}

	async #tryRefreshAuthSession(): Promise<boolean> {
		try {
			return (await this.#refreshAuthSession?.()) === true;
		} catch (error) {
			this.#reportError(error);
			return false;
		}
	}

	#notifyObserver(
		state: CoordinatedTurn,
		notify: (observer: AgenticChatWorkerApplicationObserver) => void
	): void {
		try {
			notify(state.observer);
		} catch (error) {
			this.#reportError(error);
		}
	}

	#schedule(state: CoordinatedTurn, delayMs: number, throttleQueuedRequest = false): void {
		this.#clearTimer(state);
		state.throttlingQueuedRequest = throttleQueuedRequest;
		state.timer = setTimeout(() => {
			state.timer = null;
			state.throttlingQueuedRequest = false;
			if (
				!this.#running ||
				state.terminal ||
				this.#turns.get(state.handle.turnRunId) !== state
			) {
				return;
			}
			if (state.backingOff) {
				state.backingOff = false;
			}
			if (state.queuedRequest) {
				void this.#drain(state);
				return;
			}
			const deferMs = this.#liveStreamDeferral(state);
			if (deferMs !== null) {
				this.#schedule(state, deferMs);
				return;
			}
			this.inbox.requestReconciliation(state.handle.turnRunId, 'watchdog');
		}, delayMs);
	}

	/**
	 * Returns how long a due watchdog may wait while the live stream is proving
	 * itself, or null when durable truth must be read now. Gaps, hints, channel
	 * changes, and tab return never pass through here: they reconcile at once.
	 */
	#liveStreamDeferral(state: CoordinatedTurn): number | null {
		if (!this.#liveChannelSubscribed) return null;
		if (state.lastLiveEventAt === null || state.lastReconciledAt === null) return null;
		const now = this.#now();
		const liveDeadline = state.lastLiveEventAt + this.#liveHealthyWindowMs;
		const reconcileDeadline = state.lastReconciledAt + this.#maxLiveOnlyMs;
		const deferMs = Math.min(liveDeadline, reconcileDeadline) - now;
		return deferMs > 0 ? Math.ceil(deferMs) : null;
	}

	#takeGenerationBypass(
		state: CoordinatedTurn,
		request: AgenticChatWorkerReconciliationRequest
	): boolean {
		if (request.reason !== 'generation_changed') return false;
		if (
			state.generationBypassFrom !== null &&
			state.generationBypassFrom >= request.executionGeneration
		) {
			return false;
		}
		state.generationBypassFrom = request.executionGeneration;
		return true;
	}

	#clearTimer(state: CoordinatedTurn): void {
		if (state.timer === null) return;
		clearTimeout(state.timer);
		state.timer = null;
		state.throttlingQueuedRequest = false;
	}

	#jitteredChangedDelay(): number {
		const sample = this.#random();
		const bounded = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
		return Math.round(this.#changedWatchdogMs * (0.85 + bounded * 0.3));
	}

	#isCurrent(state: CoordinatedTurn, epoch: number): boolean {
		return (
			this.#running &&
			state.requestEpoch === epoch &&
			this.#turns.get(state.handle.turnRunId) === state
		);
	}

	#reportError(error: unknown): void {
		try {
			this.#onError?.(error);
		} catch {
			// Telemetry cannot own reconciliation progress.
		}
	}
}

function reconciliationFingerprint(receipt: AgenticChatWorkerReconciledReceipt): string {
	return [
		receipt.execution_generation,
		receipt.response_watermark,
		receipt.status,
		receipt.reconcile_required,
		receipt.updated_at
	].join(':');
}

function positiveSafeInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be positive`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAbortError(value: unknown): boolean {
	return value instanceof DOMException
		? value.name === 'AbortError'
		: value instanceof Error && value.name === 'AbortError';
}

function createAbortError(): Error {
	if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
	const error = new Error('Aborted');
	error.name = 'AbortError';
	return error;
}
