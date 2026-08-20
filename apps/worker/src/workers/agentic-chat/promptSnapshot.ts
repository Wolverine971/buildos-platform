// apps/worker/src/workers/agentic-chat/promptSnapshot.ts
import { createHash } from 'node:crypto';
import { type JsonValue, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from './executionControl';
import {
	AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	type AgenticChatPreparedPromptSnapshotV1
} from './providerContract';
import { agenticChatGenerationWriteFenceArgsV1 } from './writeFence';

const PROMPT_SNAPSHOT_IDENTITY_VERSION = 'agentic_chat_prompt_snapshot_identity_v1';
const MAX_MODEL_MESSAGES_BYTES = 2 * 1024 * 1024;
const MAX_TOOL_DEFINITIONS_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export type AgenticChatPromptSnapshotRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatPromptSnapshotPersistInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	executionGeneration: number;
	promptSnapshotId: string;
	prompt: AgenticChatPreparedPromptSnapshotV1;
};

export type AgenticChatPromptSnapshotPersistResultV1 = {
	outcome:
		| 'persisted'
		| 'already_persisted'
		| 'stale_generation'
		| 'cancel_requested'
		| 'already_terminal';
	snapshotAvailable: boolean;
	promptSnapshotId: string | null;
};

export type AgenticChatPromptSnapshotPortV1 = {
	persist(
		input: AgenticChatPromptSnapshotPersistInputV1
	): Promise<AgenticChatPromptSnapshotPersistResultV1>;
};

export class AgenticChatPromptSnapshotRpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(`persist_agentic_chat_prompt_snapshot failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatPromptSnapshotRpcError';
	}
}

export class AgenticChatPromptSnapshotProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat prompt-snapshot receipt: ${message}`);
		this.name = 'AgenticChatPromptSnapshotProtocolError';
	}
}

export class SupabaseAgenticChatPromptSnapshotAdapter implements AgenticChatPromptSnapshotPortV1 {
	constructor(private readonly client: AgenticChatPromptSnapshotRpcClient) {}

	async persist(
		input: AgenticChatPromptSnapshotPersistInputV1
	): Promise<AgenticChatPromptSnapshotPersistResultV1> {
		validateInput(input);
		const { data, error } = await this.client.rpc('persist_agentic_chat_prompt_snapshot_v3', {
			...agenticChatGenerationWriteFenceArgsV1(input),
			p_user_id: input.userId,
			p_prompt_snapshot_id: input.promptSnapshotId,
			p_model_messages: input.prompt.modelMessages,
			p_tool_definitions: input.prompt.toolDefinitions,
			p_system_prompt_sha256: input.prompt.systemPromptSha256,
			p_messages_sha256: input.prompt.messagesSha256,
			p_tools_sha256: input.prompt.toolsSha256,
			p_system_prompt_chars: input.prompt.systemPromptChars,
			p_message_chars: input.prompt.messageChars,
			p_approx_prompt_tokens: input.prompt.approxPromptTokens
		});
		if (error) throw new AgenticChatPromptSnapshotRpcError(error.code ?? '', error.message);
		if (data === null || data === undefined) throw protocolError('RPC returned no receipt');
		return parseReceipt(data, input);
	}
}

