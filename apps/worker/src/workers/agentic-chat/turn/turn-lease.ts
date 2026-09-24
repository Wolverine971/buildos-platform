// apps/worker/src/workers/agentic-chat/turn/turn-lease.ts
//
// The per-turn worker lease (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md).
// While a claimed turn runs, the worker renews its lease every 15 s from the main
// event loop, so a stuck loop stops renewing. Once a renewal has been
// acknowledged, the turn aborts on `lost`, or 60 s after the SEND time of the
// last acknowledged renewal: the database stamps a renewal after it was sent, so
// measuring from send time keeps the worker's deadline strictly ahead of the
// database's 90 s takeover whatever the round trip. A generation that never
// renewed is governed by the database's 420 s unleased rule instead. The shared
// queue is not involved; other queues are unaffected.
import {
	AGENTIC_CHAT_TURN_LEASE_POLICY_V1,
	type AgenticChatTurnLeaseLostReasonV1
} from '@buildos/shared-types';
import {
	type AgenticChatGenerationWriteFenceV1,
	agenticChatGenerationWriteFenceArgsV1
} from './write-fence';

export type AgenticChatTurnLeaseRenewalV1 =
	| { outcome: 'renewed' }
	| { outcome: 'lost'; reason: AgenticChatTurnLeaseLostReasonV1 }
	/** The database predates leases (worker deployed first): keep the pre-lease behavior. */
	| { outcome: 'unsupported' };

export type AgenticChatTurnLeasePortV1 = {
	renew(
		fence: AgenticChatGenerationWriteFenceV1,
		signal: AbortSignal
	): Promise<AgenticChatTurnLeaseRenewalV1>;
};

type LeaseEventBase = { turnRunId: string; executionGeneration: number };

export type AgenticChatTurnLeaseEventV1 =
	| (LeaseEventBase & {
			type: 'renew_failed';
			/** Failures since the last acknowledged renewal; one is weather, more is a signal. */
			consecutiveFailures: number;
			error: unknown;
	  })
	| (LeaseEventBase & { type: 'lease_lost'; reason: AgenticChatTurnLeaseLostReasonV1 })
	| (LeaseEventBase & { type: 'self_fenced'; unacknowledgedForMs: number })
	| (LeaseEventBase & { type: 'unsupported' })
	/** Renewal stopped without aborting: the hard cap fired and the terminal budget ran out. */
	| (LeaseEventBase & { type: 'renewal_stopped'; reason: 'hard_cap' | 'max_hold' });

export type AgenticChatTurnLeaseConfigV1 = {
	renewIntervalMs: number;
	selfFenceAfterMs: number;
	/** One renewal is abandoned after this long, so a hung socket never blocks the next tick. */
	rpcTimeoutMs: number;
	/** Renewal continues this long after the hard cap fires, so the turn can finalize itself. */
	terminalBudgetMs: number;
	/** Absolute renewal lifetime (hard cap + terminal budget); null leaves it to the deadline signal. */
	maxHoldMs: number | null;
};

export type AgenticChatTurnLeaseHoldOptionsV1 = {
	/** The job's hard-cap signal: once it fires, renewal stops after the terminal budget. */
	deadlineSignal?: AbortSignal;
};

export type AgenticChatTurnLeaseHandleV1 = {
	/** Aborted with an AgenticChatTurnLeaseLostError when this worker must stop. */
	readonly signal: AbortSignal;
	/**
	 * Synchronous: may this worker start an external write right now? False once
	 * the lease is lost or more than the self-fence window has passed since the
	 * last acknowledged renewal was sent (an event-loop stall the fence timer has
	 * not caught yet). A generation that never renewed answers true: the
	 * database's unleased rule and the hard cap govern it.
	 */
	isFresh(): boolean;
	/** Stops renewing. Idempotent; never aborts the signal. */
	release(): void;
};

