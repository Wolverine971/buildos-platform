// apps/web/src/lib/services/agentic-chat-v2/reconciliation.server.ts
import {
	AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgenticChatReconcileRpcResultV1,
	type AgentStreamEventV1,
	type ChatTurnStatusV1,
	type JsonObject
} from '@buildos/shared-types';

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export type AgenticChatReconciliationRpcClient = {
	rpc: (name: string, args: Record<string, unknown>) => RpcResponse;
};

export class AgenticChatReconciliationRpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(`reconcile_agentic_chat_turn failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatReconciliationRpcError';
	}
}

export class AgenticChatReconciliationProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid reconcile_agentic_chat_turn receipt: ${message}`);
		this.name = 'AgenticChatReconciliationProtocolError';
	}
}

export async function reconcileAgenticChatTurn(input: {
	client: AgenticChatReconciliationRpcClient;
	turnRunId: string;
	userId: string;
	requestedExecutionGeneration: number | null;
	afterDurableSequence: number;
}): Promise<AgenticChatReconcileRpcResultV1> {
	const { data, error } = await input.client.rpc('reconcile_agentic_chat_turn', {
		p_turn_run_id: input.turnRunId,
		p_user_id: input.userId,
		p_requested_execution_generation: input.requestedExecutionGeneration,
		p_after_durable_sequence: input.afterDurableSequence
	});

	if (error) {
		throw new AgenticChatReconciliationRpcError(error.code ?? '', error.message);
	}

	return parseReconciliationReceipt(data, input);
}

