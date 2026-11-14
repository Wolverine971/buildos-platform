// apps/worker/src/workers/agentic-chat/effects/prompt-snapshot.ts
import { type JsonValue, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { sha256Hex, stableUuidFromSeed } from '../shared/identity-hash';
import type { AgenticChatExecutionIdentityV1 } from '../turn/execution-control';
import {
	AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	type AgenticChatContextInjectionRecordV1,
	type AgenticChatPreparedPromptSnapshotV1
} from '../provider/contracts';
import { agenticChatGenerationWriteFenceArgsV1 } from '../turn/write-fence';

const PROMPT_SNAPSHOT_IDENTITY_VERSION = 'agentic_chat_prompt_snapshot_identity_v1';
const MAX_MODEL_MESSAGES_BYTES = 2 * 1024 * 1024;
const MAX_TOOL_DEFINITIONS_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
/**
 * The snapshot write runs detached from the step loop. A 100 KB row lands in
 * well under a second; anything past this is a hung RPC and is cancelled so it
 * cannot outlive the turn. The stable snapshot id keeps a late retry idempotent.
 */
export const AGENTIC_CHAT_PROMPT_SNAPSHOT_TIMEOUT_MS = 15_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

/** A filtered read or write of `chat_prompt_snapshots` rows (the Supabase query builder). */
type SnapshotTableQuery<Row> = PromiseLike<{ data: Row[] | null; error: RpcError | null }> & {
	eq(column: string, value: string): SnapshotTableQuery<Row>;
	select(columns: string): SnapshotTableQuery<Row>;
	abortSignal?(signal: AbortSignal): SnapshotTableQuery<Row>;
};
type SnapshotTable = {
	select(columns: string): SnapshotTableQuery<{ id: string; prompt_sections: unknown }>;
	update(values: Record<string, unknown>): SnapshotTableQuery<{ id: string }>;
};

export type AgenticChatPromptSnapshotRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
	/** Service-role table access for the context-injection record; absent in RPC-only fixtures. */
	from?(table: 'chat_prompt_snapshots'): SnapshotTable;
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

/** Key under `chat_prompt_snapshots.prompt_sections` that holds the finder's injection. */
export const AGENTIC_CHAT_CONTEXT_INJECTION_SECTION = 'context_injection' as const;
/** Far above any real injection (carry 10k + snapshot + cards); past it only the hash is kept. */
const MAX_CONTEXT_INJECTION_CHARS = 200_000;

export type AgenticChatContextInjectionPersistInputV1 = {
	turnRunId: string;
	userId: string;
	executionGeneration: number;
	promptSnapshotId: string;
	record: AgenticChatContextInjectionRecordV1;
};

export type AgenticChatContextInjectionPersistResultV1 = {
	/** `snapshot_missing`: the turn has no snapshot row (not persisted, or already cleaned up). */
	outcome: 'recorded' | 'snapshot_missing' | 'unsupported';
};

export type AgenticChatPromptSnapshotPortV1 = {
	persist(
		input: AgenticChatPromptSnapshotPersistInputV1,
		/** Deadline from the executor's detached write; a hung RPC is cancelled through it. */
		signal?: AbortSignal
	): Promise<AgenticChatPromptSnapshotPersistResultV1>;
	/**
	 * File what the context finder added to the opening request on the turn's snapshot row.
	 * Call it after `persist` has settled: the row must exist.
	 */
	recordContextInjection?(
		input: AgenticChatContextInjectionPersistInputV1,
		signal?: AbortSignal
	): Promise<AgenticChatContextInjectionPersistResultV1>;
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
		input: AgenticChatPromptSnapshotPersistInputV1,
		signal?: AbortSignal
	): Promise<AgenticChatPromptSnapshotPersistResultV1> {
		validateInput(input);
		const request = this.client.rpc('persist_agentic_chat_prompt_snapshot_v3', {
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
		const { data, error } = await (signal && request.abortSignal
			? request.abortSignal(signal)
			: request);
		if (error) throw new AgenticChatPromptSnapshotRpcError(error.code ?? '', error.message);
		if (data === null || data === undefined) throw protocolError('RPC returned no receipt');
		return parseReceipt(data, input);
	}

	/**
	 * The snapshot RPC accepts only the prepared prompt (its fences reject a system message
	 * after the user's), so the finder's text is merged into `prompt_sections` on the same row.
	 * Nothing else writes the row once it exists, which makes the read-then-write safe.
	 */
	async recordContextInjection(
		input: AgenticChatContextInjectionPersistInputV1,
		signal?: AbortSignal
	): Promise<AgenticChatContextInjectionPersistResultV1> {
		canonicalUuid(input.turnRunId, 'turnRunId');
		canonicalUuid(input.userId, 'userId');
		canonicalUuid(input.promptSnapshotId, 'promptSnapshotId');
		if (input.promptSnapshotId !== createStableAgenticChatPromptSnapshotIdV1(input.turnRunId)) {
			throw protocolError('snapshot id is not the stable turn identity');
		}
		if (!this.client.from) return { outcome: 'unsupported' };
		const scoped = <Row>(query: SnapshotTableQuery<Row>) => {
			const filtered = query
				.eq('id', input.promptSnapshotId)
				.eq('turn_run_id', input.turnRunId)
				.eq('user_id', input.userId);
			return signal && filtered.abortSignal ? filtered.abortSignal(signal) : filtered;
		};
		const read = await scoped(
			this.client.from('chat_prompt_snapshots').select('id, prompt_sections')
		);
		if (read.error) {
			throw new AgenticChatPromptSnapshotRpcError(read.error.code ?? '', read.error.message);
		}
		const row = read.data?.[0];
		if (!row) return { outcome: 'snapshot_missing' };
		const sections =
			row.prompt_sections !== null &&
			typeof row.prompt_sections === 'object' &&
			!Array.isArray(row.prompt_sections)
				? (row.prompt_sections as Record<string, unknown>)
				: {};
		const written = await scoped(
			this.client
				.from('chat_prompt_snapshots')
				.update({
					prompt_sections: {
						...sections,
						[AGENTIC_CHAT_CONTEXT_INJECTION_SECTION]: contextInjectionSection(input)
					}
				})
				.select('id')
		);
		if (written.error) {
			throw new AgenticChatPromptSnapshotRpcError(
				written.error.code ?? '',
				written.error.message
			);
		}
		return { outcome: written.data?.length ? 'recorded' : 'snapshot_missing' };
	}
}

/** The stored shape of `prompt_sections.context_injection`. */
export function contextInjectionSection(
	input: Pick<AgenticChatContextInjectionPersistInputV1, 'record' | 'executionGeneration'>
): Record<string, unknown> {
	const { record } = input;
	const oversized = record.text !== null && record.text.length > MAX_CONTEXT_INJECTION_CHARS;
	return {
		version: record.version,
		scope: record.scope,
		injected: record.injected,
		// The exact string the model received; its hash matches the context_selection event.
		text: oversized ? null : record.text,
		...(oversized ? { text_omitted: 'oversized' } : {}),
		chars: record.chars,
		sha256: record.sha256,
		status: record.status,
		failure: record.failure,
		message_index: record.messageIndex,
		tool_pins: record.toolPins,
		opening_tool_names: record.openingToolNames,
		execution_generation: input.executionGeneration,
		recorded_at: new Date().toISOString()
	};
}

export function createStableAgenticChatPromptSnapshotIdV1(turnRunId: string): string {
	canonicalUuid(turnRunId, 'turnRunId');
	return stableUuidFromSeed(`${PROMPT_SNAPSHOT_IDENTITY_VERSION}:${turnRunId}`);
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
	if (sha256Hex(systemPrompt) !== input.prompt.systemPromptSha256) {
		throw protocolError('system-prompt hash does not match the prepared prompt');
	}
	if (sha256Hex(canonical) !== input.prompt.messagesSha256) {
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
	if (sha256Hex(canonicalTools) !== input.prompt.toolsSha256) {
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

function protocolError(message: string): AgenticChatPromptSnapshotProtocolError {
	return new AgenticChatPromptSnapshotProtocolError(message);
}