/** This worker no longer holds the turn; the database may already have taken it over. */
export class AgenticChatTurnLeaseLostError extends Error {
	readonly code = 'worker_lease_lost';
	constructor(
		readonly turnRunId: string,
		readonly executionGeneration: number,
		readonly detail:
			| { kind: 'lost'; reason: AgenticChatTurnLeaseLostReasonV1 }
			| { kind: 'unacknowledged'; unacknowledgedForMs: number }
	) {
		super(
			detail.kind === 'lost'
				? `Agentic Chat turn lease lost (${detail.reason}) for ${turnRunId}`
				: `Agentic Chat turn lease unacknowledged for ${detail.unacknowledgedForMs}ms for ${turnRunId}`
		);
		this.name = 'AgenticChatTurnLeaseLostError';
	}
}

export class AgenticChatTurnLeaseRenewTimeoutError extends Error {
	constructor(readonly timeoutMs: number) {
		super(`Agentic Chat lease renewal did not settle within ${timeoutMs}ms`);
		this.name = 'AgenticChatTurnLeaseRenewTimeoutError';
	}
}

/**
 * The one set of timing rules, used by the keeper, the consumer config, and the
 * drift test. Safety comes from the worker stopping before the database may
 * take a turn over:
 *   - renew >= 1 s, and one renewal RPC gives up before the next is due;
 *   - self-fence >= 2 renewals (one missed renewal is weather);
 *   - self-fence + 2 renewals <= the database expiry (margin for late timers
 *     and abort unwinding);
 *   - the Stop threshold >= 3 renewals (a missed renewal plus a slow one never
 *     lets Stop bypass a live worker);
 *   - a recovery sweep at least once per expiry period;
 *   - hard cap + terminal budget < the unleased threshold, which still protects
 *     rows claimed by a pre-lease worker.
 */
export function validateAgenticChatTurnLeaseTimingV1(config: {
	renewIntervalMs: number;
	selfFenceAfterMs: number;
	rpcTimeoutMs?: number;
	recoverySweepIntervalMs?: number;
	workerTimeoutMs?: number;
	terminalBudgetMs?: number;
}): void {
	const policy = AGENTIC_CHAT_TURN_LEASE_POLICY_V1;
	for (const [name, value] of Object.entries(config)) {
		if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
			throw new Error(`Agentic Chat lease ${name} must be a positive safe integer`);
		}
	}
	if (config.renewIntervalMs < 1_000) {
		throw new Error('Agentic Chat lease renewal cannot be below 1000ms');
	}
	if (config.rpcTimeoutMs !== undefined && config.rpcTimeoutMs >= config.renewIntervalMs) {
		throw new Error('Agentic Chat lease RPC timeout must end before the next renewal');
	}
	if (config.selfFenceAfterMs < 2 * config.renewIntervalMs) {
		throw new Error('Agentic Chat lease self-fence must tolerate one missed renewal');
	}
	if (config.selfFenceAfterMs + 2 * config.renewIntervalMs > policy.expiredAfterMs) {
		throw new Error(
			`Agentic Chat lease self-fence must end two renewals before the ${policy.expiredAfterMs}ms database expiry`
		);
	}
	if (policy.staleAfterMs < 3 * config.renewIntervalMs) {
		throw new Error('Agentic Chat lease renewal is too slow for the Stop threshold');
	}
	if (
		config.recoverySweepIntervalMs !== undefined &&
		(config.recoverySweepIntervalMs < 1_000 ||
			config.recoverySweepIntervalMs > policy.expiredAfterMs)
	) {
		throw new Error(
			`Agentic Chat recovery sweep must run between 1000ms and ${policy.expiredAfterMs}ms`
		);
	}
	if (
		config.workerTimeoutMs !== undefined &&
		config.workerTimeoutMs + (config.terminalBudgetMs ?? policy.terminalBudgetMs) >=
			policy.unleasedExpiredAfterMs
	) {
		throw new Error(
			`Agentic Chat worker timeout plus terminal budget must stay below the ${policy.unleasedExpiredAfterMs}ms unleased recovery threshold`
		);
	}
}

