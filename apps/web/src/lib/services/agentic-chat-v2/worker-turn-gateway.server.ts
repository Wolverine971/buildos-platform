// apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.server.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgenticChatWorkerTurnDescriptorV1,
	type CancelTurnResultV1,
	type ChatTurnStatusV1
} from '@buildos/shared-types';

const MAX_ACTIVE_TURNS = 8;

type QueryError = { code?: string; message?: string };
type QueryResult = { data: unknown; error: QueryError | null };

export type AgenticChatWorkerTurnQuery = {
	eq(column: string, value: string): AgenticChatWorkerTurnQuery;
	in(column: string, values: string[]): AgenticChatWorkerTurnQuery;
	order(column: string, options: { ascending: boolean }): AgenticChatWorkerTurnQuery;
	limit(count: number): PromiseLike<QueryResult>;
};

export type AgenticChatWorkerTurnGatewayClient = {
	from(table: 'chat_turn_runs'): {
		select(columns: string): AgenticChatWorkerTurnQuery;
	};
	rpc(
		name: 'request_agentic_chat_turn_cancel',
		args: {
			p_turn_run_id: string;
			p_user_id: string;
			p_reason: 'user_cancelled' | 'superseded';
			p_source: 'browser';
		}
	): PromiseLike<QueryResult>;
};

export type AgenticChatWorkerTurnGatewayErrorCode =
	| 'not_found'
	| 'database_error'
	| 'protocol_error';

export class AgenticChatWorkerTurnGatewayError extends Error {
	constructor(
		readonly code: AgenticChatWorkerTurnGatewayErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatWorkerTurnGatewayError';
	}
}

const TURN_COLUMNS = [
	'id',
	'session_id',
	'stream_run_id',
	'client_turn_id',
	'execution_mode',
	'transport_contract_version',
	'status',
	'execution_generation',
	'last_event_sequence',
	'terminal_event_id',
	'updated_at'
].join(',');

export async function getOwnedAgenticChatWorkerTurn(input: {
	client: AgenticChatWorkerTurnGatewayClient;
	userId: string;
	turnRunId: string;
}): Promise<AgenticChatWorkerTurnDescriptorV1 | null> {
	let query = input.client.from('chat_turn_runs').select(TURN_COLUMNS);
	query = query
		.eq('user_id', input.userId)
		.eq('id', input.turnRunId)
		.eq('execution_mode', 'worker_realtime');
	const rows = await readRows(query.limit(2));
	if (rows.length > 1) throw protocolError('Worker turn lookup was ambiguous');
	return rows.length === 0 ? null : parseDescriptor(rows[0]!);
}

export async function listOwnedActiveAgenticChatWorkerTurns(input: {
	client: AgenticChatWorkerTurnGatewayClient;
	userId: string;
	sessionId: string;
}): Promise<AgenticChatWorkerTurnDescriptorV1[]> {
	let query = input.client.from('chat_turn_runs').select(TURN_COLUMNS);
	query = query
		.eq('user_id', input.userId)
		.eq('session_id', input.sessionId)
		.eq('execution_mode', 'worker_realtime')
		.in('status', ['queued', 'running'])
		.order('updated_at', { ascending: false });
	const rows = await readRows(query.limit(MAX_ACTIVE_TURNS + 1));
	if (rows.length > MAX_ACTIVE_TURNS) {
		throw protocolError('Active worker turn lookup exceeded its bound');
	}
	return rows.map(parseDescriptor);
}

