// apps/worker/src/workers/agentic-chat/toolExecution.ts
import { createHash } from 'node:crypto';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson,
	normalizeAgenticChatText
} from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from './executionControl';
import { runWithAbortableDeadline } from './abortableDeadline';
import { agenticChatGenerationWriteFenceArgsV1 } from './writeFence';

const IDENTITY_VERSION = 'agentic_chat_read_tool_execution_identity_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const AGENTIC_CHAT_TOOL_LEDGER_TIMEOUT_MS = 30_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

export type AgenticChatToolExecutionRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatReadToolExecutionV1 = {
	result: JsonObject;
	executionTimeMs: number | null;
	tokensConsumed: number | null;
	affectedEntities: JsonObject[];
	toolCategory: string | null;
	resultCount: number | null;
	zeroResult: boolean | null;
	requiresUserAction: boolean | null;
};

export type AgenticChatToolExecutionPersistInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	executionGeneration: number;
	toolExecutionId: string;
	sequenceIndex: number;
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	execution: AgenticChatReadToolExecutionV1;
};

export type AgenticChatToolFailurePersistInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	executionGeneration: number;
	failureKind: 'validation' | 'mutation' | 'supervisor_block' | 'dependency_failed';
	toolExecutionId: string;
	sequenceIndex: number;
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	toolCategory: string | null;
	error: string;
};

export type AgenticChatMutationToolExecutionPersistInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	executionGeneration: number;
	effectId: string;
	canonicalArgumentHash: string;
	toolExecutionId: string;
	sequenceIndex: number;
	providerToolCallId: string;
	toolName: string;
	operationName: string;
	arguments: JsonObject;
	executionTimeMs: number | null;
	tokensConsumed: number | null;
	requiresUserAction: boolean | null;
	affectedEntities: JsonObject[];
};

export type AgenticChatToolExecutionPortV1 = {
	persistRead(input: AgenticChatToolExecutionPersistInputV1, signal: AbortSignal): Promise<void>;
	persistFailure(input: AgenticChatToolFailurePersistInputV1, signal: AbortSignal): Promise<void>;
	persistMutation(
		input: AgenticChatMutationToolExecutionPersistInputV1,
		signal: AbortSignal
	): Promise<void>;
};