export class AgenticChatTurnLeaseKeeper {
	private readonly config: AgenticChatTurnLeaseConfigV1;
	private readonly now: () => number;

	constructor(
		private readonly ports: {
			lease: AgenticChatTurnLeasePortV1;
			onEvent?: (event: AgenticChatTurnLeaseEventV1) => void;
			/** Monotonic milliseconds; defaults to performance.now(). */
			now?: () => number;
		},
		config: Partial<AgenticChatTurnLeaseConfigV1> = {}
	) {
		const policy = AGENTIC_CHAT_TURN_LEASE_POLICY_V1;
		this.config = {
			renewIntervalMs: config.renewIntervalMs ?? policy.renewIntervalMs,
			selfFenceAfterMs: config.selfFenceAfterMs ?? policy.selfFenceAfterMs,
			rpcTimeoutMs: config.rpcTimeoutMs ?? policy.rpcTimeoutMs,
			terminalBudgetMs: config.terminalBudgetMs ?? policy.terminalBudgetMs,
			maxHoldMs: config.maxHoldMs ?? null
		};
		validateAgenticChatTurnLeaseTimingV1({
			renewIntervalMs: this.config.renewIntervalMs,
			selfFenceAfterMs: this.config.selfFenceAfterMs,
			rpcTimeoutMs: this.config.rpcTimeoutMs,
			terminalBudgetMs: this.config.terminalBudgetMs
		});
		if (
			this.config.maxHoldMs !== null &&
			(!Number.isSafeInteger(this.config.maxHoldMs) || this.config.maxHoldMs < 1)
		) {
			throw new Error('Agentic Chat lease maxHoldMs must be a positive safe integer');
		}
		// Read the global each call so a faked clock in tests is honored.
		this.now = ports.now ?? (() => globalThis.performance.now());
	}

