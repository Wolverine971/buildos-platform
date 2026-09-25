// apps/worker/src/workers/agentic-chat/mutations/mutation-executor.ts
import { performance } from 'node:perf_hooks';
import {
	type AgenticChatRecoveryFailureClassV1,
	type ChatTurnEffectRpcResultV1,
	type JsonObject
} from '@buildos/shared-types';
import type {
	AgenticChatEffectControlPortV1,
	AgenticChatEffectIdentityV1
} from '../effects/effect-control';
import { createStableAgenticChatEffectIdentityV1 } from '../effects/effect-identity';
import type { AgenticChatWorkerExecutionInputV1 } from '../turn/execution-input';

export type AgenticChatMutationStepV1 = {
	logicalOperationId: string;
	providerToolCallId: string;
	toolName: string;
	operationName: string;
	arguments: JsonObject;
	downstreamIdempotencySupported: boolean;
};

export type AgenticChatMutatingToolPortV1 = {
	execute(input: {
		effectId: string;
		downstreamIdempotencyKey: string;
		toolName: string;
		operationName: string;
		arguments: JsonObject;
		providerToolCallId: string;
		downstreamIdempotencySupported: boolean;
		executionInput: AgenticChatWorkerExecutionInputV1;
		signal: AbortSignal;
	}): Promise<JsonObject>;
};

/**
 * One critical-path span inside the irreversible effect lifecycle. Identifiers
 * and durations only; arguments and downstream receipts are never included.
 */
export type AgenticChatMutationSpanV1 = {
	stage: 'effect_reserve' | 'effect_begin' | 'mutation_adapter' | 'effect_reconcile';
	state: 'finished' | 'failed';
	durationMs: number;
	turnRunId: string;
	executionGeneration: number;
	effectId: string;
	toolName: string;
};

/**
 * The turn's lease, as the irreversible boundary sees it: a synchronous check
 * that this worker still holds the turn. After an event-loop stall the database
 * may already have taken the turn over before any timer here has run, so the
 * check sits immediately before each adapter call.
 */
export type AgenticChatMutationLeasePortV1 = { isFresh(): boolean };

export type AgenticChatMutationResultV1 = {
	effectId: string;
	canonicalArgumentHash: string;
	downstreamIdempotencyKey: string;
	downstreamReceipt: JsonObject | null;
	replayed: boolean;
};

export class AgenticChatMutationAdapterError extends Error {
	/**
	 * A known failure that wrote nothing and may succeed if the identical call is
	 * made again (the database rolled a busy write back). Never set for an
	 * uncertain outcome.
	 */
	readonly retryable: boolean;

	constructor(
		readonly disposition: 'known_failed' | 'outcome_uncertain',
		readonly failureCode: string,
		message: string,
		options: { retryable?: boolean } = {}
	) {
		super(message);
		this.name = 'AgenticChatMutationAdapterError';
		this.retryable = disposition === 'known_failed' && options.retryable === true;
	}
}

export class AgenticChatEffectExecutionError extends Error {
	constructor(
		readonly failureClass: Extract<
			AgenticChatRecoveryFailureClassV1,
			'permanent' | 'cancelled' | 'uncertain_external_commit'
		>,
		readonly effectId: string,
		message: string,
		/** The adapter's structured failure code, when an adapter failure caused this. */
		readonly failureCode: string | null = null,
		/** Nothing was written and the identical call may succeed later this turn. */
		readonly retryable: boolean = false
	) {
		super(message);
		this.name = 'AgenticChatEffectExecutionError';
	}
}

/**
 * Irreversible mutation boundary. The mutator is called only for the one
 * begin receipt that explicitly grants adapter authority.
 */
export class AgenticChatMutationExecutor {
	private readonly maximumAdapterAttempts: number;
	private readonly rolledBackRetryDelayMs: (retry: number) => number;

