import {
	AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentStreamEventV1,
	type ChatTurnStatusV1,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export type AgenticChatRecoverySnapshotRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatDurableRecoverySnapshotV1 = {
	turnRunId: string;
	sessionId: string;
	userId: string;
	streamRunId: string;
	clientTurnId: string;
	executionGeneration: number;
	status: ChatTurnStatusV1;
	assistantText: string;
	projection: JsonObject;
	durableSequence: number;
};

export type AgenticChatRecoverySnapshotPortV1 = {
	load(input: {
		turnRunId: string;
		userId: string;
		executionGeneration: number;
	}): Promise<AgenticChatDurableRecoverySnapshotV1>;
};

export class AgenticChatRecoverySnapshotRpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(`reconcile_agentic_chat_turn failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatRecoverySnapshotRpcError';
	}
}

export class AgenticChatRecoverySnapshotProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat durable recovery snapshot: ${message}`);
		this.name = 'AgenticChatRecoverySnapshotProtocolError';
	}
}

/** Loads one complete, locked generation snapshot for process-interruption recovery. */
export class SupabaseAgenticChatRecoverySnapshotAdapter
	implements AgenticChatRecoverySnapshotPortV1
{
	constructor(private readonly client: AgenticChatRecoverySnapshotRpcClient) {}

	async load(input: {
		turnRunId: string;
		userId: string;
		executionGeneration: number;
	}): Promise<AgenticChatDurableRecoverySnapshotV1> {
		canonicalUuid(input.turnRunId, 'turnRunId');
		canonicalUuid(input.userId, 'userId');
		positiveInteger(input.executionGeneration, 'executionGeneration');
		const { data, error } = await this.client.rpc('reconcile_agentic_chat_turn', {
			p_turn_run_id: input.turnRunId,
			p_user_id: input.userId,
			p_requested_execution_generation: input.executionGeneration,
			p_after_durable_sequence: 0
		});
		if (error) {
			throw new AgenticChatRecoverySnapshotRpcError(error.code ?? '', error.message);
		}
		return parseSnapshot(data, input);
	}
}

function parseSnapshot(
	value: unknown,
	expected: { turnRunId: string; userId: string; executionGeneration: number }
): AgenticChatDurableRecoverySnapshotV1 {
	const receipt = requireRecord(value, 'receipt');
	if (
		receipt.outcome !== 'reconciled' ||
		receipt.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		receipt.execution_mode !== 'worker_realtime' ||
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.user_id !== expected.userId ||
		receipt.requested_execution_generation !== expected.executionGeneration ||
		receipt.generation_changed !== false ||
		receipt.execution_generation !== expected.executionGeneration ||
		!canonicalUuidValue(receipt.session_id) ||
		!canonicalText(receipt.stream_run_id, 512) ||
		!canonicalText(receipt.client_turn_id, 512) ||
		!isTurnStatus(receipt.status)
	) {
		throw protocolError('snapshot scope, generation, or status is invalid');
	}

	const snapshotSequence = nonnegativeInteger(receipt.snapshot_sequence, 'snapshot sequence');
	const durableSequence = nonnegativeInteger(
		receipt.durable_through_sequence,
		'durable sequence'
	);
	const projectionSequence = nonnegativeInteger(
		receipt.projection_durable_sequence,
		'projection sequence'
	);
	const responseWatermark = nonnegativeInteger(receipt.response_watermark, 'response watermark');
	if (
		projectionSequence > durableSequence ||
		durableSequence > snapshotSequence ||
		responseWatermark !== durableSequence
	) {
		throw protocolError('snapshot cursor invariant failed');
	}
	if (
		typeof receipt.text !== 'string' ||
		Buffer.byteLength(receipt.text, 'utf8') > MAX_ASSISTANT_TEXT_BYTES ||
		!isJsonObject(receipt.projection) ||
		Buffer.byteLength(canonicalizeAgenticChatJson(receipt.projection), 'utf8') >
			MAX_PROJECTION_BYTES ||
		typeof receipt.reconcile_required !== 'boolean' ||
		!isTimestamp(receipt.updated_at)
	) {
		throw protocolError('snapshot content is invalid');
	}

	if (
		!Array.isArray(receipt.durable_events) ||
		receipt.durable_events.length > AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS
	) {
		throw protocolError('durable event window is invalid');
	}
	let previousSequence = projectionSequence;
	for (const event of receipt.durable_events) {
		previousSequence = validateDurableEvent(event, {
			turnRunId: expected.turnRunId,
			sessionId: receipt.session_id,
			streamRunId: receipt.stream_run_id,
			clientTurnId: receipt.client_turn_id,
			executionGeneration: expected.executionGeneration,
			previousSequence,
			durableSequence
		});
	}
	if (previousSequence !== durableSequence) {
		throw protocolError('durable event window is incomplete');
	}

	validateTerminalShape(
		receipt,
		expected.executionGeneration,
		projectionSequence,
		durableSequence
	);
	return {
		turnRunId: expected.turnRunId,
		sessionId: receipt.session_id,
		userId: expected.userId,
		streamRunId: receipt.stream_run_id,
		clientTurnId: receipt.client_turn_id,
		executionGeneration: expected.executionGeneration,
		status: receipt.status,
		assistantText: receipt.text,
		projection: receipt.projection,
		durableSequence
	};
}