	/** Start renewing a freshly claimed turn. */
	hold(
		fence: AgenticChatGenerationWriteFenceV1,
		options: AgenticChatTurnLeaseHoldOptionsV1 = {}
	): AgenticChatTurnLeaseHandleV1 {
		if (
			!fence.turnRunId ||
			!fence.queueJobId ||
			!fence.processingToken ||
			!Number.isSafeInteger(fence.executionGeneration) ||
			fence.executionGeneration < 1
		) {
			throw new Error('Agentic Chat lease requires a claimed turn fence');
		}
		const controller = new AbortController();
		const { renewIntervalMs, selfFenceAfterMs, rpcTimeoutMs, terminalBudgetMs, maxHoldMs } =
			this.config;
		const identity = {
			turnRunId: fence.turnRunId,
			executionGeneration: fence.executionGeneration
		};
		/** Send time of the newest acknowledged renewal; null until the first. */
		let lastAckSentAtMs: number | null = null;
		let unsupported = false;
		let renewing = true;
		let released = false;
		let renewalInFlight = false;
		let consecutiveFailures = 0;
		let fenceTimer: NodeJS.Timeout | null = null;
		let renewTimer: NodeJS.Timeout | null = null;
		let capTimer: NodeJS.Timeout | null = null;
		let deadlineListener: (() => void) | null = null;

		const clearTimer = (timer: NodeJS.Timeout | null) => {
			if (timer) clearTimeout(timer);
		};
		const stopRenewing = () => {
			renewing = false;
			if (renewTimer) clearInterval(renewTimer);
			renewTimer = null;
		};
		const stopAll = () => {
			stopRenewing();
			clearTimer(fenceTimer);
			clearTimer(capTimer);
			fenceTimer = null;
			capTimer = null;
			if (deadlineListener)
				options.deadlineSignal?.removeEventListener('abort', deadlineListener);
			deadlineListener = null;
		};
		const abort = (error: AgenticChatTurnLeaseLostError) => {
			if (released || controller.signal.aborted) return;
			stopAll();
			controller.abort(error);
		};
		const armFence = () => {
			clearTimer(fenceTimer);
			if (lastAckSentAtMs === null) return;
			const remainingMs = lastAckSentAtMs + selfFenceAfterMs - this.now();
			fenceTimer = setTimeout(selfFence, Math.max(0, remainingMs));
			fenceTimer.unref?.();
		};
		const selfFence = () => {
			if (lastAckSentAtMs === null) return;
			const unacknowledgedForMs = this.now() - lastAckSentAtMs;
			// A late timer re-checks against the newest acknowledgement.
			if (unacknowledgedForMs < selfFenceAfterMs) {
				armFence();
				return;
			}
			this.emit({ type: 'self_fenced', ...identity, unacknowledgedForMs });
			abort(
				new AgenticChatTurnLeaseLostError(fence.turnRunId, fence.executionGeneration, {
					kind: 'unacknowledged',
					unacknowledgedForMs
				})
			);
		};
		const recordFailure = (error: unknown) => {
			consecutiveFailures += 1;
			this.emit({ type: 'renew_failed', ...identity, consecutiveFailures, error });
		};
		const renew = () => {
			if (!renewing || released || controller.signal.aborted || renewalInFlight) return;
			renewalInFlight = true;
			const sentAtMs = this.now();
			const call = new AbortController();
			let settled = false;
			const timeout = setTimeout(() => {
				if (settled) return;
				settled = true;
				renewalInFlight = false;
				call.abort(new AgenticChatTurnLeaseRenewTimeoutError(rpcTimeoutMs));
				recordFailure(new AgenticChatTurnLeaseRenewTimeoutError(rpcTimeoutMs));
			}, rpcTimeoutMs);
			timeout.unref?.();
			void this.ports.lease.renew(fence, call.signal).then(
				(renewal) => {
					clearTimeout(timeout);
					const timedOut = settled;
					settled = true;
					if (!timedOut) renewalInFlight = false;
					if (released || controller.signal.aborted) return;
					// A late answer is still the database's truth: an acknowledgement
					// only ever moves the fence forward, and a loss is a loss.
					if (renewal.outcome === 'renewed') {
						consecutiveFailures = 0;
						if (lastAckSentAtMs === null || sentAtMs > lastAckSentAtMs) {
							lastAckSentAtMs = sentAtMs;
							armFence();
						}
					} else if (renewal.outcome === 'lost') {
						this.emit({ type: 'lease_lost', ...identity, reason: renewal.reason });
						abort(
							new AgenticChatTurnLeaseLostError(
								fence.turnRunId,
								fence.executionGeneration,
								{
									kind: 'lost',
									reason: renewal.reason
								}
							)
						);
					} else if (lastAckSentAtMs === null) {
						// No lease column to renew and never renewed: behave exactly as before leases.
						unsupported = true;
						stopRenewing();
						this.emit({ type: 'unsupported', ...identity });
					} else if (!timedOut) {
						// This hold already renewed, so the function exists: a transient
						// schema-cache miss is weather, and the fence timer decides.
						recordFailure(
							new Error('Lease renewal function reported missing after renewing')
						);
					}
				},
				(error: unknown) => {
					clearTimeout(timeout);
					if (settled) return;
					settled = true;
					renewalInFlight = false;
					if (released || controller.signal.aborted) return;
					recordFailure(error);
				}
			);
		};
		const capRenewal = (reason: 'hard_cap' | 'max_hold', afterMs: number) => {
			clearTimer(capTimer);
			capTimer = setTimeout(() => {
				if (released || controller.signal.aborted || !renewing) return;
				// Stop renewing, never abort: a stuck executor stays fenced by its own
				// timer and becomes recoverable once the database lease expires.
				stopRenewing();
				this.emit({ type: 'renewal_stopped', ...identity, reason });
			}, afterMs);
			capTimer.unref?.();
		};

		if (maxHoldMs !== null) capRenewal('max_hold', maxHoldMs);
		const deadline = options.deadlineSignal;
		if (deadline) {
			if (deadline.aborted) {
				capRenewal('hard_cap', terminalBudgetMs);
			} else {
				deadlineListener = () => capRenewal('hard_cap', terminalBudgetMs);
				deadline.addEventListener('abort', deadlineListener, { once: true });
			}
		}
		renewTimer = setInterval(renew, renewIntervalMs);
		renewTimer.unref?.();
		renew();

		return {
			signal: controller.signal,
			isFresh: () => {
				if (released || controller.signal.aborted) return false;
				if (unsupported || lastAckSentAtMs === null) return true;
				return this.now() - lastAckSentAtMs < selfFenceAfterMs;
			},
			release: () => {
				if (released) return;
				released = true;
				stopAll();
			}
		};
	}