	constructor(
		private readonly ports: {
			control: AgenticChatEffectControlPortV1;
			mutatingTool: AgenticChatMutatingToolPortV1;
			/** Observability only; a throwing sink cannot change the effect outcome. */
			onSpan?: (span: AgenticChatMutationSpanV1) => void;
			nowMs?: () => number;
		},
		options: {
			maximumAdapterAttempts?: number;
			/** Wait before retry N (1-based) of a rolled-back write. */
			rolledBackRetryDelayMs?: (retry: number) => number;
		} = {}
	) {
		this.rolledBackRetryDelayMs =
			options.rolledBackRetryDelayMs ?? defaultRolledBackRetryDelayMs;
		this.maximumAdapterAttempts = options.maximumAdapterAttempts ?? 2;
		if (
			!Number.isSafeInteger(this.maximumAdapterAttempts) ||
			this.maximumAdapterAttempts < 1 ||
			this.maximumAdapterAttempts > 8
		) {
			throw new Error('maximumAdapterAttempts must be between 1 and 8');
		}
	}

	async execute(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		step: AgenticChatMutationStepV1;
		signal: AbortSignal;
		lease?: AgenticChatMutationLeasePortV1;
	}): Promise<AgenticChatMutationResultV1> {
		if (input.signal.aborted) throwAbort(input.signal);
		const { claim } = input.executionInput;
		const stableIdentity = createStableAgenticChatEffectIdentityV1({
			turnRunId: claim.turnRunId,
			logicalOperationId: input.step.logicalOperationId,
			toolName: input.step.toolName,
			operationName: input.step.operationName,
			arguments: input.step.arguments
		});
		const identity: AgenticChatEffectIdentityV1 = {
			effectId: stableIdentity.effectId,
			turnRunId: claim.turnRunId,
			queueJobId: claim.queueJobId,
			processingToken: input.processingToken,
			sessionId: claim.sessionId,
			userId: claim.userId,
			executionGeneration: claim.executionGeneration,
			canonicalArgumentHash: stableIdentity.canonicalArgumentHash,
			downstreamIdempotencySupported: input.step.downstreamIdempotencySupported
		};

		const span = <T>(stage: AgenticChatMutationSpanV1['stage'], run: () => Promise<T>) =>
			this.span(stage, identity, input.step.toolName, run);

		const reservation = await span('effect_reserve', () =>
			this.ports.control.reserve({
				...identity,
				toolName: input.step.toolName,
				operationName: input.step.operationName,
				providerToolCallId: input.step.providerToolCallId
			})
		);
		const replay = replaySucceeded(reservation, stableIdentity);
		if (replay) return replay;
		if (reservation.state !== 'reserved') throw stateError(reservation);

		if (input.signal.aborted) {
			await span('effect_reconcile', () => this.reconcileCancelled(identity));
			throwAbort(input.signal);
		}

		const begin = await span('effect_begin', () =>
			this.ports.control.begin({
				...identity,
				providerToolCallId: input.step.providerToolCallId
			})
		);
		const beginReplay = replaySucceeded(begin, stableIdentity);
		if (beginReplay) return beginReplay;
		if (begin.outcome !== 'started' || begin.invokeAdapter !== true) {
			throw stateError(begin);
		}

		let downstreamReceipt: JsonObject;
		try {
			downstreamReceipt = await span('mutation_adapter', () =>
				this.invokeAdapter({
					...input,
					effectId: stableIdentity.effectId,
					downstreamIdempotencyKey: stableIdentity.downstreamIdempotencyKey
				})
			);
		} catch (error) {
			const outcome = mutationFailure(error);
			const targetState = outcome.disposition === 'known_failed' ? 'failed' : 'uncertain';
			const reconciliation = await span('effect_reconcile', () =>
				this.ports.control.reconcile({
					...identity,
					targetState,
					downstreamReceipt: null,
					failureCode: outcome.failureCode
				})
			);
			if (reconciliation.state !== targetState) throw stateError(reconciliation);
			throw new AgenticChatEffectExecutionError(
				targetState === 'uncertain' ? 'uncertain_external_commit' : 'permanent',
				stableIdentity.effectId,
				outcome.message,
				outcome.failureCode,
				outcome.retryable
			);
		}

		const reconciliation = await span('effect_reconcile', () =>
			this.ports.control.reconcile({
				...identity,
				targetState: 'succeeded',
				downstreamReceipt,
				failureCode: null
			})
		);
		if (reconciliation.state !== 'succeeded') throw stateError(reconciliation);
		return {
			effectId: stableIdentity.effectId,
			canonicalArgumentHash: stableIdentity.canonicalArgumentHash,
			downstreamIdempotencyKey: stableIdentity.downstreamIdempotencyKey,
			downstreamReceipt: reconciliation.downstreamReceipt,
			replayed: reconciliation.outcome === 'existing'
		};
	}

	private async invokeAdapter(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		step: AgenticChatMutationStepV1;
		signal: AbortSignal;
		lease?: AgenticChatMutationLeasePortV1;
		effectId: string;
		downstreamIdempotencyKey: string;
	}): Promise<JsonObject> {
		let lastError: unknown;
		let firstAmbiguousError: unknown;
		let sawAmbiguousAttempt = false;
		const recoverySignal = new AbortController().signal;
		const attempts = input.step.downstreamIdempotencySupported
			? this.maximumAdapterAttempts
			: 1;
		// A write the database rolled back (deadlock, lock or statement timeout)
		// left nothing behind, so it is retried after a short jittered wait: the
		// parallel calls that collided no longer line up. These retries are safe
		// without downstream idempotency and do not use `attempts`, which only an
		// ambiguous attempt consumes.
		let rolledBackRetries = 0;
		for (let attempt = 1; attempt <= attempts; ) {
			// No write starts once this worker may have lost the turn. Before any
			// ambiguous attempt that is a known non-write; after one it stays
			// uncertain (the error below is kept by the ambiguous-outcome rule).
			if (input.lease && !input.lease.isFresh()) {
				const stale = new AgenticChatMutationAdapterError(
					sawAmbiguousAttempt ? 'outcome_uncertain' : 'known_failed',
					'worker_lease_stale',
					'The worker lease is no longer fresh; the write was not started'
				);
				if (!sawAmbiguousAttempt) throw stale;
				throw preserveAmbiguousOutcome(firstAmbiguousError, stale);
			}
			try {
				return await this.ports.mutatingTool.execute({
					effectId: input.effectId,
					downstreamIdempotencyKey: input.downstreamIdempotencyKey,
					toolName: input.step.toolName,
					operationName: input.step.operationName,
					arguments: input.step.arguments,
					providerToolCallId: input.step.providerToolCallId,
					downstreamIdempotencySupported: input.step.downstreamIdempotencySupported,
					executionInput: input.executionInput,
					// Once an attempt may have committed, cancellation can no longer
					// prove that no write happened. Recovery must query/replay with the
					// stable key and independently own its bounded completion.
					signal: sawAmbiguousAttempt ? recoverySignal : input.signal
				});
			} catch (error) {
				lastError = error;
				if (
					error instanceof AgenticChatMutationAdapterError &&
					error.retryable &&
					rolledBackRetries < MAXIMUM_ROLLED_BACK_RETRIES
				) {
					rolledBackRetries += 1;
					await abortableDelay(
						this.rolledBackRetryDelayMs(rolledBackRetries),
						sawAmbiguousAttempt ? recoverySignal : input.signal
					);
					// Cancelled while waiting: this attempt wrote nothing, so stop here.
					if (!sawAmbiguousAttempt && input.signal.aborted) throw error;
					continue;
				}
				const knownFailure =
					error instanceof AgenticChatMutationAdapterError &&
					error.disposition === 'known_failed';
				if (knownFailure && !sawAmbiguousAttempt) {
					throw error;
				}
				if (knownFailure) {
					throw preserveAmbiguousOutcome(firstAmbiguousError, error);
				}
				if (!sawAmbiguousAttempt) firstAmbiguousError = error;
				sawAmbiguousAttempt = true;
				if (attempt === attempts) throw error;
				attempt += 1;
			}
		}
		throw lastError ?? new Error('Mutating adapter did not produce a receipt');
	}

	private async span<T>(
		stage: AgenticChatMutationSpanV1['stage'],
		identity: AgenticChatEffectIdentityV1,
		toolName: string,
		run: () => Promise<T>
	): Promise<T> {
		const onSpan = this.ports.onSpan;
		if (!onSpan) return run();
		const nowMs = this.ports.nowMs ?? (() => performance.now());
		const startedAtMs = nowMs();
		let state: AgenticChatMutationSpanV1['state'] = 'failed';
		try {
			const value = await run();
			state = 'finished';
			return value;
		} finally {
			try {
				onSpan({
					stage,
					state,
					durationMs: Math.max(0, nowMs() - startedAtMs),
					turnRunId: identity.turnRunId,
					executionGeneration: identity.executionGeneration,
					effectId: identity.effectId,
					toolName
				});
			} catch {
				// Span telemetry must never become part of the effect boundary.
			}
		}
	}

	private async reconcileCancelled(identity: AgenticChatEffectIdentityV1): Promise<void> {
		const reconciliation = await this.ports.control.reconcile({
			...identity,
			targetState: 'cancelled',
			downstreamReceipt: null,
			failureCode: null
		});
		if (reconciliation.state !== 'cancelled') throw stateError(reconciliation);
	}
}

