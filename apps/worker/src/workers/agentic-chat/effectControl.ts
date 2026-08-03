// apps/worker/src/workers/agentic-chat/effectControl.ts
import {
	type ChatTurnEffectRpcResultV1,
	type ChatTurnEffectStateV1,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from './executionControl';

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export type AgenticChatEffectRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatEffectIdentityV1 = AgenticChatExecutionIdentityV1 & {
	effectId: string;
	sessionId: string;
	userId: string;
	executionGeneration: number;
	canonicalArgumentHash: string;
	downstreamIdempotencySupported: boolean;
};

export type AgenticChatEffectReservationInputV1 = AgenticChatEffectIdentityV1 & {
	toolName: string;
	operationName: string;
	providerToolCallId: string | null;
};

export type AgenticChatEffectBeginInputV1 = AgenticChatEffectIdentityV1 & {
	providerToolCallId: string | null;
};

export type AgenticChatEffectReconciliationInputV1 = AgenticChatEffectIdentityV1 & {
	targetState: Extract<ChatTurnEffectStateV1, 'succeeded' | 'failed' | 'cancelled' | 'uncertain'>;
	downstreamReceipt: JsonObject | null;
	failureCode: string | null;
};

export type AgenticChatEffectControlPortV1 = {
	reserve(input: AgenticChatEffectReservationInputV1): Promise<ChatTurnEffectRpcResultV1>;
	begin(input: AgenticChatEffectBeginInputV1): Promise<ChatTurnEffectRpcResultV1>;
	reconcile(input: AgenticChatEffectReconciliationInputV1): Promise<ChatTurnEffectRpcResultV1>;
};

export class AgenticChatEffectControlRpcError extends Error {
	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatEffectControlRpcError';
	}
}

