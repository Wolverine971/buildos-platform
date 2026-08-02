// apps/worker/src/workers/agentic-chat/cancellationObserver.ts

import {
	AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS,
	AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS,
	type AgenticChatCancellationObservationInputV1,
	type AgenticChatCancellationObservationRpcResultV1,
	type AgenticChatCancellationObservationV1
} from '@buildos/shared-types';

export const DEFAULT_AGENTIC_CHAT_CANCELLATION_OBSERVER_CONFIG = {
	pollIntervalMs: AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS,
	rpcMaxPairs: AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS,
	consumerConcurrency: 1,
	shutdownWaitMs: 2_000
} as const;

export type AgenticChatCancellationObserverConfig = {
	[key in keyof typeof DEFAULT_AGENTIC_CHAT_CANCELLATION_OBSERVER_CONFIG]: number;
};

export type AgenticChatCancellationObservationPortV1 = {
	observe(
		inputs: AgenticChatCancellationObservationInputV1[]
	): Promise<AgenticChatCancellationObservationRpcResultV1>;
};

export type AgenticChatCancellationRegistrationV1 = {
	turnRunId: string;
	executionGeneration: number;
	onCancellation?: (error: AgenticChatCancellationError) => void;
};

export type AgenticChatCancellationObserverMetricV1 =
	| 'cancel_observed'
	| 'poll_failed'
	| 'invalid_receipt';

type RegisteredTurn = {
	context: AgenticChatCancellationRegistrationV1;
	controller: AbortController;
};

export class AgenticChatCancellationError extends Error {
	readonly code = 'cancel_requested';
	readonly turnRunId: string;
	readonly executionGeneration: number;
	readonly signalId: string;
	readonly cancelReason: AgenticChatCancellationObservationV1['cancel_reason'];
	readonly cancelSource: AgenticChatCancellationObservationV1['cancel_source'];
	readonly cancelRequestedAt: string;
	readonly consumedAt: string;

	constructor(receipt: AgenticChatCancellationObservationV1) {
		super(`Cancellation requested for Agentic Chat turn ${receipt.turn_run_id}`);
		this.name = 'AgenticChatCancellationError';
		this.turnRunId = receipt.turn_run_id;
		this.executionGeneration = receipt.execution_generation;
		this.signalId = receipt.signal_id;
		this.cancelReason = receipt.cancel_reason;
		this.cancelSource = receipt.cancel_source;
		this.cancelRequestedAt = receipt.cancel_requested_at;
		this.consumedAt = receipt.consumed_at;
	}
}

export class AgenticChatCancellationObserver {
	private readonly config: AgenticChatCancellationObserverConfig;
	private readonly turns = new Map<string, RegisteredTurn>();
	private timer: NodeJS.Timeout | null = null;
	private inFlight: Promise<number> | null = null;
	private stopPromise: Promise<void> | null = null;
	private started = false;
	private stopping = false;

	constructor(
		private readonly ports: {
			observation: AgenticChatCancellationObservationPortV1;
			onMetric?: (
				metric: AgenticChatCancellationObserverMetricV1,
				turnRunId?: string
			) => void;
		},
		config: Partial<AgenticChatCancellationObserverConfig> = {}
	) {
		this.config = {
			...DEFAULT_AGENTIC_CHAT_CANCELLATION_OBSERVER_CONFIG,
			...config
		};
		validateConfig(this.config);
	}

	start(): void {
		if (this.stopping) throw new Error('Agentic Chat cancellation observer is stopping');
		if (this.started) return;
		this.started = true;
		this.timer = setInterval(() => void this.pollNow(), this.config.pollIntervalMs);
		this.timer.unref();
	}

	registerTurn(context: AgenticChatCancellationRegistrationV1): AbortSignal {
		if (this.stopping) throw new Error('Agentic Chat cancellation observer is stopping');
		validateRegistration(context);

		const existing = this.turns.get(context.turnRunId);
		if (existing) {
			if (existing.context.executionGeneration !== context.executionGeneration) {
				throw new Error(
					`Agentic Chat cancellation observer already tracks a different generation for ${context.turnRunId}`
				);
			}
			return existing.controller.signal;
		}
		if (this.turns.size >= this.config.consumerConcurrency) {
			throw new Error(
				`Agentic Chat cancellation observer capacity ${this.config.consumerConcurrency} exceeded`
			);
		}

		const controller = new AbortController();
		this.turns.set(context.turnRunId, { context: { ...context }, controller });
		return controller.signal;
	}

	unregisterTurn(turnRunId: string, executionGeneration: number): boolean {
		const registered = this.turns.get(turnRunId);
		if (!registered || registered.context.executionGeneration !== executionGeneration) {
			return false;
		}
		return this.turns.delete(turnRunId);
	}

	get activeTurnCount(): number {
		return this.turns.size;
	}