function preserveAmbiguousOutcome(firstError: unknown, recoveryError: unknown): Error {
	if (
		firstError instanceof AgenticChatMutationAdapterError &&
		firstError.disposition === 'outcome_uncertain'
	) {
		return firstError;
	}
	const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
	const recoveryMessage =
		recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
	return new AgenticChatMutationAdapterError(
		'outcome_uncertain',
		'uncertain_external_commit',
		`Initial mutation outcome was ambiguous (${firstMessage}); recovery did not prove it absent (${recoveryMessage})`
	);
}

function replaySucceeded(
	receipt: ChatTurnEffectRpcResultV1,
	stableIdentity: ReturnType<typeof createStableAgenticChatEffectIdentityV1>
): AgenticChatMutationResultV1 | null {
	if (receipt.state !== 'succeeded') return null;
	return {
		effectId: receipt.effectId,
		canonicalArgumentHash: stableIdentity.canonicalArgumentHash,
		downstreamIdempotencyKey: stableIdentity.downstreamIdempotencyKey,
		downstreamReceipt: receipt.downstreamReceipt,
		replayed: true
	};
}

function mutationFailure(error: unknown): {
	disposition: 'known_failed' | 'outcome_uncertain';
	failureCode: string;
	message: string;
	retryable: boolean;
} {
	if (error instanceof AgenticChatMutationAdapterError) {
		return {
			disposition: error.disposition,
			failureCode: canonicalFailureCode(error.failureCode),
			message: error.message,
			retryable: error.retryable
		};
	}
	return {
		disposition: 'outcome_uncertain',
		failureCode: 'uncertain_external_commit',
		message: error instanceof Error ? error.message : String(error),
		retryable: false
	};
}