export class AgenticChatEffectControlProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat effect-control receipt: ${message}`);
		this.name = 'AgenticChatEffectControlProtocolError';
	}
}

/** Strict service-role adapter over the hosted effect lifecycle RPCs. */
export class SupabaseAgenticChatEffectControlAdapter implements AgenticChatEffectControlPortV1 {
	constructor(private readonly client: AgenticChatEffectRpcClient) {}

	async reserve(input: AgenticChatEffectReservationInputV1): Promise<ChatTurnEffectRpcResultV1> {
		validateReservationInput(input);
		const value = await this.call('reserve_agentic_chat_effect', {
			p_effect_id: input.effectId,
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_execution_generation: input.executionGeneration,
			p_tool_name: input.toolName,
			p_operation_name: input.operationName,
			p_canonical_argument_hash: input.canonicalArgumentHash,
			p_downstream_idempotency_supported: input.downstreamIdempotencySupported,
			p_provider_tool_call_id: input.providerToolCallId
		});
		return parseEffectReceipt(value, input, 'reserve');
	}

	async begin(input: AgenticChatEffectBeginInputV1): Promise<ChatTurnEffectRpcResultV1> {
		validateEffectIdentity(input);
		validateProviderToolCallId(input.providerToolCallId);
		const value = await this.call('begin_agentic_chat_effect', {
			p_effect_id: input.effectId,
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_execution_generation: input.executionGeneration,
			p_canonical_argument_hash: input.canonicalArgumentHash,
			p_provider_tool_call_id: input.providerToolCallId
		});
		return parseEffectReceipt(value, input, 'begin');
	}

	async reconcile(
		input: AgenticChatEffectReconciliationInputV1
	): Promise<ChatTurnEffectRpcResultV1> {
		validateReconciliationInput(input);
		const value = await this.call('reconcile_agentic_chat_effect', {
			p_effect_id: input.effectId,
			p_turn_run_id: input.turnRunId,
			p_queue_job_id: input.queueJobId,
			p_processing_token: input.processingToken,
			p_execution_generation: input.executionGeneration,
			p_canonical_argument_hash: input.canonicalArgumentHash,
			p_target_state: input.targetState,
			p_downstream_receipt: input.downstreamReceipt,
			p_failure_code: input.failureCode
		});
		return parseEffectReceipt(value, input, 'reconcile');
	}

	private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
		const { data, error } = await this.client.rpc(name, args);
		if (error) {
			throw new AgenticChatEffectControlRpcError(name, error.code ?? '', error.message);
		}
		if (data === null || data === undefined) throw protocolError(`${name} returned no receipt`);
		return data;
	}
}

function parseEffectReceipt(
	value: unknown,
	expected: AgenticChatEffectIdentityV1,
	operation: 'reserve' | 'begin' | 'reconcile'
): ChatTurnEffectRpcResultV1 {
	const receipt = requireRecord(value);
	if (
		receipt.effectId !== expected.effectId ||
		receipt.turnRunId !== expected.turnRunId ||
		receipt.sessionId !== expected.sessionId ||
		receipt.userId !== expected.userId ||
		!positiveIntegerValue(receipt.executionGeneration) ||
		receipt.downstreamIdempotencySupported !== expected.downstreamIdempotencySupported ||
		!isEffectState(receipt.state) ||
		typeof receipt.invokeAdapter !== 'boolean' ||
		!isNullableTimestamp(receipt.startedAt) ||
		!isNullableTimestamp(receipt.finishedAt) ||
		!isNullableJsonObject(receipt.downstreamReceipt)
	) {
		throw protocolError('receipt identity or common fields are invalid');
	}

	const outcome = receipt.outcome;
	if (
		(operation === 'reserve' && outcome !== 'reserved' && outcome !== 'existing') ||
		(operation === 'begin' && outcome !== 'started' && outcome !== 'existing') ||
		(operation === 'reconcile' && outcome !== 'reconciled' && outcome !== 'existing')
	) {
		throw protocolError(`${operation} outcome is invalid`);
	}
	if (outcome === 'reserved' && receipt.executionGeneration !== expected.executionGeneration) {
		throw protocolError('new reservation generation is inconsistent');
	}
	if (outcome === 'started' && receipt.invokeAdapter !== true) {
		throw protocolError('started receipt does not grant adapter authority');
	}
	if (outcome !== 'started' && receipt.invokeAdapter !== false) {
		throw protocolError('receipt grants adapter authority outside the start winner');
	}
	if (outcome === 'reserved' && receipt.state !== 'reserved') {
		throw protocolError('reservation state is inconsistent');
	}
	if (outcome === 'started' && receipt.state !== 'started') {
		throw protocolError('started state is inconsistent');
	}
	if (
		operation === 'reconcile' &&
		outcome === 'reconciled' &&
		receipt.state !== (expected as AgenticChatEffectReconciliationInputV1).targetState
	) {
		throw protocolError('reconciled state does not match the requested target');
	}
	if (!validEffectStateShape(receipt)) {
		throw protocolError('effect state timestamps or receipt are inconsistent');
	}

	return receipt as unknown as ChatTurnEffectRpcResultV1;
}

function validEffectStateShape(receipt: Record<string, unknown>): boolean {
	const state = receipt.state as ChatTurnEffectStateV1;
	if (state === 'reserved') {
		return (
			receipt.startedAt === null &&
			receipt.finishedAt === null &&
			receipt.downstreamReceipt === null
		);
	}
	if (state === 'started') {
		return (
			isTimestamp(receipt.startedAt) &&
			receipt.finishedAt === null &&
			receipt.downstreamReceipt === null
		);
	}
	if (state === 'cancelled') {
		return isTimestamp(receipt.finishedAt) && receipt.downstreamReceipt === null;
	}
	return isTimestamp(receipt.startedAt) && isTimestamp(receipt.finishedAt);
}

function validateReservationInput(input: AgenticChatEffectReservationInputV1): void {
	validateEffectIdentity(input);
	if (!canonicalText(input.toolName, 256)) throw protocolError('tool name is invalid');
	if (!canonicalText(input.operationName, 256)) throw protocolError('operation name is invalid');
	validateProviderToolCallId(input.providerToolCallId);
}

function validateReconciliationInput(input: AgenticChatEffectReconciliationInputV1): void {
	validateEffectIdentity(input);
	if (!isJsonObject(input.downstreamReceipt)) {
		throw protocolError('downstream receipt must be a JSON object or null');
	}
	if (input.failureCode !== null && !canonicalText(input.failureCode, 128)) {
		throw protocolError('failure code is invalid');
	}
	if (input.targetState === 'succeeded' && input.failureCode !== null) {
		throw protocolError('succeeded reconciliation cannot carry a failure code');
	}
	if (
		(input.targetState === 'failed' || input.targetState === 'uncertain') &&
		input.failureCode === null
	) {
		throw protocolError(`${input.targetState} reconciliation requires a failure code`);
	}
	if (
		input.targetState === 'cancelled' &&
		(input.downstreamReceipt !== null || input.failureCode !== null)
	) {
		throw protocolError('cancelled reconciliation cannot carry downstream outcome data');
	}
}

function validateEffectIdentity(input: AgenticChatEffectIdentityV1): void {
	canonicalUuid(input.effectId, 'effectId');
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.queueJobId, 'queueJobId');
	canonicalUuid(input.processingToken, 'processingToken');
	canonicalUuid(input.sessionId, 'sessionId');
	canonicalUuid(input.userId, 'userId');
	if (!positiveIntegerValue(input.executionGeneration)) {
		throw protocolError('execution generation must be positive');
	}
	if (!SHA256_PATTERN.test(input.canonicalArgumentHash)) {
		throw protocolError('canonical argument hash is invalid');
	}
	if (typeof input.downstreamIdempotencySupported !== 'boolean') {
		throw protocolError('downstream idempotency capability is invalid');
	}
}

function validateProviderToolCallId(value: string | null): void {
	if (value !== null && !canonicalText(value, 512)) {
		throw protocolError('provider tool-call id is invalid');
	}
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError('receipt must be an object');
	}
	return value as Record<string, unknown>;
}

function isNullableJsonObject(value: unknown): value is JsonObject | null {
	return value === null || isJsonObject(value);
}

function isJsonObject(value: unknown): value is JsonObject | null {
	if (value === null) return true;
	if (typeof value !== 'object' || Array.isArray(value)) return false;
	try {
		canonicalizeAgenticChatJson(value as JsonValue);
		return true;
	} catch {
		return false;
	}
}

function isEffectState(value: unknown): value is ChatTurnEffectStateV1 {
	return EFFECT_STATES.has(value as ChatTurnEffectStateV1);
}

function isNullableTimestamp(value: unknown): value is string | null {
	return value === null || isTimestamp(value);
}

function isTimestamp(value: unknown): value is string {
	return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw protocolError(`${label} is not a canonical UUID`);
	}
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function positiveIntegerValue(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 1;
}

function protocolError(message: string): AgenticChatEffectControlProtocolError {
	return new AgenticChatEffectControlProtocolError(message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EFFECT_STATES = new Set<ChatTurnEffectStateV1>([
	'reserved',
	'started',
	'succeeded',
	'failed',
	'cancelled',
	'uncertain'
]);
