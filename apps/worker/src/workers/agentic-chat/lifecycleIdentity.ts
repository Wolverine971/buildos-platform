// apps/worker/src/workers/agentic-chat/lifecycleIdentity.ts
import { createHash } from 'node:crypto';

export type AgenticChatExecutorLifecycleStageV1 =
	| 'acknowledged'
	| 'finalizing'
	| 'last_turn_context';
export type AgenticChatExecutorSnapshotStageV1 = 'session' | 'context_usage';
export type AgenticChatExecutorSemanticStageV1 =
	| AgenticChatExecutorLifecycleStageV1
	| AgenticChatExecutorSnapshotStageV1;

/**
 * Derive the idempotency identity for executor-owned lifecycle events.
 *
 * Execution generation and provider call order are deliberately absent. The
 * database still scopes persisted events by generation, while retries retain
 * the same logical transition identity within their isolated event streams.
 */
export function createStableAgenticChatLifecycleTransitionIdV1(input: {
	turnRunId: string;
	stage: AgenticChatExecutorSemanticStageV1;
}): string {
	canonicalUuid(input.turnRunId, 'turnRunId');
	if (
		input.stage !== 'acknowledged' &&
		input.stage !== 'session' &&
		input.stage !== 'context_usage' &&
		input.stage !== 'finalizing' &&
		input.stage !== 'last_turn_context'
	) {
		throw new Error('Agentic Chat lifecycle stage is invalid');
	}
	const bytes = createHash('sha256')
		.update(`agentic-chat-lifecycle-transition-v1:${input.turnRunId}:${input.stage}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalUuid(value: string, label: string): void {
	if (!UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw new Error(`${label} must be a canonical UUID`);
	}
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