function parseReconciliationReceipt(
	value: unknown,
	request: {
		turnRunId: string;
		userId: string;
		requestedExecutionGeneration: number | null;
		afterDurableSequence: number;
	}
): AgenticChatReconcileRpcResultV1 {
	const receipt = requireObject(value, 'receipt');
	const outcome = receipt.outcome;

	if (outcome === 'not_found') {
		if (receipt.turn_run_id !== request.turnRunId) fail('not_found turn identity mismatch');
		return receipt as AgenticChatReconcileRpcResultV1;
	}

	if (outcome === 'not_worker_turn') {
		if (
			receipt.turn_run_id !== request.turnRunId ||
			receipt.execution_mode !== 'legacy_sse' ||
			!isChatTurnStatus(receipt.status)
		) {
			fail('not_worker_turn receipt mismatch');
		}
		return receipt as AgenticChatReconcileRpcResultV1;
	}

	if (outcome !== 'reconciled') fail('unknown outcome');
	if (
		receipt.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		receipt.turn_run_id !== request.turnRunId ||
		receipt.user_id !== request.userId ||
		receipt.execution_mode !== 'worker_realtime' ||
		typeof receipt.session_id !== 'string' ||
		typeof receipt.stream_run_id !== 'string' ||
		typeof receipt.client_turn_id !== 'string' ||
		!isChatTurnStatus(receipt.status)
	) {
		fail('snapshot identity or contract mismatch');
	}

	const executionGeneration = requireNonnegativeInteger(
		receipt.execution_generation,
		'execution_generation'
	);
	const snapshotSequence = requireNonnegativeInteger(
		receipt.snapshot_sequence,
		'snapshot_sequence'
	);
	const durableSequence = requireNonnegativeInteger(
		receipt.durable_through_sequence,
		'durable_through_sequence'
	);
	const projectionSequence = requireNonnegativeInteger(
		receipt.projection_durable_sequence,
		'projection_durable_sequence'
	);
	const responseWatermark = requireNonnegativeInteger(
		receipt.response_watermark,
		'response_watermark'
	);
	if (
		projectionSequence > durableSequence ||
		durableSequence > snapshotSequence ||
		responseWatermark !== durableSequence
	) {
		fail('snapshot cursor invariant failed');
	}
	if (
		receipt.requested_execution_generation !== request.requestedExecutionGeneration ||
		typeof receipt.generation_changed !== 'boolean' ||
		receipt.generation_changed !==
			(request.requestedExecutionGeneration !== null &&
				request.requestedExecutionGeneration !== executionGeneration)
	) {
		fail('generation change receipt mismatch');
	}
	if (
		typeof receipt.text !== 'string' ||
		!isJsonObject(receipt.projection) ||
		typeof receipt.reconcile_required !== 'boolean' ||
		typeof receipt.updated_at !== 'string'
	) {
		fail('snapshot content shape is invalid');
	}

	if (!Array.isArray(receipt.durable_events)) fail('durable_events is not an array');
	if (receipt.durable_events.length > AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS) {
		fail('durable event bound exceeded');
	}
	const effectiveCursor = receipt.generation_changed
		? projectionSequence
		: Math.max(request.afterDurableSequence, projectionSequence);
	let previousSequence = effectiveCursor;
	for (const event of receipt.durable_events) {
		validateDurableEvent(event, {
			turnRunId: request.turnRunId,
			sessionId: receipt.session_id as string,
			streamRunId: receipt.stream_run_id as string,
			clientTurnId: receipt.client_turn_id as string,
			executionGeneration,
			previousSequence,
			durableSequence
		});
		previousSequence = (event as Record<string, unknown>).sequence_index as number;
	}
	if (previousSequence !== durableSequence) {
		fail('durable event window is incomplete');
	}

	if (receipt.assistant_message !== null) {
		const message = requireObject(receipt.assistant_message, 'assistant_message');
		if (
			typeof message.id !== 'string' ||
			message.role !== 'assistant' ||
			typeof message.content !== 'string' ||
			!isJsonObject(message.metadata) ||
			message.metadata.turn_run_id !== request.turnRunId ||
			message.metadata.execution_generation !== executionGeneration ||
			!isNullableNonnegativeInteger(message.prompt_tokens) ||
			!isNullableNonnegativeInteger(message.completion_tokens) ||
			!isNullableNonnegativeInteger(message.total_tokens) ||
			!isNullableString(message.created_at)
		) {
			fail('assistant message shape is invalid');
		}
	}

	const terminal =
		receipt.status === 'completed' ||
		receipt.status === 'failed' ||
		receipt.status === 'cancelled';
	if (
		!isNullableString(receipt.terminal_event_id) ||
		!isNullableString(receipt.terminalized_at) ||
		!isNullableString(receipt.finished_reason) ||
		!isNullableString(receipt.failure_code) ||
		terminal !== (typeof receipt.terminal_event_id === 'string') ||
		terminal !== (typeof receipt.terminalized_at === 'string')
	) {
		fail('terminal receipt shape is invalid');
	}
	if (receipt.status === 'completed' && receipt.assistant_message === null) {
		fail('completed snapshot omitted its assistant message');
	}
	if (!terminal && receipt.assistant_message !== null) {
		fail('nonterminal snapshot carried an assistant message');
	}

	return receipt as AgenticChatReconcileRpcResultV1;
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
): asserts value is AgentStreamEventV1 {
	const event = requireObject(value, 'durable event');
	const sequence = requireNonnegativeInteger(event.sequence_index, 'event sequence_index');
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
		!isAgentStreamEventPhase(event.phase) ||
		typeof event.event_type !== 'string' ||
		event.type !== event.event_type
	) {
		fail('durable event scope, order, or identity mismatch');
	}
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		fail(`${label} is not an object`);
	}
	return value as Record<string, unknown>;
}

function requireNonnegativeInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`);
	return value as number;
}

function isNullableNonnegativeInteger(value: unknown): value is number | null {
	return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isAgentStreamEventPhase(value: unknown): value is AgentStreamEventV1['phase'] {
	return (
		value === 'prompt' ||
		value === 'llm' ||
		value === 'tool' ||
		value === 'stream' ||
		value === 'finalize'
	);
}

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isChatTurnStatus(value: unknown): value is ChatTurnStatusV1 {
	return (
		value === 'queued' ||
		value === 'running' ||
		value === 'completed' ||
		value === 'failed' ||
		value === 'cancelled'
	);
}

function fail(message: string): never {
	throw new AgenticChatReconciliationProtocolError(message);
}