function validateDurableEvent(
	value: unknown,
	expected: {
		turnRunId: string;
		sessionId: string;
		streamRunId: string;
		clientTurnId: string;
		executionGeneration: number;
		previousSequence: number;
		durableSequence: number;
	}
): number {
	const event = requireRecord(value, 'durable event');
	const sequence = nonnegativeInteger(event.sequence_index, 'event sequence');
	if (
		event.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		event.turn_run_id !== expected.turnRunId ||
		event.session_id !== expected.sessionId ||
		event.stream_run_id !== expected.streamRunId ||
		event.client_turn_id !== expected.clientTurnId ||
		event.execution_generation !== expected.executionGeneration ||
		event.durable !== true ||
		sequence !== expected.previousSequence + 1 ||
		sequence > expected.durableSequence ||
		event.event_id !==
			createAgentStreamEventIdV1(
				expected.turnRunId,
				expected.executionGeneration,
				sequence
			) ||
		!isEventPhase(event.phase) ||
		!canonicalText(event.event_type, 256) ||
		event.type !== event.event_type
	) {
		throw protocolError('durable event scope, sequence, or identity is invalid');
	}
	return sequence;
}

function validateTerminalShape(
	receipt: Record<string, unknown>,
	generation: number,
	projectionSequence: number,
	durableSequence: number
): void {
	const terminal = isTerminalStatus(receipt.status);
	if (
		!nullableCanonicalText(receipt.terminal_event_id, 256) ||
		!nullableTimestamp(receipt.terminalized_at) ||
		!nullableCanonicalText(receipt.finished_reason, 256) ||
		!nullableCanonicalText(receipt.failure_code, 128) ||
		terminal !== (receipt.terminal_event_id !== null) ||
		terminal !== (receipt.terminalized_at !== null)
	) {
		throw protocolError('terminal receipt shape is invalid');
	}
	if (terminal && projectionSequence !== durableSequence) {
		throw protocolError('terminal projection is not complete through its done event');
	}
	if (
		terminal &&
		receipt.terminal_event_id !==
			createAgentStreamEventIdV1(
				receipt.turn_run_id as string,
				generation,
				receipt.response_watermark as number
			)
	) {
		throw protocolError('terminal event identity is invalid');
	}
	if (terminal) {
		if (
			!isAssistantMessage(
				receipt.assistant_message,
				receipt.turn_run_id,
				generation,
				receipt.text
			)
		) {
			if (receipt.status === 'completed' || receipt.assistant_message !== null) {
				throw protocolError('terminal assistant message is invalid');
			}
		}
	} else if (receipt.assistant_message !== null) {
		throw protocolError('nonterminal snapshot carried an assistant message');
	}
}

function isAssistantMessage(
	value: unknown,
	turnRunId: unknown,
	generation: number,
	assistantText: unknown
): boolean {
	if (value === null) return false;
	const message = requireRecord(value, 'assistant message');
	return (
		canonicalUuidValue(message.id) &&
		message.role === 'assistant' &&
		message.content === assistantText &&
		isJsonObject(message.metadata) &&
		message.metadata.turn_run_id === turnRunId &&
		message.metadata.execution_generation === generation &&
		nullableNonnegativeInteger(message.prompt_tokens) &&
		nullableNonnegativeInteger(message.completion_tokens) &&
		nullableNonnegativeInteger(message.total_tokens) &&
		nullableTimestamp(message.created_at)
	);
}

function isJsonObject(value: unknown): value is JsonObject {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	try {
		canonicalizeAgenticChatJson(value as JsonValue);
		return true;
	} catch {
		return false;
	}
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (!canonicalUuidValue(value)) throw protocolError(`${label} is not a canonical UUID`);
}

function canonicalUuidValue(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase();
}

function positiveInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 1) {
		throw protocolError(`${label} must be positive`);
	}
}

function nonnegativeInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw protocolError(`${label} must be nonnegative`);
	}
	return value as number;
}

function nullableNonnegativeInteger(value: unknown): boolean {
	return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function nullableCanonicalText(value: unknown, maximum: number): boolean {
	return value === null || canonicalText(value, maximum);
}

function isTimestamp(value: unknown): value is string {
	return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): boolean {
	return value === null || isTimestamp(value);
}

function isTurnStatus(value: unknown): value is ChatTurnStatusV1 {
	return (
		value === 'queued' ||
		value === 'running' ||
		value === 'completed' ||
		value === 'failed' ||
		value === 'cancelled'
	);
}

function isTerminalStatus(value: unknown): boolean {
	return value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isEventPhase(value: unknown): value is AgentStreamEventV1['phase'] {
	return (
		value === 'prompt' ||
		value === 'llm' ||
		value === 'tool' ||
		value === 'stream' ||
		value === 'finalize'
	);
}

function protocolError(message: string): AgenticChatRecoverySnapshotProtocolError {
	return new AgenticChatRecoverySnapshotProtocolError(message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_ASSISTANT_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PROJECTION_BYTES = 512 * 1024;
