// apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts
import type {
	AgenticChatWorkerAdmissionResultV1,
	ChatTurnStatusV1,
	Json
} from '@buildos/shared-types';

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };

export type AgenticChatWorkerAdmissionRpcArgs = {
	p_user_id: string;
	p_session_id: string | null;
	p_turn_run_id: string;
	p_user_message_id: string;
	p_input_artifact_id: string;
	p_stream_run_id: string;
	p_client_turn_id: string;
	p_request_hash: string;
	p_request_hash_version: 'agentic_chat_request_hash_v2';
	p_transport_contract_version: 'agentic_chat_worker_v1';
	p_transport_decision_id: string;
	p_correlation_id: string;
	p_context_type: string;
	p_entity_id: string | null;
	p_project_id: string | null;
	p_source: string;
	p_gateway_enabled: boolean;
	p_request_message: string;
	p_request_payload: Json;
	p_request_payload_version: 'agentic_chat_request_v1';
	p_user_message_content: string;
	p_user_message_metadata: Json;
	p_history_limit: number;
	p_history_source: 'admission_window' | 'prepared_prompt';
	p_artifact_history: Json;
	p_artifact_prepared: Json;
	p_artifact_content_hash: string;
	p_artifact_history_bytes: number;
	p_artifact_content_bytes: number;
	p_prepared_prompt_id: string | null;
	p_prepared_context_payload_sha256: string | null;
	p_prepared_surface_profile: string | null;
	p_session_agent_metadata: Json;
	p_capacity_available: boolean;
};

export type AgenticChatWorkerAdmissionRpcClient = {
	rpc(
		name: 'create_agentic_chat_turn_with_job',
		args: AgenticChatWorkerAdmissionRpcArgs
	): PromiseLike<RpcResult>;
};

export type AgenticChatWorkerAdmissionGatewayErrorCode = 'database_error' | 'protocol_error';

export class AgenticChatWorkerAdmissionGatewayError extends Error {
	constructor(
		readonly code: AgenticChatWorkerAdmissionGatewayErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatWorkerAdmissionGatewayError';
	}
}

/**
 * Service-only adapter for the hosted duplicate-first admission transaction.
 * All expensive preparation and lease validation belongs before this boundary;
 * this function owns exact RPC invocation and fail-closed receipt parsing.
 */
export async function admitAgenticChatWorkerTurn(input: {
	client: AgenticChatWorkerAdmissionRpcClient;
	args: AgenticChatWorkerAdmissionRpcArgs;
}): Promise<AgenticChatWorkerAdmissionResultV1> {
	const { data, error } = await input.client.rpc('create_agentic_chat_turn_with_job', input.args);
	if (error) {
		// The Postgres exception name (e.g. agentic_chat_worker_admission_prepared_*)
		// is the only signal separating a prepared-lease race from a real outage.
		// It stays server-side: the route logs it and returns a generic response.
		const detail = [error.code, error.message]
			.filter((part): part is string => typeof part === 'string' && part.length > 0)
			.join(' ');
		throw new AgenticChatWorkerAdmissionGatewayError(
			'database_error',
			detail ? `Worker turn admission failed: ${detail}` : 'Worker turn admission failed'
		);
	}
	return parseAdmissionReceipt(data, input.args);
}

/**
 * True when a durable-admission failure names one of the prepared-prompt
 * guards (scope/consumed/expired/integrity/copy/claim/history-currency).
 * These are inspection→admission races — an invalidation, consumption, or
 * newer message landed in between — and the turn is safe to re-admit once
 * without the prepared fast path.
 */
export function isPreparedAdmissionRaceError(error: unknown): boolean {
	return (
		error instanceof AgenticChatWorkerAdmissionGatewayError &&
		error.code === 'database_error' &&
		/prepared/.test(error.message)
	);
}

