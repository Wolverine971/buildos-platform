// apps/worker/src/workers/agentic-chat/providerContract.ts

import type {
	AgentStreamEventPhaseV1,
	AgenticChatRecoveryFailureClassV1,
	JsonObject
} from '@buildos/shared-types';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import type { AgenticChatReadToolExecutionV1 } from './toolExecution';

export type AgenticChatProviderUsageV1 = {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
};

export type AgenticChatProviderStepV1 =
	| { type: 'text_delta'; text: string }
	| {
			type: 'semantic';
			transitionId: string;
			phase: AgentStreamEventPhaseV1;
			eventType: string;
			currentActivity: string;
			eventPayload: JsonObject;
	  }
	| ({
			type: 'read_tool';
			callTransitionId: string;
			resultTransitionId: string;
			providerToolCallId: string;
			toolName: string;
			arguments: JsonObject;
	  } & (
			| {
					/**
					 * A provider call rejected before execution. The executor records the
					 * failed call behind the same durable/public fence as a normal read, but
					 * never invokes the read adapter or returns it through the round bridge.
					 */
					validationFailure: {
						error: string;
						toolCategory: string | null;
					};
					memoServed?: never;
			  }
			| {
					/**
					 * An exact successful pure read already completed in this turn. The
					 * executor skips the read adapter but still persists and publishes this
					 * call-specific execution before returning it to the provider.
					 */
					memoServed: AgenticChatReadToolExecutionV1;
					validationFailure?: never;
			  }
			| { validationFailure?: never; memoServed?: never }
	  ))
	| {
			type: 'mutating_tool';
			callTransitionId: string;
			resultTransitionId: string;
			logicalOperationId: string;
			providerToolCallId: string;
			toolName: string;
			operationName: string;
			arguments: JsonObject;
			downstreamIdempotencySupported: boolean;
	  }
	| {
			type: 'finish';
			finishedReason: string;
			usage: AgenticChatProviderUsageV1 | null;
	  };

export type AgenticChatProviderInputV1 = {
	executionInput: AgenticChatWorkerExecutionInputV1;
	/** Current queue ownership token used only for fenced private observations. */
	processingToken: string;
	signal: AbortSignal;
};

export const AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION = 'agentic_chat_worker_prompt_v1' as const;

/**
 * Exact provider-facing prompt captured during preparation, before the start
 * fence permits network I/O. The snapshot owns no delivery or event identity;
 * the fenced persistence adapter derives that from the turn.
 */
export type AgenticChatPreparedPromptSnapshotV1 = {
	snapshotVersion: typeof AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION;
	modelMessages: JsonObject[];
	systemPromptSha256: string;
	messagesSha256: string;
	systemPromptChars: number;
	messageChars: number;
	approxPromptTokens: number;
};

export type AgenticChatPreparedProviderInvocationV1 = {
	/** Exact immutable prompt sent by this prepared invocation. */
	promptSnapshot?: AgenticChatPreparedPromptSnapshotV1;
	/** No network/provider work may begin until the executor calls this after its start fence. */
	stream(): AsyncIterable<AgenticChatProviderStepV1>;
	/**
	 * @deprecated Single-result alias retained for the Phase 3 bounded adapter.
	 * The executor keeps its one-read fence byte-identical for providers that
	 * expose only this pass; new adapters implement `continueWithToolResults`.
	 */
	synthesize?(
		input: AgenticChatProviderReadSynthesisInputV1
	): AsyncIterable<AgenticChatProviderStepV1>;
	/**
	 * Multi-round continuation (Phase 4 Slice 18 S1). A provider round ends when
	 * its iterable completes without emitting `finish`; the executor then calls
	 * this with every successful tool result of that round — each already durable in the
	 * tool-execution ledger and publicly committed as a `tool_result` event —
	 * and consumes the returned round the same way. Takes precedence over the
	 * deprecated `synthesize` alias when both are present.
	 */
	continueWithToolResults?(
		input: AgenticChatProviderToolRoundInputV1
	): AsyncIterable<AgenticChatProviderStepV1>;
	/** Clear provider-owned pure-read memoization before any write can execute. */
	invalidateReadMemo?(): void;
	/** Idempotently release any pre-start capacity reservation. */
	release(): void;
};

export type AgenticChatProviderReadSynthesisInputV1 = {
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	execution: AgenticChatReadToolExecutionV1;
};

export type AgenticChatProviderMutationSynthesisInputV1 = {
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	execution: {
		result: JsonObject | null;
		executionTimeMs: number | null;
		tokensConsumed: number | null;
		affectedEntities: JsonObject[];
		toolCategory: string;
		resultCount: null;
		zeroResult: null;
		requiresUserAction: boolean | null;
	};
	mutation: {
		effectId: string;
		logicalOperationId: string;
		operationName: string;
		replayed: boolean;
	};
};

export type AgenticChatProviderToolSynthesisInputV1 =
	| AgenticChatProviderReadSynthesisInputV1
	| AgenticChatProviderMutationSynthesisInputV1;

export type AgenticChatProviderToolRoundInputV1 = {
	/** 1-based provider round about to start; the initial `stream()` pass is round 1. */
	round: number;
	/** Ordered durable/public results from the preceding provider round. */
	results: readonly AgenticChatProviderToolSynthesisInputV1[];
};

/**
 * Phase 3 providers use `prepare` to validate input and reserve a slot before
 * the execution-start CAS. The legacy `stream` shape remains only for Phase 2
 * deterministic fixtures and must not be used by a real provider adapter.
 */
export type AgenticChatProviderPortV1 = {
	prepare?(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1>;
	stream?(input: AgenticChatProviderInputV1): AsyncIterable<AgenticChatProviderStepV1>;
};

export class AgenticChatProviderExecutionError extends Error {
	constructor(
		readonly code: string,
		readonly failureClass: AgenticChatRecoveryFailureClassV1,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatProviderExecutionError';
	}
}