/** Two retries: a deadlock victim already waited deadlock_timeout (1 s) per attempt. */
const MAXIMUM_ROLLED_BACK_RETRIES = 2;

function defaultRolledBackRetryDelayMs(retry: number): number {
	return 150 * retry + Math.floor(Math.random() * 250);
}

/** Waits `ms`, resolving early (never rejecting) when `signal` aborts. */
function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
	if (ms <= 0 || signal.aborted) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(done, ms);
		function done() {
			clearTimeout(timer);
			signal.removeEventListener('abort', done);
			resolve();
		}
		signal.addEventListener('abort', done, { once: true });
	});
}

function stateError(receipt: ChatTurnEffectRpcResultV1): AgenticChatEffectExecutionError {
	const failureClass =
		receipt.state === 'uncertain' || receipt.state === 'started'
			? 'uncertain_external_commit'
			: receipt.state === 'cancelled'
				? 'cancelled'
				: 'permanent';
	return new AgenticChatEffectExecutionError(
		failureClass,
		receipt.effectId,
		`Effect ${receipt.effectId} requires reconciliation from state ${receipt.state}`
	);
}

function canonicalFailureCode(value: string): string {
	const normalized = value.trim().slice(0, 128);
	return normalized || 'uncertain_external_commit';
}

function throwAbort(signal: AbortSignal): never {
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}