function parseAdmissionReceipt(
	value: unknown,
	args: AgenticChatWorkerAdmissionRpcArgs
): AgenticChatWorkerAdmissionResultV1 {
	if (!isRecord(value) || value.execution_may_start !== false) {
		throw protocolError('Worker admission receipt is invalid');
	}
	if (value.outcome === 'capacity_exceeded') return parseCapacityReceipt(value);

	const handle = parseHandle(value);
	if (value.outcome === 'newly_admitted') {
		if (
			handle.turnRunId !== args.p_turn_run_id.toLowerCase() ||
			(args.p_session_id !== null && handle.sessionId !== args.p_session_id.toLowerCase()) ||
			handle.userMessageId !== args.p_user_message_id.toLowerCase() ||
			handle.inputArtifactId !== args.p_input_artifact_id.toLowerCase() ||
			handle.correlationId !== args.p_correlation_id.toLowerCase() ||
			handle.streamRunId !== args.p_stream_run_id ||
			handle.clientTurnId !== args.p_client_turn_id ||
			handle.executionMode !== 'worker_realtime' ||
			handle.status !== 'queued' ||
			handle.queueJobId === null ||
			typeof value.session_created !== 'boolean' ||
			(args.p_session_id !== null && value.session_created)
		) {
			throw protocolError('New worker admission identity is invalid');
		}
		return {
			outcome: 'newly_admitted',
			executionMayStart: false,
			...handle,
			executionMode: 'worker_realtime',
			status: 'queued',
			clientTurnId: args.p_client_turn_id,
			userMessageId: handle.userMessageId,
			inputArtifactId: handle.inputArtifactId,
			queueJobId: handle.queueJobId,
			sessionCreated: value.session_created
		};
	}

	if (value.outcome === 'matching_duplicate') {
		if (
			handle.clientTurnId !== args.p_client_turn_id ||
			handle.streamRunId !== args.p_stream_run_id ||
			(args.p_session_id !== null && handle.sessionId !== args.p_session_id.toLowerCase()) ||
			(handle.executionMode === 'worker_realtime' &&
				(handle.userMessageId === null ||
					handle.inputArtifactId === null ||
					handle.queueJobId === null))
		) {
			throw protocolError('Matching worker admission receipt is invalid');
		}
		return {
			outcome: 'matching_duplicate',
			executionMayStart: false,
			...handle,
			clientTurnId: args.p_client_turn_id
		};
	}

	if (value.outcome === 'active_turn_conflict') {
		return { outcome: 'active_turn_conflict', executionMayStart: false, ...handle };
	}

	if (value.outcome === 'idempotency_conflict') {
		if (
			handle.clientTurnId !== args.p_client_turn_id ||
			!canonicalText(value.conflict_reason, 128)
		) {
			throw protocolError('Worker admission idempotency conflict is invalid');
		}
		return {
			outcome: 'idempotency_conflict',
			executionMayStart: false,
			...handle,
			clientTurnId: args.p_client_turn_id,
			conflictReason: value.conflict_reason
		};
	}

	throw protocolError('Worker admission outcome is invalid');
}

type ParsedHandle = {
	turnRunId: string;
	sessionId: string;
	userMessageId: string | null;
	inputArtifactId: string | null;
	queueJobId: string | null;
	correlationId: string;
	streamRunId: string;
	clientTurnId: string | null;
	executionMode: 'worker_realtime';
	status: ChatTurnStatusV1;
};

function parseHandle(value: Record<string, unknown>): ParsedHandle {
	const turnRunId = canonicalUuid(value.turn_run_id);
	const sessionId = canonicalUuid(value.session_id);
	const userMessageId = nullableCanonicalUuid(value.user_message_id);
	const inputArtifactId = nullableCanonicalUuid(value.input_artifact_id);
	const queueJobId = nullableCanonicalUuid(value.queue_job_id);
	const correlationId = canonicalUuid(value.correlation_id);
	const clientTurnId = nullableCanonicalText(value.client_turn_id, 256);
	if (
		turnRunId === null ||
		sessionId === null ||
		userMessageId === 'invalid' ||
		inputArtifactId === 'invalid' ||
		queueJobId === 'invalid' ||
		correlationId === null ||
		!canonicalText(value.stream_run_id, 256) ||
		clientTurnId === 'invalid' ||
		value.execution_mode !== 'worker_realtime' ||
		!isTurnStatus(value.status)
	) {
		throw protocolError('Worker admission handle is invalid');
	}
	return {
		turnRunId,
		sessionId,
		userMessageId,
		inputArtifactId,
		queueJobId,
		correlationId,
		streamRunId: value.stream_run_id,
		clientTurnId,
		executionMode: value.execution_mode,
		status: value.status
	};
}

function parseCapacityReceipt(
	value: Record<string, unknown>
): Extract<AgenticChatWorkerAdmissionResultV1, { outcome: 'capacity_exceeded' }> {
	if (
		(value.capacity_reason !== 'pressure_closed' &&
			value.capacity_reason !== 'max_running' &&
			value.capacity_reason !== 'max_queued') ||
		!positiveBoundedInteger(value.retry_after_seconds, 300) ||
		!nonnegativeSafeInteger(value.running_count) ||
		!nonnegativeSafeInteger(value.queued_count)
	) {
		throw protocolError('Worker admission capacity receipt is invalid');
	}
	return {
		outcome: 'capacity_exceeded',
		executionMayStart: false,
		capacityReason: value.capacity_reason,
		retryAfterSeconds: value.retry_after_seconds,
		runningCount: value.running_count,
		queuedCount: value.queued_count
	};
}

function canonicalUuid(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function nullableCanonicalUuid(value: unknown): string | null | 'invalid' {
	if (value === null) return null;
	return canonicalUuid(value) ?? 'invalid';
}

function nullableCanonicalText(value: unknown, maxLength: number): string | null | 'invalid' {
	if (value === null) return null;
	return canonicalText(value, maxLength) ? value : 'invalid';
}

function canonicalText(value: unknown, maxLength: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maxLength &&
		value === value.trim()
	);
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

function positiveBoundedInteger(value: unknown, maximum: number): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum;
}

function nonnegativeSafeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function protocolError(message: string): AgenticChatWorkerAdmissionGatewayError {
	return new AgenticChatWorkerAdmissionGatewayError('protocol_error', message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
