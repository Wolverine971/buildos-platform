// apps/worker/src/workers/agentic-chat/providerContract.ts

import type {
	AgentStreamEventPhaseV1,
	AgenticChatRecoveryFailureClassV1,
	JsonObject
} from '@buildos/shared-types';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';

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
	| {
			type: 'read_tool';
			callTransitionId: string;
			resultTransitionId: string;
			providerToolCallId: string;
			toolName: string;
			arguments: JsonObject;
	  }
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
	signal: AbortSignal;
};

export type AgenticChatPreparedProviderInvocationV1 = {
	/** No network/provider work may begin until the executor calls this after its start fence. */
	stream(): AsyncIterable<AgenticChatProviderStepV1>;
	/** Idempotently release any pre-start capacity reservation. */
	release(): void;
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
