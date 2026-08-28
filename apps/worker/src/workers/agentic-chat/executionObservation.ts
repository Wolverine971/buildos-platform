// apps/worker/src/workers/agentic-chat/executionObservation.ts
import { createHash } from 'node:crypto';
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from './executionControl';
import { runWithAbortableDeadline } from './abortableDeadline';
import { agenticChatGenerationWriteFenceArgsV1 } from './writeFence';

const OBSERVATION_IDENTITY_VERSION = 'agentic_chat_execution_observation_identity_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OBSERVATION_KEY_PATTERN = /^[0-9a-f]{64}$/;
export const AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS = 5_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

export type AgenticChatExecutionObservationRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatExecutionObservationEventTypeV1 =
	| 'provider_attempt_started'
	| 'provider_attempt_ended'
	| 'provider_media_resolved'
	| 'tool_execution_started'
	| 'tool_execution_ended';

export type AgenticChatExecutionObservationInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	executionGeneration: number;
	observationKey: string;
	phase: 'provider' | 'tool';
	eventType: AgenticChatExecutionObservationEventTypeV1;
	payload: JsonObject;
};

export type AgenticChatExecutionObservationPortV1 = {
	observe(input: AgenticChatExecutionObservationInputV1, signal: AbortSignal): Promise<void>;
};

export class AgenticChatExecutionObservationError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatExecutionObservationError';
	}
}

export class SupabaseAgenticChatExecutionObservationAdapter
	implements AgenticChatExecutionObservationPortV1
{
	private readonly timeoutMs: number;

	constructor(
		private readonly client: AgenticChatExecutionObservationRpcClient,
		options: { timeoutMs?: number } = {}
	) {
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
			throw invalid('observation timeout is invalid');
		}
	}

	async observe(
		input: AgenticChatExecutionObservationInputV1,
		signal: AbortSignal
	): Promise<void> {
		validateInput(input);
		const operation =
			input.eventType === 'provider_attempt_started' ||
			input.eventType === 'provider_attempt_ended'
				? 'persist_agentic_chat_provider_attempt_observation'
				: 'persist_agentic_chat_execution_observation';
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () =>
				new AgenticChatExecutionObservationError(
					'execution_observation_timeout',
					`Agentic Chat execution observation exceeded its ${this.timeoutMs}ms deadline`
				),
			run: (deadlineSignal) => {
				const request = this.client.rpc(operation, {
					...agenticChatGenerationWriteFenceArgsV1(input),
					p_user_id: input.userId,
					p_observation_key: input.observationKey,
					p_phase: input.phase,
					p_event_type: input.eventType,
					p_payload: input.payload
				});
				return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
			}
		});
		if (error) {
			throw new AgenticChatExecutionObservationError(
				error.code ?? '',
				`${operation} failed: ${error.message}`
			);
		}
		const receipt = requireRecord(data);
		if (
			(receipt.outcome !== 'persisted' && receipt.outcome !== 'already_persisted') ||
			receipt.turn_run_id !== input.turnRunId ||
			receipt.execution_generation !== input.executionGeneration ||
			receipt.observation_key !== input.observationKey ||
			receipt.event_type !== input.eventType
		) {
			throw new AgenticChatExecutionObservationError(
				'execution_observation_protocol_error',
				'Invalid Agentic Chat execution-observation receipt'
			);
		}
	}
}

export function createStableAgenticChatExecutionObservationKeyV1(input: {
	turnRunId: string;
	scope: string;
	boundary: AgenticChatExecutionObservationEventTypeV1;
}): string {
	canonicalUuid(input.turnRunId, 'turnRunId');
	if (
		!input.scope ||
		input.scope !== input.scope.trim() ||
		input.scope.length > 1_024 ||
		!/^[a-zA-Z0-9:_./-]+$/.test(input.scope)
	) {
		throw new AgenticChatExecutionObservationError(
			'execution_observation_identity_invalid',
			'Agentic Chat execution-observation scope is invalid'
		);
	}
	return createHash('sha256')
		.update(
			`${OBSERVATION_IDENTITY_VERSION}:${input.turnRunId}:${input.scope}:${input.boundary}`,
			'utf8'
		)
		.digest('hex');
}

function validateInput(input: AgenticChatExecutionObservationInputV1): void {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.queueJobId, 'queueJobId');
	canonicalUuid(input.processingToken, 'processingToken');
	canonicalUuid(input.userId, 'userId');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw invalid('execution generation is invalid');
	}
	if (!OBSERVATION_KEY_PATTERN.test(input.observationKey)) {
		throw invalid('observation key is invalid');
	}
	if (
		(input.phase === 'provider' && !input.eventType.startsWith('provider_')) ||
		(input.phase === 'tool' && !input.eventType.startsWith('tool_execution_')) ||
		(input.phase !== 'provider' && input.phase !== 'tool')
	) {
		throw invalid('phase and event type are inconsistent');
	}
	if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
		throw invalid('payload is invalid');
	}
	if (Buffer.byteLength(JSON.stringify(input.payload), 'utf8') > 16 * 1024) {
		throw invalid('payload exceeds its bound');
	}
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw invalid('receipt is not an object');
	}
	return value as Record<string, unknown>;
}

function canonicalUuid(value: string, label: string): void {
	if (!UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw invalid(`${label} is invalid`);
	}
}

function invalid(message: string): AgenticChatExecutionObservationError {
	return new AgenticChatExecutionObservationError(
		'execution_observation_protocol_error',
		`Invalid Agentic Chat execution observation: ${message}`
	);
}
