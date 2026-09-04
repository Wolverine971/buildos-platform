// apps/worker/src/workers/agentic-chat/provider/feedback.ts
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
	shouldMemoizeReadResult,
	stripToolDiscoveryHintsFromPayload
} from '@buildos/agentic-chat-runtime/loop';
import { AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1 } from '@buildos/agentic-chat-runtime/tools';
import type { AgenticChatReadToolExecutionV1 } from '../toolExecution';
import type {
	AgenticChatProviderMutationSynthesisInputV1,
	AgenticChatProviderReadSynthesisInputV1,
	AgenticChatProviderToolSynthesisInputV1
} from './contracts';
import { isCanonicalProviderText, providerError } from './protocol';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export type AgenticChatFeedbackToolCall = CompletedProviderToolCall &
	(
		| { kind: 'read' }
		| {
				kind: 'mutation';
				logicalOperationId: string;
				operationName: string;
				downstreamIdempotencySupported: boolean;
		  }
	);

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
	if (isFailedToolFeedback(feedback)) {
		if (feedback.failure.kind === 'dependency_failed') {
			if (
				!isCanonicalProviderText(feedback.failure.error, 4_000) ||
				feedback.failure.toolCategory !== null ||
				feedback.failure.modelPayload.error !== feedback.failure.error
			) {
				throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
			}
			canonicalizeAgenticChatJson(feedback.failure.modelPayload as JsonValue);
			return;
		}
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
	// The worker surface is immutable for the turn, so a result that advertises
	// a follow-up tool (`materialized_tools`, "Use get_onto_document_details …")
	// is always a trap: the next call is provider_tool_not_allowlisted and the
	// turn dies (Finding 2, 2026-09-02). Strip the hints at the normalization
	// boundary so neither the model feedback nor the memo-served replay carries
	// them. The shared read implementations keep emitting them for the web host,
	// which materializes on demand.
	return {
		tool_call_id: toolCallId,
		result: stripToolDiscoveryHintsFromPayload(execution.result) as ChatToolResult['result'],
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

/**
 * The exact tools whose result may be served from the within-turn read memo.
 * `isPureReadToolName` was a heuristic over name shape and metadata, so a tool
 * that merely looked like a read (or a future name that stopped looking like
 * one) silently changed what could be replayed. This is the shared read
 * registry itself: every entry is a side-effect-free ontology read, and a tool
 * that is not on this list is executed every time it is called.
 */
export const READ_MEMO_ELIGIBLE_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
	AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1
);

function isReadMemoEligible(name: string): boolean {
	return READ_MEMO_ELIGIBLE_TOOL_NAMES.has(name.trim());
}

export function memoizeCompletedRead(
	memo: Map<string, AgenticChatReadToolExecutionV1>,
	call: CompletedProviderToolCall,
	execution: AgenticChatReadToolExecutionV1
): void {
	if (!isReadMemoEligible(call.name)) return;
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
	if (!isReadMemoEligible(call.name)) return null;
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
