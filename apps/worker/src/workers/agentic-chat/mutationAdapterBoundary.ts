import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson,
	decodeAgenticChatToolSurfaceV1
} from '@buildos/shared-types';
import {
	type AgenticChatMutatingToolPortV1,
	AgenticChatMutationAdapterError
} from './mutation-executor';

const MAX_RECEIPT_BYTES = 480 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KNOWN_PRECOMMIT_GATEWAY_CODES = new Set(['VALIDATION_ERROR', 'NOT_FOUND', 'FORBIDDEN']);

export type MutationInput = Parameters<AgenticChatMutatingToolPortV1['execute']>[0];

/** Common fail-closed checks shared by every independently gated mutation adapter. */
export function assertMutationAdapterBoundary(
	input: MutationInput,
	spec: {
		toolName: string;
		operationName: string;
		downstreamIdempotencySupported: boolean;
		reviewedArgumentNames: ReadonlySet<string>;
	}
): void {
	if (input.toolName !== spec.toolName || input.operationName !== spec.operationName) {
		throw knownFailure(
			'mutation_adapter_not_allowlisted',
			`Only ${spec.toolName} / ${spec.operationName} is enabled for this adapter`
		);
	}
	if (!canonicalUuid(input.effectId)) {
		throw knownFailure('mutation_effect_identity_invalid', 'Mutation effect_id is invalid');
	}
	if (input.downstreamIdempotencyKey !== `chat-effect:${input.effectId}`) {
		throw knownFailure(
			'mutation_effect_identity_invalid',
			'Mutation downstream idempotency key does not match effect_id'
		);
	}
	if (input.downstreamIdempotencySupported !== spec.downstreamIdempotencySupported) {
		throw knownFailure(
			'mutation_idempotency_contract_invalid',
			`${spec.toolName} downstream idempotency classification is invalid`
		);
	}
	if (!canonicalText(input.providerToolCallId, 512)) {
		throw knownFailure(
			'mutation_provider_call_invalid',
			'Mutation provider tool-call identity is invalid'
		);
	}

	const surface = input.executionInput.artifact.prepared.toolSurface;
	if (!isRecord(surface)) {
		throw knownFailure('mutation_tool_not_admitted', 'Mutation tool surface is missing');
	}
	const decodedSurface = decodeAgenticChatToolSurfaceV1(surface);
	const selected = decodedSurface.ok && decodedSurface.surface.toolNames.includes(spec.toolName);
	const defined =
		decodedSurface.ok &&
		decodedSurface.surface.definitions.some(
			(definition) => definition.function.name === spec.toolName
		);
	if (!selected || !defined) {
		throw knownFailure(
			'mutation_tool_not_admitted',
			`${spec.toolName} is absent from the immutable admitted tool surface`
		);
	}

	const unsupported = Object.keys(input.arguments).filter(
		(name) => !spec.reviewedArgumentNames.has(name)
	);
	if (unsupported.length > 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`${spec.toolName} contains unsupported arguments: ${unsupported.sort().join(', ')}`
		);
	}
	if (input.signal.aborted) {
		throw knownFailure(
			'mutation_cancelled_before_dispatch',
			'Mutation cancelled before dispatch'
		);
	}
}

export function requestProjectId(input: MutationInput): string | null {
	const context = input.executionInput.requestPayload.context;
	if (!isRecord(context)) {
		throw knownFailure('mutation_context_invalid', 'Mutation turn context is invalid');
	}
	const explicit = optionalUuid(context.projectId, 'context projectId');
	const entity = optionalUuid(context.entityId, 'context entityId');
	if (context.type === 'project') {
		if (explicit !== null && entity !== null && explicit !== entity) {
			throw knownFailure(
				'mutation_context_invalid',
				'Mutation project context is inconsistent'
			);
		}
		const projectId = explicit ?? entity;
		if (projectId === null) {
			throw knownFailure(
				'mutation_context_invalid',
				'Mutation project context has no project ID'
			);
		}
		return projectId;
	}
	return explicit;
}

export function canonicalMutationReceipt(
	value: Record<string, unknown>,
	toolName: string
): JsonObject {
	const canonical = canonicalizeAgenticChatJson(value as JsonValue);
	const parsed = JSON.parse(canonical) as unknown;
	if (!isRecord(parsed)) {
		throw uncertainFailure(
			`${toolName}_receipt_invalid`,
			`${toolName} returned a non-object receipt`
		);
	}
	return parsed as JsonObject;
}

export function assertMutationReceiptSize(receipt: JsonObject, toolName: string): void {
	if (Buffer.byteLength(JSON.stringify(receipt), 'utf8') <= MAX_RECEIPT_BYTES) return;
	// The write has already returned success. A receipt that cannot fit the
	// effect ledger is an uncertain commit, never a retryable validation failure.
	throw uncertainFailure(
		`${toolName}_receipt_too_large`,
		`${toolName} returned an oversized downstream receipt`
	);
}

export function throwGatewayResultFailure(
	toolName: string,
	error: { code?: string; message?: string } | null | undefined
): never {
	const code = error?.code ?? 'INTERNAL';
	const message = error?.message ?? `${toolName} gateway failed`;
	if (KNOWN_PRECOMMIT_GATEWAY_CODES.has(code)) {
		throw knownFailure(`${toolName}_${code.toLowerCase()}`, message);
	}
	throw uncertainFailure(`${toolName}_outcome_uncertain`, message);
}

export function requiredUuid(value: unknown, label: string): string {
	if (!canonicalUuid(value)) {
		throw knownFailure('mutation_scope_invalid', `${label} must be a canonical UUID`);
	}
	return value;
}

export function optionalUuid(value: unknown, label: string): string | null {
	if (value === undefined || value === null || value === '') return null;
	return requiredUuid(value, label);
}

export function canonicalUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function knownFailure(
	code: string,
	message: string
): AgenticChatMutationAdapterError {
	return new AgenticChatMutationAdapterError('known_failed', code, message);
}

export function uncertainFailure(
	code: string,
	message: string
): AgenticChatMutationAdapterError {
	return new AgenticChatMutationAdapterError('outcome_uncertain', code, message);
}

export function canonicalGatewayError(error: unknown, toolName: string): string {
	return error instanceof Error ? error.message : String(error ?? `${toolName} gateway failed`);
}

function canonicalText(value: unknown, maxLength: number): value is string {
	return (
		typeof value === 'string' &&
		value === value.trim() &&
		value.length > 0 &&
		value.length <= maxLength
	);
}
