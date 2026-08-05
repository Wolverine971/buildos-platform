// apps/worker/src/workers/agentic-chat/readToolIdentity.ts
import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type AgenticChatReadToolTransitionStageV1 = 'planning' | 'call' | 'result';

/** Stable public transition identity for the single bounded read round. */
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
	if (input.stage !== 'planning' && input.stage !== 'call' && input.stage !== 'result') {
		throw new Error('Agentic Chat read-tool transition stage is invalid');
	}

	const bytes = createHash('sha256')
		.update(
			`agentic-chat-read-tool-transition-v1:${input.turnRunId}:${input.providerToolCallId}:${input.stage}`,
			'utf8'
		)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
