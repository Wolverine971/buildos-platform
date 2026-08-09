// apps/worker/src/workers/agentic-chat/fixtureMutationExecutor.ts
import {
	type AgenticChatRecoveryFailureClassV1,
	type ChatTurnEffectRpcResultV1,
	type JsonObject
} from '@buildos/shared-types';
import type { AgenticChatEffectControlPortV1, AgenticChatEffectIdentityV1 } from './effectControl';
import { createStableAgenticChatEffectIdentityV1 } from './effectIdentity';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';

export type AgenticChatFixtureMutationStepV1 = {
	logicalOperationId: string;
	providerToolCallId: string;
	toolName: string;
	operationName: string;
	arguments: JsonObject;
	downstreamIdempotencySupported: boolean;
};

export type AgenticChatFixtureMutatingToolPortV1 = {
	execute(input: {
		effectId: string;
		downstreamIdempotencyKey: string;
		toolName: string;
		operationName: string;
		arguments: JsonObject;
		providerToolCallId: string;
		executionInput: AgenticChatWorkerExecutionInputV1;
		signal: AbortSignal;
	}): Promise<JsonObject>;
};

export type AgenticChatFixtureMutationResultV1 = {
	effectId: string;
	canonicalArgumentHash: string;
	downstreamIdempotencyKey: string;
	downstreamReceipt: JsonObject | null;
	replayed: boolean;
};

export class AgenticChatFixtureMutationAdapterError extends Error {
	constructor(
		readonly disposition: 'known_failed' | 'outcome_uncertain',
		readonly failureCode: string,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatFixtureMutationAdapterError';
	}
}

export class AgenticChatEffectExecutionError extends Error {
	constructor(
		readonly failureClass: Extract<
			AgenticChatRecoveryFailureClassV1,
			'permanent' | 'cancelled' | 'uncertain_external_commit'
		>,
		readonly effectId: string,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatEffectExecutionError';
	}
}

/**
 * Fixture-only irreversible boundary. The mutator is called only for the one
 * begin receipt that explicitly grants adapter authority.
 */
export class AgenticChatFixtureMutationExecutor {
	private readonly maximumAdapterAttempts: number;

	constructor(
		private readonly ports: {
			control: AgenticChatEffectControlPortV1;
			mutatingTool: AgenticChatFixtureMutatingToolPortV1;
		},
		options: { maximumAdapterAttempts?: number } = {}
	) {
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
		step: AgenticChatFixtureMutationStepV1;
		signal: AbortSignal;
	}): Promise<AgenticChatFixtureMutationResultV1> {
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

		const reservation = await this.ports.control.reserve({
			...identity,
			toolName: input.step.toolName,
			operationName: input.step.operationName,
			providerToolCallId: input.step.providerToolCallId
		});
		const replay = replaySucceeded(reservation, stableIdentity);
		if (replay) return replay;
		if (reservation.state !== 'reserved') throw stateError(reservation);

		if (input.signal.aborted) {
			await this.reconcileCancelled(identity);
			throwAbort(input.signal);
		}

		const begin = await this.ports.control.begin({
			...identity,
			providerToolCallId: input.step.providerToolCallId
		});
		const beginReplay = replaySucceeded(begin, stableIdentity);
		if (beginReplay) return beginReplay;
		if (begin.outcome !== 'started' || begin.invokeAdapter !== true) {
			throw stateError(begin);
		}

		let downstreamReceipt: JsonObject;
		try {
			downstreamReceipt = await this.invokeAdapter({
				...input,
				effectId: stableIdentity.effectId,
				downstreamIdempotencyKey: stableIdentity.downstreamIdempotencyKey
			});
		} catch (error) {
			const outcome = mutationFailure(error);
			const targetState = outcome.disposition === 'known_failed' ? 'failed' : 'uncertain';
			const reconciliation = await this.ports.control.reconcile({
				...identity,
				targetState,
				downstreamReceipt: null,
				failureCode: outcome.failureCode
			});
			if (reconciliation.state !== targetState) throw stateError(reconciliation);
			throw new AgenticChatEffectExecutionError(
				targetState === 'uncertain' ? 'uncertain_external_commit' : 'permanent',
				stableIdentity.effectId,
				outcome.message
			);
		}

		const reconciliation = await this.ports.control.reconcile({
			...identity,
			targetState: 'succeeded',
			downstreamReceipt,
			failureCode: null
		});
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
		step: AgenticChatFixtureMutationStepV1;
		signal: AbortSignal;
		effectId: string;
		downstreamIdempotencyKey: string;
	}): Promise<JsonObject> {
		let lastError: unknown;
		const attempts = input.step.downstreamIdempotencySupported
			? this.maximumAdapterAttempts
			: 1;
		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			try {
				return await this.ports.mutatingTool.execute({
					effectId: input.effectId,
					downstreamIdempotencyKey: input.downstreamIdempotencyKey,
					toolName: input.step.toolName,
					operationName: input.step.operationName,
					arguments: input.step.arguments,
					providerToolCallId: input.step.providerToolCallId,
					executionInput: input.executionInput,
					signal: input.signal
				});
			} catch (error) {
				lastError = error;
				if (
					error instanceof AgenticChatFixtureMutationAdapterError &&
					error.disposition === 'known_failed'
				) {
					throw error;
				}
				if (attempt === attempts) throw error;
			}
		}
		throw lastError ?? new Error('Mutating adapter did not produce a receipt');
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

function replaySucceeded(
	receipt: ChatTurnEffectRpcResultV1,
	stableIdentity: ReturnType<typeof createStableAgenticChatEffectIdentityV1>
): AgenticChatFixtureMutationResultV1 | null {
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
} {
	if (error instanceof AgenticChatFixtureMutationAdapterError) {
		return {
			disposition: error.disposition,
			failureCode: canonicalFailureCode(error.failureCode),
			message: error.message
		};
	}
	return {
		disposition: 'outcome_uncertain',
		failureCode: 'uncertain_external_commit',
		message: error instanceof Error ? error.message : String(error)
	};
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