	private emit(event: AgenticChatTurnLeaseEventV1): void {
		try {
			this.ports.onEvent?.(event);
		} catch {
			// Telemetry never changes whether a turn keeps its lease.
		}
	}
}

type LeaseRpcError = { code?: string; message: string };

export type AgenticChatTurnLeaseRpcClient = {
	rpc(
		name: 'renew_agentic_chat_turn_lease',
		args: ReturnType<typeof agenticChatGenerationWriteFenceArgsV1>
	): {
		abortSignal(
			signal: AbortSignal
		): PromiseLike<{ data: unknown; error: LeaseRpcError | null }>;
	};
};

export class AgenticChatTurnLeaseRpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(`renew_agentic_chat_turn_lease failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatTurnLeaseRpcError';
	}
}

const LOST_REASONS: ReadonlySet<string> = new Set<AgenticChatTurnLeaseLostReasonV1>([
	'relationship_mismatch',
	'turn_terminal',
	'generation_changed',
	'not_running',
	'ownership_lost',
	'lease_expired'
]);

/** PostgREST (schema cache) and Postgres codes for "this function does not exist". */
const MISSING_FUNCTION_CODES: ReadonlySet<string> = new Set(['PGRST202', '42883']);

export class SupabaseAgenticChatTurnLeaseAdapter implements AgenticChatTurnLeasePortV1 {
	constructor(private readonly client: AgenticChatTurnLeaseRpcClient) {}

	async renew(
		fence: AgenticChatGenerationWriteFenceV1,
		signal: AbortSignal
	): Promise<AgenticChatTurnLeaseRenewalV1> {
		const { data, error } = await this.client
			.rpc('renew_agentic_chat_turn_lease', agenticChatGenerationWriteFenceArgsV1(fence))
			.abortSignal(signal);
		if (error) {
			if (error.code && MISSING_FUNCTION_CODES.has(error.code)) {
				return { outcome: 'unsupported' };
			}
			throw new AgenticChatTurnLeaseRpcError(error.code ?? '', error.message);
		}
		const receipt =
			data !== null && typeof data === 'object' && !Array.isArray(data)
				? (data as Record<string, unknown>)
				: null;
		if (
			!receipt ||
			receipt.turn_run_id !== fence.turnRunId ||
			receipt.execution_generation !== fence.executionGeneration
		) {
			throw new AgenticChatTurnLeaseRpcError('protocol', 'receipt identity is invalid');
		}
		if (receipt.outcome === 'renewed') return { outcome: 'renewed' };
		if (
			receipt.outcome === 'lost' &&
			typeof receipt.reason === 'string' &&
			LOST_REASONS.has(receipt.reason)
		) {
			return { outcome: 'lost', reason: receipt.reason as AgenticChatTurnLeaseLostReasonV1 };
		}
		throw new AgenticChatTurnLeaseRpcError('protocol', 'receipt outcome is invalid');
	}
}
