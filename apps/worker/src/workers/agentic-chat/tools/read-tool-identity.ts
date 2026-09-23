// apps/worker/src/workers/agentic-chat/tools/read-tool-identity.ts
import { stableUuidFromSeed } from '../shared/identity-hash';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type AgenticChatReadToolTransitionStageV1 = 'planning' | 'call' | 'result' | 'context_shift';

/** Stable public transition identity for one bounded read-tool lifecycle. */
export function createStableAgenticChatReadToolTransitionIdV1(input: {
	turnRunId: string;
	providerToolCallId: string;
	stage: AgenticChatReadToolTransitionStageV1;
}): string {
	if (!UUID_PATTERN.test(input.turnRunId) || input.turnRunId !== input.turnRunId.toLowerCase()) {
		throw new Error('Agentic Chat read-tool turnRunId must be a canonical UUID');
	}
	if (
		!input.providerToolCallId ||
		input.providerToolCallId !== input.providerToolCallId.trim() ||
		input.providerToolCallId.length > 512
	) {
		throw new Error('Agentic Chat provider tool-call id is invalid');
	}
	if (
		input.stage !== 'planning' &&
		input.stage !== 'call' &&
		input.stage !== 'result' &&
		input.stage !== 'context_shift'
	) {
		throw new Error('Agentic Chat read-tool transition stage is invalid');
	}

	return stableUuidFromSeed(
		`agentic-chat-read-tool-transition-v1:${input.turnRunId}:${input.providerToolCallId}:${input.stage}`
	);
}

/**
 * Identity for one intra-tool progress event. Keyed on the execution generation
 * so a retried generation (whose steps may differ) never reuses a transition id
 * with a different payload, which the semantic write RPC rejects as a conflict.
 */
export function createStableAgenticChatReadToolProgressTransitionIdV1(input: {
	turnRunId: string;
	executionGeneration: number;
	providerToolCallId: string;
	index: number;
}): string {
	if (!Number.isInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw new Error('Agentic Chat read-tool progress generation is invalid');
	}
	if (!Number.isInteger(input.index) || input.index < 0 || input.index > 999) {
		throw new Error('Agentic Chat read-tool progress index is invalid');
	}
	// Reuse the lifecycle hash for id validation, then derive a progress id.
	createStableAgenticChatReadToolTransitionIdV1({
		turnRunId: input.turnRunId,
		providerToolCallId: input.providerToolCallId,
		stage: 'call'
	});
	return stableUuidFromSeed(
		`agentic-chat-read-tool-progress-v1:${input.turnRunId}:${input.executionGeneration}:${input.providerToolCallId}:${input.index}`
	);
}
