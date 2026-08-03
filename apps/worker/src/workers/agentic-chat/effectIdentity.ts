// apps/worker/src/workers/agentic-chat/effectIdentity.ts
import { createHash } from 'node:crypto';
import {
	type JsonObject,
	canonicalizeAgenticChatJson,
	normalizeAgenticChatText
} from '@buildos/shared-types';

export type StableAgenticChatEffectIdentityV1 = {
	effectId: string;
	canonicalArgumentHash: string;
	downstreamIdempotencyKey: string;
};

/**
 * Builds a runtime-owned effect identity from the stable logical operation.
 * Provider tool-call ids and execution generations are deliberately absent.
 */
export function createStableAgenticChatEffectIdentityV1(input: {
	turnRunId: string;
	logicalOperationId: string;
	toolName: string;
	operationName: string;
	arguments: JsonObject;
}): StableAgenticChatEffectIdentityV1 {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.logicalOperationId, 'logicalOperationId');
	canonicalName(input.toolName, 'toolName');
	canonicalName(input.operationName, 'operationName');
	const canonicalArguments = canonicalizeAgenticChatJson(input.arguments);
	const canonicalArgumentHash = sha256(canonicalArguments);
	const identitySeed = canonicalizeAgenticChatJson({
		version: 'agentic_chat_effect_identity_v1',
		turnRunId: input.turnRunId,
		logicalOperationId: input.logicalOperationId
	});
	const effectId = uuidFromSha256(identitySeed);
	return {
		effectId,
		canonicalArgumentHash,
		downstreamIdempotencyKey: `chat-effect:${effectId}`
	};
}

function uuidFromSha256(value: string): string {
	const bytes = createHash('sha256').update(value, 'utf8').digest().subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalName(value: string, label: string): string {
	const normalized = normalizeAgenticChatText(value);
	if (!normalized || normalized.length > 256) throw new Error(`${label} is invalid`);
	return normalized;
}

function canonicalUuid(value: string, label: string): void {
	if (!UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw new Error(`${label} must be a canonical UUID`);
	}
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