	pollNow(): Promise<number> {
		if (this.stopping) return Promise.resolve(0);
		if (this.inFlight) return this.inFlight;

		const inputs = [...this.turns.values()]
			.filter(({ controller }) => !controller.signal.aborted)
			.map(({ context }) => ({
				turn_run_id: context.turnRunId,
				execution_generation: context.executionGeneration
			}));
		if (inputs.length === 0) return Promise.resolve(0);
		if (inputs.length > this.config.rpcMaxPairs) {
			throw new Error('Agentic Chat cancellation observer registration bound was violated');
		}

		const poll = this.observeOnce(inputs).finally(() => {
			if (this.inFlight === poll) this.inFlight = null;
		});
		this.inFlight = poll;
		return poll;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.stopping = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.stopPromise = (async () => {
			if (this.inFlight) {
				await waitForPromiseOrTimeout(this.inFlight, this.config.shutdownWaitMs);
			}
			this.turns.clear();
		})();
		return this.stopPromise;
	}

	private async observeOnce(
		inputs: AgenticChatCancellationObservationInputV1[]
	): Promise<number> {
		let receipts: unknown;
		try {
			receipts = await this.ports.observation.observe(inputs);
		} catch {
			this.emitMetric('poll_failed');
			return 0;
		}

		if (!Array.isArray(receipts)) {
			this.emitMetric('invalid_receipt');
			return 0;
		}

		const seenTurns = new Set<string>();
		let aborted = 0;
		for (const candidate of receipts) {
			if (!isObservation(candidate) || seenTurns.has(candidate.turn_run_id)) {
				this.emitMetric(
					'invalid_receipt',
					isRecord(candidate) && typeof candidate.turn_run_id === 'string'
						? candidate.turn_run_id
						: undefined
				);
				continue;
			}
			const registered = this.turns.get(candidate.turn_run_id);
			if (
				!registered ||
				registered.context.executionGeneration !== candidate.execution_generation
			) {
				this.emitMetric('invalid_receipt', candidate.turn_run_id);
				continue;
			}
			seenTurns.add(candidate.turn_run_id);
			if (registered.controller.signal.aborted) continue;

			const error = new AgenticChatCancellationError(candidate);
			registered.controller.abort(error);
			try {
				registered.context.onCancellation?.(error);
			} catch {
				// Cancellation remains authoritative through the AbortSignal even if
				// optional observation telemetry throws.
			}
			this.emitMetric('cancel_observed', candidate.turn_run_id);
			aborted += 1;
		}
		return aborted;
	}

	private emitMetric(metric: AgenticChatCancellationObserverMetricV1, turnRunId?: string): void {
		try {
			this.ports.onMetric?.(metric, turnRunId);
		} catch {
			// Observability must never change cancellation delivery semantics.
		}
	}
}

function validateConfig(config: AgenticChatCancellationObserverConfig): void {
	for (const [name, value] of Object.entries(config)) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} must be a positive safe integer`);
		}
	}
	if (config.rpcMaxPairs > AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS) {
		throw new Error(`rpcMaxPairs cannot exceed ${AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS}`);
	}
	if (config.rpcMaxPairs < config.consumerConcurrency) {
		throw new Error('rpcMaxPairs must be at least consumerConcurrency');
	}
}

function validateRegistration(context: AgenticChatCancellationRegistrationV1): void {
	if (!context.turnRunId) throw new Error('turnRunId is required');
	if (!Number.isSafeInteger(context.executionGeneration) || context.executionGeneration < 1) {
		throw new Error('executionGeneration must be a positive safe integer');
	}
}

function isObservation(value: unknown): value is AgenticChatCancellationObservationV1 {
	if (!isRecord(value)) return false;
	return (
		typeof value.turn_run_id === 'string' &&
		value.turn_run_id.length > 0 &&
		Number.isSafeInteger(value.execution_generation) &&
		(value.execution_generation as number) >= 1 &&
		typeof value.signal_id === 'string' &&
		value.signal_id.length > 0 &&
		isCancelReason(value.cancel_reason) &&
		isCancelSource(value.cancel_source) &&
		typeof value.cancel_requested_at === 'string' &&
		value.cancel_requested_at.length > 0 &&
		typeof value.consumed_at === 'string' &&
		value.consumed_at.length > 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCancelReason(value: unknown): boolean {
	return (
		value === 'user_cancelled' ||
		value === 'superseded' ||
		value === 'timeout' ||
		value === 'operator_cancelled'
	);
}

function isCancelSource(value: unknown): boolean {
	return value === 'browser' || value === 'worker' || value === 'operator' || value === 'sweeper';
}

async function waitForPromiseOrTimeout(
	promise: Promise<unknown>,
	timeoutMs: number
): Promise<void> {
	let timer: NodeJS.Timeout | null = null;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, timeoutMs);
		timer.unref();
	});
	try {
		await Promise.race([promise.then(() => undefined).catch(() => undefined), timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
