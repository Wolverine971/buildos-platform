import {
	type ChatToolCall,
	type ChatToolResult,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	buildMemoServedResult,
	buildReadMemoKey,
	isPureReadToolName,
	shouldMemoizeReadResult
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatReadToolExecutionV1 } from '../toolExecution';
import type { AgenticChatSupervisorBlockedToolCallV1 } from '../workerSupervisorDecisions';
import { TOOL_METADATA } from '@buildos/agentic-chat-runtime/catalog';
import type {
	AgenticChatProviderMutationSynthesisInputV1,
	AgenticChatProviderReadSynthesisInputV1,
	AgenticChatProviderToolSynthesisInputV1
} from './contracts';
import { isCanonicalProviderText, providerError } from './protocol';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export type AgenticChatFeedbackToolCall = CompletedProviderToolCall &
	(
		| { kind: 'read'; supervisorFailure?: AgenticChatSupervisorBlockedToolCallV1 }
		| {
				kind: 'mutation';
				logicalOperationId: string;
				operationName: string;
				downstreamIdempotencySupported: boolean;
				supervisorFailure?: AgenticChatSupervisorBlockedToolCallV1;
		  }
	);

export function validateReadFeedback(
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): void {
	if (
		feedback.providerToolCallId !== call.id ||
		feedback.toolName !== call.name ||
		canonicalizeAgenticChatJson(feedback.arguments as JsonValue) !== call.canonicalArguments
	) {
		throw providerError('provider_read_feedback_mismatch', 'unknown');
	}
	canonicalizeAgenticChatJson(feedback.execution.result as JsonValue);
}

export function validateToolFeedback(
	call: AgenticChatFeedbackToolCall,
	feedback: AgenticChatProviderToolSynthesisInputV1
): void {
	if (
		feedback.providerToolCallId !== call.id ||
		feedback.toolName !== call.name ||
		canonicalizeAgenticChatJson(feedback.arguments as JsonValue) !== call.canonicalArguments
	) {
		throw providerError('provider_read_feedback_mismatch', 'unknown');
	}
	if (call.supervisorFailure) {
		if (
			!isFailedToolFeedback(feedback) ||
			feedback.failure.kind !== 'supervisor_block' ||
			feedback.failure.error !== call.supervisorFailure.error ||
			feedback.failure.toolCategory !== (TOOL_METADATA[call.name]?.category ?? null) ||
			canonicalizeAgenticChatJson(feedback.failure.modelPayload as JsonValue) !==
				canonicalizeAgenticChatJson(call.supervisorFailure.modelPayload as JsonValue)
		) {
			throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
		}
		return;
	}
	if (isFailedToolFeedback(feedback)) {
		if (
			call.kind !== 'mutation' ||
			feedback.failure.kind !== 'known_execution_failure' ||
			!isCanonicalProviderText(feedback.failure.error, 4_000) ||
			(feedback.failure.toolCategory !== null &&
				!isCanonicalProviderText(feedback.failure.toolCategory, 128)) ||
			feedback.failure.modelPayload.error !== feedback.failure.error
		) {
			throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
		}
		canonicalizeAgenticChatJson(feedback.failure.modelPayload as JsonValue);
		return;
	}
	canonicalizeAgenticChatJson(feedback.execution.result as JsonValue);
	if (call.kind === 'read') {
		if (isMutationFeedback(feedback)) {
			throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
		}
		return;
	}
	if (
		!isMutationFeedback(feedback) ||
		feedback.mutation.logicalOperationId !== call.logicalOperationId ||
		feedback.mutation.operationName !== call.operationName
	) {
		throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
	}
}

export function isMutationFeedback(
	feedback: AgenticChatProviderToolSynthesisInputV1
): feedback is Extract<AgenticChatProviderToolSynthesisInputV1, { mutation: unknown }> {
	return 'mutation' in feedback;
}

export function isFailedToolFeedback(
	feedback: AgenticChatProviderToolSynthesisInputV1
): feedback is Extract<AgenticChatProviderToolSynthesisInputV1, { failure: unknown }> {
	return 'failure' in feedback;
}

export function completedProviderCallToChatToolCall(call: CompletedProviderToolCall): ChatToolCall {
	return {
		id: call.id,
		type: 'function',
		function: { name: call.name, arguments: call.canonicalArguments }
	};
}

function executionToChatToolResult(
	toolCallId: string,
	execution:
		| AgenticChatProviderReadSynthesisInputV1['execution']
		| AgenticChatProviderMutationSynthesisInputV1['execution']
): ChatToolResult {
	return {
		tool_call_id: toolCallId,
		result: execution.result,
		success: true,
		...(execution.executionTimeMs !== null ? { duration_ms: execution.executionTimeMs } : {}),
		...(execution.tokensConsumed !== null ? { tokens_consumed: execution.tokensConsumed } : {}),
		...(execution.requiresUserAction !== null
			? { requires_user_action: execution.requiresUserAction }
			: {})
	};
}

export function feedbackToChatToolResult(
	toolCallId: string,
	feedback: AgenticChatProviderToolSynthesisInputV1
): ChatToolResult {
	if (isFailedToolFeedback(feedback)) {
		return {
			tool_call_id: toolCallId,
			result: null,
			success: false,
			error: feedback.failure.error
		};
	}
	return executionToChatToolResult(toolCallId, feedback.execution);
}

export function memoizeCompletedRead(
	memo: Map<string, AgenticChatReadToolExecutionV1>,
	call: CompletedProviderToolCall,
	execution: AgenticChatReadToolExecutionV1
): void {
	if (!isPureReadToolName(call.name)) return;
	const toolCall = completedProviderCallToChatToolCall(call);
	const key = buildReadMemoKey(toolCall);
	if (!key || memo.has(key)) return;
	const result = executionToChatToolResult(call.id, execution);
	if (!shouldMemoizeReadResult(result)) return;
	memo.set(key, execution);
}

export function resolveMemoServedExecution(
	memo: Map<string, AgenticChatReadToolExecutionV1>,
	call: CompletedProviderToolCall
): AgenticChatReadToolExecutionV1 | null {
	if (!isPureReadToolName(call.name)) return null;
	const key = buildReadMemoKey(completedProviderCallToChatToolCall(call));
	const cached = key ? memo.get(key) : undefined;
	if (!cached) return null;
	const served = buildMemoServedResult(executionToChatToolResult(call.id, cached), call.id);
	const canonicalResult = canonicalizeAgenticChatJson(served.result as JsonValue);
	const result = JSON.parse(canonicalResult) as unknown;
	if (!result || typeof result !== 'object' || Array.isArray(result)) {
		throw providerError('provider_read_memo_result_invalid', 'unknown');
	}
	return {
		result: result as JsonObject,
		executionTimeMs: served.duration_ms ?? 0,
		tokensConsumed: served.tokens_consumed ?? null,
		affectedEntities: cached.affectedEntities,
		toolCategory: cached.toolCategory,
		resultCount: cached.resultCount,
		zeroResult: cached.zeroResult,
		requiresUserAction: served.requires_user_action ?? cached.requiresUserAction
	};
}