export class AgenticChatToolExecutionRpcError extends Error {
	constructor(
		readonly code: string,
		message: string,
		operation = 'persist_agentic_chat_read_tool_execution'
	) {
		super(`${operation} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatToolExecutionRpcError';
	}
}

export class AgenticChatToolExecutionFenceError extends Error {
	constructor(
		readonly outcome: 'stale_generation' | 'cancel_requested' | 'already_terminal',
		readonly failureClass: 'cancelled' | 'unknown'
	) {
		super(`Agentic Chat read-tool persistence lost its execution fence (${outcome})`);
		this.name = 'AgenticChatToolExecutionFenceError';
	}
}

export class AgenticChatToolExecutionTimeoutError extends Error {
	readonly code = 'tool_execution_persist_timeout';
	readonly failureClass = 'transient_infra' as const;

	constructor(timeoutMs: number) {
		super(`Agentic Chat tool-execution ledger exceeded its ${timeoutMs}ms deadline`);
		this.name = 'AgenticChatToolExecutionTimeoutError';
	}
}

export class SupabaseAgenticChatToolExecutionAdapter implements AgenticChatToolExecutionPortV1 {
	private readonly timeoutMs: number;

	constructor(
		private readonly client: AgenticChatToolExecutionRpcClient,
		options: { timeoutMs?: number } = {}
	) {
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_TOOL_LEDGER_TIMEOUT_MS;
	}

	async persistRead(
		input: AgenticChatToolExecutionPersistInputV1,
		signal: AbortSignal = new AbortController().signal
	): Promise<void> {
		validateInput(input);
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () => new AgenticChatToolExecutionTimeoutError(this.timeoutMs),
			run: (deadlineSignal) => {
				const request = this.client.rpc('persist_agentic_chat_read_tool_execution', {
					...agenticChatGenerationWriteFenceArgsV1(input),
					p_user_id: input.userId,
					p_tool_execution_id: input.toolExecutionId,
					p_sequence_index: input.sequenceIndex,
					p_provider_tool_call_id: input.providerToolCallId,
					p_tool_name: input.toolName,
					p_tool_category: input.execution.toolCategory,
					p_arguments: input.arguments,
					p_result: input.execution.result,
					p_result_count: input.execution.resultCount,
					p_zero_result: input.execution.zeroResult,
					p_execution_time_ms: input.execution.executionTimeMs,
					p_tokens_consumed: input.execution.tokensConsumed,
					p_requires_user_action: input.execution.requiresUserAction,
					p_affected_entities: input.execution.affectedEntities
				});
				return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
			}
		});
		if (error) throw new AgenticChatToolExecutionRpcError(error.code ?? '', error.message);
		validatePersistReceipt(data, input);
	}

	async persistFailure(
		input: AgenticChatToolFailurePersistInputV1,
		signal: AbortSignal = new AbortController().signal
	): Promise<void> {
		validateFailureInput(input);
		// The historical RPC became the generic failed/no-result tool-attempt
		// ledger. Only actual validation failures use the counted wrapper so
		// operational failures cannot inflate validation telemetry.
		const operation =
			input.failureKind === 'validation'
				? 'persist_agentic_chat_counted_tool_validation_failure'
				: 'persist_agentic_chat_tool_validation_failure';
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () => new AgenticChatToolExecutionTimeoutError(this.timeoutMs),
			run: (deadlineSignal) => {
				const request = this.client.rpc(operation, {
					...agenticChatGenerationWriteFenceArgsV1(input),
					p_user_id: input.userId,
					p_tool_execution_id: input.toolExecutionId,
					p_sequence_index: input.sequenceIndex,
					p_provider_tool_call_id: input.providerToolCallId,
					p_tool_name: input.toolName,
					p_tool_category: input.toolCategory,
					p_arguments: input.arguments,
					p_error_message: input.error
				});
				return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
			}
		});
		if (error) {
			throw new AgenticChatToolExecutionRpcError(error.code ?? '', error.message, operation);
		}
		validatePersistReceipt(data, input);
	}

	async persistMutation(
		input: AgenticChatMutationToolExecutionPersistInputV1,
		signal: AbortSignal = new AbortController().signal
	): Promise<void> {
		validateMutationInput(input);
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () => new AgenticChatToolExecutionTimeoutError(this.timeoutMs),
			run: (deadlineSignal) => {
				const request = this.client.rpc('persist_agentic_chat_mutation_tool_execution', {
					...agenticChatGenerationWriteFenceArgsV1(input),
					p_user_id: input.userId,
					p_effect_id: input.effectId,
					p_canonical_argument_hash: input.canonicalArgumentHash,
					p_tool_execution_id: input.toolExecutionId,
					p_sequence_index: input.sequenceIndex,
					p_provider_tool_call_id: input.providerToolCallId,
					p_tool_name: input.toolName,
					p_operation_name: input.operationName,
					p_arguments: input.arguments,
					p_execution_time_ms: input.executionTimeMs,
					p_tokens_consumed: input.tokensConsumed,
					p_requires_user_action: input.requiresUserAction,
					p_affected_entities: input.affectedEntities
				});
				return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
			}
		});
		if (error) {
			throw new AgenticChatToolExecutionRpcError(
				error.code ?? '',
				error.message,
				'persist_agentic_chat_mutation_tool_execution'
			);
		}
		validatePersistReceipt(data, input, input.effectId);
	}
}

export function createStableAgenticChatToolExecutionIdV1(input: {
	turnRunId: string;
	sequenceIndex: number;
}): string {
	canonicalUuid(input.turnRunId, 'turnRunId');
	positiveInteger(input.sequenceIndex, 'sequenceIndex');
	const bytes = createHash('sha256')
		.update(`${IDENTITY_VERSION}:${input.turnRunId}:${input.sequenceIndex}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateInput(input: AgenticChatToolExecutionPersistInputV1): void {
	validateCommonInput(input);
	if (input.execution.toolCategory !== null) {
		canonicalText(input.execution.toolCategory, 128, 'toolCategory');
	}
	canonicalizeAgenticChatJson(input.execution.result as unknown as JsonValue);
	canonicalizeAgenticChatJson(input.execution.affectedEntities as unknown as JsonValue);
	if (
		input.execution.affectedEntities.some(
			(entity) => !entity || typeof entity !== 'object' || Array.isArray(entity)
		)
	) {
		throw protocolError('affectedEntities is invalid');
	}
	for (const [label, value] of [
		['executionTimeMs', input.execution.executionTimeMs],
		['tokensConsumed', input.execution.tokensConsumed],
		['resultCount', input.execution.resultCount]
	] as const) {
		if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
			throw protocolError(`${label} is invalid`);
		}
	}
	if (input.execution.zeroResult !== null && typeof input.execution.zeroResult !== 'boolean') {
		throw protocolError('zeroResult is invalid');
	}
	if (
		(input.execution.resultCount === null) !== (input.execution.zeroResult === null) ||
		(input.execution.resultCount !== null &&
			input.execution.zeroResult !== (input.execution.resultCount === 0))
	) {
		throw protocolError('resultCount and zeroResult are inconsistent');
	}
	if (
		input.execution.requiresUserAction !== null &&
		typeof input.execution.requiresUserAction !== 'boolean'
	) {
		throw protocolError('requiresUserAction is invalid');
	}
}

function validateFailureInput(input: AgenticChatToolFailurePersistInputV1): void {
	validateCommonInput(input);
	if (
		input.failureKind !== 'validation' &&
		input.failureKind !== 'mutation' &&
		input.failureKind !== 'supervisor_block' &&
		input.failureKind !== 'dependency_failed'
	) {
		throw protocolError('failureKind is invalid');
	}
	if (input.toolCategory !== null) canonicalText(input.toolCategory, 128, 'toolCategory');
	canonicalText(input.error, 4_000, 'error');
}

function validateMutationInput(input: AgenticChatMutationToolExecutionPersistInputV1): void {
	validateCommonInput(input);
	canonicalUuid(input.effectId, 'effectId');
	if (!SHA256_PATTERN.test(input.canonicalArgumentHash)) {
		throw protocolError('canonicalArgumentHash is invalid');
	}
	canonicalText(input.operationName, 256, 'operationName');
	canonicalizeAgenticChatJson(input.affectedEntities as unknown as JsonValue);
	if (
		input.affectedEntities.some(
			(entity) => !entity || typeof entity !== 'object' || Array.isArray(entity)
		)
	) {
		throw protocolError('affectedEntities is invalid');
	}
	for (const [label, value] of [
		['executionTimeMs', input.executionTimeMs],
		['tokensConsumed', input.tokensConsumed]
	] as const) {
		if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
			throw protocolError(`${label} is invalid`);
		}
	}
	if (input.requiresUserAction !== null && typeof input.requiresUserAction !== 'boolean') {
		throw protocolError('requiresUserAction is invalid');
	}
}

function validateCommonInput(
	input: Omit<AgenticChatToolExecutionPersistInputV1, 'execution'>
): void {
	for (const [label, value] of [
		['turnRunId', input.turnRunId],
		['userId', input.userId],
		['queueJobId', input.queueJobId],
		['processingToken', input.processingToken],
		['toolExecutionId', input.toolExecutionId]
	] as const) {
		canonicalUuid(value, label);
	}
	positiveInteger(input.executionGeneration, 'executionGeneration');
	positiveInteger(input.sequenceIndex, 'sequenceIndex');
	if (
		input.toolExecutionId !==
		createStableAgenticChatToolExecutionIdV1({
			turnRunId: input.turnRunId,
			sequenceIndex: input.sequenceIndex
		})
	) {
		throw protocolError('tool-execution id is not the stable turn sequence identity');
	}
	canonicalText(input.providerToolCallId, 512, 'providerToolCallId');
	canonicalText(input.toolName, 256, 'toolName');
	canonicalizeAgenticChatJson(input.arguments as unknown as JsonValue);
}

function validatePersistReceipt(
	data: unknown,
	input: Omit<AgenticChatToolExecutionPersistInputV1, 'execution'>,
	expectedEffectId?: string
): void {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw protocolError('RPC returned no receipt');
	}
	const receipt = data as Record<string, unknown>;
	if (
		receipt.turn_run_id !== input.turnRunId ||
		receipt.queue_job_id !== input.queueJobId ||
		receipt.user_id !== input.userId ||
		receipt.session_id === undefined ||
		!canonicalUuidValue(receipt.session_id) ||
		!Number.isSafeInteger(receipt.execution_generation) ||
		(receipt.execution_generation as number) < 1
	) {
		throw protocolError('receipt scope is inconsistent');
	}
	if (receipt.outcome === 'persisted' || receipt.outcome === 'already_persisted') {
		if (
			receipt.execution_generation !== input.executionGeneration ||
			receipt.tool_execution_id !== input.toolExecutionId ||
			receipt.sequence_index !== input.sequenceIndex ||
			receipt.provider_tool_call_id !== input.providerToolCallId ||
			receipt.tool_name !== input.toolName ||
			(expectedEffectId !== undefined && receipt.effect_id !== expectedEffectId) ||
			receipt.message_id !== null ||
			!isTimestamp(receipt.created_at)
		) {
			throw protocolError('persisted receipt is inconsistent');
		}
		return;
	}
	if (
		receipt.outcome === 'stale_generation' ||
		receipt.outcome === 'cancel_requested' ||
		receipt.outcome === 'already_terminal'
	) {
		throw new AgenticChatToolExecutionFenceError(
			receipt.outcome,
			receipt.outcome === 'cancel_requested' ? 'cancelled' : 'unknown'
		);
	}
	throw protocolError('receipt outcome is invalid');
}

function canonicalUuid(value: string, label: string): void {
	if (!UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw protocolError(`${label} must be a canonical UUID`);
	}
}

function canonicalUuidValue(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase();
}

function positiveInteger(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value < 1) throw protocolError(`${label} is invalid`);
}

function canonicalText(value: string, maxLength: number, label: string): void {
	const normalized = normalizeAgenticChatText(value);
	if (!normalized || normalized !== value || value.length > maxLength) {
		throw protocolError(`${label} is invalid`);
	}
}

function isTimestamp(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		DATABASE_TIMESTAMP_PATTERN.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

function protocolError(message: string): Error {
	return new Error(`Invalid Agentic Chat tool-execution contract: ${message}`);
}
