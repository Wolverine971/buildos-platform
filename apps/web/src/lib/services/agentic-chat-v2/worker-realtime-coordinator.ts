// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.ts
import type {
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

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

export type AgenticChatWorkerReconciliationRequest = Parameters<
	AgenticChatWorkerTurnObserver['requestReconciliation']
>[0];

export type AgenticChatWorkerApplicationObserver = {
	applyLiveEvent(event: AgentStreamEventV1): void;
	applyReconciliation(receipt: AgenticChatWorkerReconciledReceipt): void;
};

export type AgenticChatWorkerRealtimeCoordinatorOptions = {
	inbox?: AgenticChatWorkerRealtimeInbox;
	fetchImpl?: typeof fetch;
	changedWatchdogMs?: number;
	unchangedWatchdogMs?: number;
	retryMs?: number;
	requestTimeoutMs?: number;
	random?: () => number;
	onError?: (error: unknown) => void;
};

type CoordinatedTurn = {
	handle: WorkerTurnHandle;
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
};

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

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
	readonly #retryMs: number;
	readonly #requestTimeoutMs: number;
	readonly #random: () => number;
	readonly #onError?: (error: unknown) => void;
	readonly #turns = new Map<string, CoordinatedTurn>();
	#running = false;

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
		this.#retryMs = positiveSafeInteger(options.retryMs ?? 5_000, 'retryMs');
		this.#requestTimeoutMs = positiveSafeInteger(
			options.requestTimeoutMs ?? 15_000,
			'requestTimeoutMs'
		);
		this.#random = options.random ?? Math.random;
		this.#onError = options.onError;
	}

	get running(): boolean {
		return this.#running;
	}

	get trackedTurnCount(): number {
		return this.#turns.size;
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
			throttlingQueuedRequest: false
		};
		this.#turns.set(input.handle.turnRunId, state);
		try {
			state.unregisterInbox = this.inbox.registerTurn({
				handle: input.handle,
				executionGeneration: input.executionGeneration,
				lastAppliedSequence: input.lastAppliedSequence,
				observer: {
					applyLiveEvent: (event) => input.observer.applyLiveEvent(event),
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
		if (state.backingOff || state.throttlingQueuedRequest) return;
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
				this.#schedule(state, this.#jitteredChangedDelay(), true);
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
				nextDelay = this.#retryMs;
			} else {
				const reconciled = receipt as AgenticChatWorkerReconciledReceipt;
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
			nextDelay = this.#retryMs;
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
			this.inbox.requestReconciliation(state.handle.turnRunId, 'watchdog');
		}, delayMs);
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