export function createStableAgenticChatPromptSnapshotIdV1(turnRunId: string): string {
	canonicalUuid(turnRunId, 'turnRunId');
	const bytes = createHash('sha256')
		.update(`${PROMPT_SNAPSHOT_IDENTITY_VERSION}:${turnRunId}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateInput(input: AgenticChatPromptSnapshotPersistInputV1): void {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.userId, 'userId');
	canonicalUuid(input.queueJobId, 'queueJobId');
	canonicalUuid(input.processingToken, 'processingToken');
	canonicalUuid(input.promptSnapshotId, 'promptSnapshotId');
	if (input.promptSnapshotId !== createStableAgenticChatPromptSnapshotIdV1(input.turnRunId)) {
		throw protocolError('snapshot id is not the stable turn identity');
	}
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw protocolError('execution generation is invalid');
	}
	if (input.prompt.snapshotVersion !== AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION) {
		throw protocolError('snapshot version is invalid');
	}
	if (!SHA256_PATTERN.test(input.prompt.systemPromptSha256)) {
		throw protocolError('system-prompt hash is invalid');
	}
	if (!SHA256_PATTERN.test(input.prompt.messagesSha256)) {
		throw protocolError('messages hash is invalid');
	}
	if (!SHA256_PATTERN.test(input.prompt.toolsSha256)) {
		throw protocolError('tools hash is invalid');
	}
	if (!Array.isArray(input.prompt.modelMessages) || input.prompt.modelMessages.length < 2) {
		throw protocolError('model messages are invalid');
	}
	if (
		input.prompt.modelMessages.some(
			(message) =>
				message === null ||
				typeof message !== 'object' ||
				Array.isArray(message) ||
				typeof message.role !== 'string' ||
				typeof message.content !== 'string'
		) ||
		input.prompt.modelMessages[0]?.role !== 'system' ||
		input.prompt.modelMessages.at(-1)?.role !== 'user'
	) {
		throw protocolError('model-message roles or content are invalid');
	}
	const canonical = canonicalizeAgenticChatJson(
		input.prompt.modelMessages as unknown as JsonValue
	);
	if (Buffer.byteLength(canonical, 'utf8') > MAX_MODEL_MESSAGES_BYTES) {
		throw protocolError('model messages exceed the snapshot bound');
	}
	const systemPrompt = input.prompt.modelMessages[0]?.content;
	if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
		throw protocolError('model messages have no system prompt');
	}
	if (sha256(systemPrompt) !== input.prompt.systemPromptSha256) {
		throw protocolError('system-prompt hash does not match the prepared prompt');
	}
	if (sha256(canonical) !== input.prompt.messagesSha256) {
		throw protocolError('messages hash does not match the prepared prompt');
	}
	if (!Array.isArray(input.prompt.toolDefinitions)) {
		throw protocolError('tool definitions are invalid');
	}
	const toolNames = new Set<string>();
	for (const definition of input.prompt.toolDefinitions) {
		if (
			definition === null ||
			typeof definition !== 'object' ||
			Array.isArray(definition) ||
			definition.type !== 'function' ||
			definition.function === null ||
			typeof definition.function !== 'object' ||
			Array.isArray(definition.function)
		) {
			throw protocolError('tool definition shape is invalid');
		}
		const fn = definition.function as Record<string, unknown>;
		if (
			typeof fn.name !== 'string' ||
			fn.name.length === 0 ||
			fn.name.length > 256 ||
			fn.name !== fn.name.trim() ||
			typeof fn.description !== 'string' ||
			fn.description.trim().length === 0 ||
			fn.parameters === null ||
			typeof fn.parameters !== 'object' ||
			Array.isArray(fn.parameters) ||
			(fn.parameters as Record<string, unknown>).type !== 'object'
		) {
			throw protocolError('tool definition shape is invalid');
		}
		if (toolNames.has(fn.name)) {
			throw protocolError('tool definition names are duplicated');
		}
		toolNames.add(fn.name);
	}
	const canonicalTools = canonicalizeAgenticChatJson(
		input.prompt.toolDefinitions as unknown as JsonValue
	);
	if (Buffer.byteLength(canonicalTools, 'utf8') > MAX_TOOL_DEFINITIONS_BYTES) {
		throw protocolError('tool definitions exceed the snapshot bound');
	}
	if (sha256(canonicalTools) !== input.prompt.toolsSha256) {
		throw protocolError('tools hash does not match the prepared prompt');
	}
	const messageChars = input.prompt.modelMessages.reduce(
		(total, message) =>
			total + (typeof message.content === 'string' ? message.content.length : 0),
		0
	);
	const approxPromptTokens = input.prompt.modelMessages.reduce(
		(total, message) =>
			total +
			(typeof message.content === 'string' ? Math.ceil(message.content.length / 4) : 0),
		0
	);
	if (
		input.prompt.systemPromptChars !== systemPrompt.length ||
		input.prompt.messageChars !== messageChars ||
		input.prompt.approxPromptTokens !== approxPromptTokens
	) {
		throw protocolError('prompt size evidence does not match the prepared prompt');
	}
}

function parseReceipt(
	value: unknown,
	expected: AgenticChatPromptSnapshotPersistInputV1
): AgenticChatPromptSnapshotPersistResultV1 {
	const receipt = requireRecord(value);
	if (
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.queue_job_id !== expected.queueJobId ||
		receipt.user_id !== expected.userId ||
		!canonicalUuidValue(receipt.session_id) ||
		!Number.isSafeInteger(receipt.execution_generation) ||
		(receipt.execution_generation as number) < 1 ||
		typeof receipt.snapshot_available !== 'boolean'
	) {
		throw protocolError('scope or availability is inconsistent');
	}

	if (receipt.outcome === 'persisted' || receipt.outcome === 'already_persisted') {
		if (
			receipt.snapshot_available !== true ||
			receipt.execution_generation !== expected.executionGeneration ||
			receipt.prompt_snapshot_id !== expected.promptSnapshotId ||
			receipt.snapshot_version !== AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION ||
			receipt.system_prompt_sha256 !== expected.prompt.systemPromptSha256 ||
			receipt.messages_sha256 !== expected.prompt.messagesSha256 ||
			receipt.tools_sha256 !== expected.prompt.toolsSha256 ||
			receipt.tool_definition_count !== expected.prompt.toolDefinitions.length ||
			!canonicalText(receipt.prompt_variant, 128) ||
			receipt.system_prompt_chars !== expected.prompt.systemPromptChars ||
			receipt.message_chars !== expected.prompt.messageChars ||
			receipt.approx_prompt_tokens !== expected.prompt.approxPromptTokens ||
			!isTimestamp(receipt.created_at)
		) {
			throw protocolError('persisted snapshot receipt is inconsistent');
		}
		return {
			outcome: receipt.outcome,
			snapshotAvailable: true,
			promptSnapshotId: expected.promptSnapshotId
		};
	}

	if (receipt.outcome === 'stale_generation') {
		if (
			receipt.snapshot_available !== false ||
			receipt.requested_execution_generation !== expected.executionGeneration ||
			receipt.execution_generation === expected.executionGeneration
		) {
			throw protocolError('stale-generation receipt is inconsistent');
		}
		return {
			outcome: 'stale_generation',
			snapshotAvailable: false,
			promptSnapshotId: null
		};
	}

	if (receipt.outcome === 'cancel_requested' || receipt.outcome === 'already_terminal') {
		if (
			receipt.snapshot_available !== false ||
			receipt.execution_generation !== expected.executionGeneration ||
			(receipt.outcome === 'cancel_requested'
				? receipt.status !== 'running'
				: !['completed', 'failed', 'cancelled'].includes(String(receipt.status)))
		) {
			throw protocolError('non-persisted snapshot receipt is inconsistent');
		}
		return {
			outcome: receipt.outcome,
			snapshotAvailable: false,
			promptSnapshotId: null
		};
	}

	throw protocolError('outcome is invalid');
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError('receipt is not an object');
	}
	return value as Record<string, unknown>;
}

function canonicalUuid(value: string, label: string): void {
	if (!canonicalUuidValue(value)) throw protocolError(`${label} is invalid`);
}

function canonicalUuidValue(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function isTimestamp(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		DATABASE_TIMESTAMP_PATTERN.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function protocolError(message: string): AgenticChatPromptSnapshotProtocolError {
	return new AgenticChatPromptSnapshotProtocolError(message);
}