export async function requestOwnedAgenticChatWorkerTurnCancellation(input: {
	client: AgenticChatWorkerTurnGatewayClient;
	userId: string;
	turnRunId: string;
	reason: 'user_cancelled' | 'superseded';
}): Promise<CancelTurnResultV1> {
	const { data, error } = await input.client.rpc('request_agentic_chat_turn_cancel', {
		p_turn_run_id: input.turnRunId,
		p_user_id: input.userId,
		p_reason: input.reason,
		p_source: 'browser'
	});
	if (error) {
		if (
			error.message?.includes('agentic_chat_cancel_turn_not_found') ||
			error.message?.includes('agentic_chat_cancel_turn_relationship_mismatch')
		) {
			throw new AgenticChatWorkerTurnGatewayError('not_found', 'Worker turn was not found');
		}
		throw new AgenticChatWorkerTurnGatewayError(
			'database_error',
			'Worker turn cancellation failed'
		);
	}
	if (!isRecord(data) || data.turn_run_id !== input.turnRunId || data.user_id !== input.userId) {
		throw protocolError('Worker cancellation receipt identity is invalid');
	}
	if (data.outcome === 'cancel_requested') {
		if (
			data.status !== 'running' ||
			!isCanonicalUuid(data.signal_id) ||
			!validTimestamp(data.cancel_requested_at)
		) {
			throw protocolError('Worker cancellation request receipt is invalid');
		}
		return { outcome: 'cancel_requested' };
	}
	if (data.outcome !== 'cancelled' && data.outcome !== 'already_terminal') {
		throw protocolError('Worker cancellation outcome is invalid');
	}
	if (!isTerminalStatus(data.status)) {
		throw protocolError('Worker cancellation terminal status is invalid');
	}
	if (data.outcome === 'cancelled' && data.status !== 'cancelled') {
		throw protocolError('Queued cancellation did not terminalize as cancelled');
	}
	const generation = safeNonnegativeInteger(data.execution_generation);
	const sequence = safeNonnegativeInteger(data.terminal_sequence_index);
	if (
		generation === null ||
		sequence === null ||
		sequence < 1 ||
		data.terminal_event_id !== createAgentStreamEventIdV1(input.turnRunId, generation, sequence)
	) {
		throw protocolError('Worker cancellation terminal identity is invalid');
	}
	if (data.outcome === 'cancelled') {
		return {
			outcome: 'cancelled',
			status: 'cancelled',
			terminalEventId: data.terminal_event_id
		};
	}
	return {
		outcome: 'already_terminal',
		status: data.status,
		terminalEventId: data.terminal_event_id
	};
}

async function readRows(result: PromiseLike<QueryResult>): Promise<unknown[]> {
	const { data, error } = await result;
	if (error) {
		throw new AgenticChatWorkerTurnGatewayError('database_error', 'Worker turn lookup failed');
	}
	if (!Array.isArray(data)) throw protocolError('Worker turn lookup result is invalid');
	return data;
}

function parseDescriptor(value: unknown): AgenticChatWorkerTurnDescriptorV1 {
	if (!isRecord(value)) throw protocolError('Worker turn descriptor is invalid');
	const generation = safeNonnegativeInteger(value.execution_generation);
	const lastEventSequence = safeNonnegativeInteger(value.last_event_sequence);
	if (
		!isCanonicalUuid(value.id) ||
		!isCanonicalUuid(value.session_id) ||
		!nonemptyString(value.stream_run_id) ||
		!nonemptyString(value.client_turn_id) ||
		value.execution_mode !== 'worker_realtime' ||
		value.transport_contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		!isTurnStatus(value.status) ||
		generation === null ||
		lastEventSequence === null ||
		(value.status === 'running' && generation < 1) ||
		(typeof value.terminal_event_id !== 'string' && value.terminal_event_id !== null) ||
		!validTimestamp(value.updated_at)
	) {
		throw protocolError('Worker turn descriptor is invalid');
	}
	const terminal = isTerminalStatus(value.status);
	if (terminal !== (typeof value.terminal_event_id === 'string')) {
		throw protocolError('Worker turn terminal descriptor is invalid');
	}
	const terminalEventId =
		typeof value.terminal_event_id === 'string' ? value.terminal_event_id : null;
	if (
		terminalEventId !== null &&
		(lastEventSequence < 1 ||
			terminalEventId !== createAgentStreamEventIdV1(value.id, generation, lastEventSequence))
	) {
		throw protocolError('Worker turn terminal event identity is invalid');
	}
	return {
		handle: {
			contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			executionMode: 'worker_realtime',
			turnRunId: value.id.toLowerCase(),
			sessionId: value.session_id.toLowerCase(),
			streamRunId: value.stream_run_id,
			clientTurnId: value.client_turn_id
		},
		status: value.status,
		executionGeneration: generation,
		terminalEventId,
		updatedAt: value.updated_at
	};
}

function protocolError(message: string): AgenticChatWorkerTurnGatewayError {
	return new AgenticChatWorkerTurnGatewayError('protocol_error', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCanonicalUuid(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
	);
}

function nonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function safeNonnegativeInteger(value: unknown): number | null {
	return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
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

function isTerminalStatus(value: unknown): value is 'completed' | 'failed' | 'cancelled' {
	return value === 'completed' || value === 'failed' || value === 'cancelled';
}

function validTimestamp(value: unknown): value is string {
	return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
