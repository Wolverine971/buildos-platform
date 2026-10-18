// apps/worker/src/workers/agentic-chat/provider/review/disposition.ts
import {
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import { appendSystemInstruction, forceToolFreeRequest } from '../request-builders';
import type { CompletedProviderToolCall } from '../stream-tool-calls';
import { surfaceFor } from '../turn-phase';

export function buildPostSemanticDispositionRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	dispositionToolName: string
): AgenticChatTurnProviderRequestV1 {
	if (dispositionToolName === DECLARE_READ_ONLY_TURN_TOOL_NAME) {
		return {
			...request,
			...surfaceFor('read_only_declared', availableTools)!,
			providerRound: 'synthesis'
		};
	}
	return appendSystemInstruction(
		forceToolFreeRequest(request),
		'Clarification is required. Ask the unresolved question now and wait for the user; do not perform a durable mutation in this turn. Ask it plainly as your own question in one or two sentences; do not narrate internal review, contracts, approvals, or self-corrections.'
	);
}

/**
 * Two dispositions in one pass used to be a permanent
 * `provider_semantic_disposition_invalid`. The first one is the model's
 * decision; the rest are dropped without execution and the model is told so
 * on its next pass.
 */
export function reconcileSemanticDispositionCalls(calls: readonly CompletedProviderToolCall[]): {
	calls: readonly CompletedProviderToolCall[];
	notice: string | null;
} {
	const dispositions = calls.filter((call) => isSemanticDispositionToolName(call.name));
	if (dispositions.length <= 1) return { calls, notice: null };
	const kept = dispositions[0]!;
	const dropped = new Set(dispositions.slice(1));
	const reconciled = calls.filter((call) => !dropped.has(call));
	const droppedNames = Array.from(new Set([...dropped].map((call) => call.name))).sort();
	return {
		calls: reconciled,
		notice: [
			`Disposition repair: the previous pass called ${dispositions.map((call) => call.name).join(' and ')} together.`,
			`Exactly one disposition is allowed per pass; only the first, ${kept.name}, was taken and ${droppedNames.join(', ')} ${droppedNames.length === 1 ? 'was' : 'were'} rejected without execution.`,
			'Continue from that disposition and do not call another disposition control in this turn unless the harness asks for one.'
		].join(' ')
	};
}

export function isSemanticDispositionToolName(toolName: string): boolean {
	return (
		toolName === DECLARE_READ_ONLY_TURN_TOOL_NAME ||
		toolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME
	);
}
