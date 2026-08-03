// apps/worker/src/workers/agentic-chat/executionInput.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	type AgenticChatTurnClaimResultV1,
	type Database,
	type JsonObject,
	type TurnInputArtifactV1,
	validateTurnInputArtifactV1
} from '@buildos/shared-types';

type ExecutableClaim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;
type ExecutionInputClient = Pick<SupabaseClient<Database>, 'from'>;

const TURN_COLUMNS = [
	'id',
	'session_id',
	'user_id',
	'queue_job_id',
	'correlation_id',
	'execution_generation',
	'execution_mode',
	'status',
	'stream_run_id',
	'client_turn_id',
	'input_artifact_id',
	'user_message_id',
	'request_payload',
	'request_payload_version'
].join(',');

const ARTIFACT_COLUMNS = [
	'id',
	'turn_run_id',
	'session_id',
	'user_id',
	'source_prepared_prompt_id',
	'artifact_version',
	'history_source',
	'history',
	'prepared',
	'content_hash',
	'history_bytes',
	'content_bytes',
	'created_at',
	'retain_until'
].join(',');

export type AgenticChatWorkerExecutionInputV1 = {
	claim: ExecutableClaim;
	streamRunId: string;
	clientTurnId: string;
	requestPayload: JsonObject;
	artifact: TurnInputArtifactV1;
};

export type AgenticChatExecutionInputPortV1 = {
	load(claim: ExecutableClaim): Promise<AgenticChatWorkerExecutionInputV1>;
};

export class AgenticChatExecutionInputError extends Error {
	constructor(
		readonly code:
			| 'database_error'
			| 'not_found'
			| 'scope_mismatch'
			| 'invalid_command'
			| 'invalid_artifact'
			| 'artifact_expired',
		message: string
	) {
		super(message);
		this.name = 'AgenticChatExecutionInputError';
	}
}

export class SupabaseAgenticChatExecutionInputAdapter implements AgenticChatExecutionInputPortV1 {
	constructor(
		private readonly client: ExecutionInputClient,
		private readonly now: () => number = Date.now
	) {}

	async load(claim: ExecutableClaim): Promise<AgenticChatWorkerExecutionInputV1> {
		const { data: rawTurn, error: turnError } = await this.client
			.from('chat_turn_runs')
			.select(TURN_COLUMNS)
			.eq('id', claim.turnRunId)
			.eq('user_id', claim.userId)
			.eq('session_id', claim.sessionId)
			.eq('queue_job_id', claim.queueJobId)
			.maybeSingle();
		if (turnError)
			throw new AgenticChatExecutionInputError('database_error', turnError.message);
		if (!rawTurn)
			throw new AgenticChatExecutionInputError('not_found', 'Worker turn is missing');

		const turn = rawTurn as unknown as Record<string, unknown>;
		if (
			turn.id !== claim.turnRunId ||
			turn.session_id !== claim.sessionId ||
			turn.user_id !== claim.userId ||
			turn.queue_job_id !== claim.queueJobId ||
			turn.correlation_id !== claim.correlationId ||
			turn.execution_generation !== claim.executionGeneration ||
			turn.execution_mode !== 'worker_realtime' ||
			turn.status !== 'running' ||
			turn.input_artifact_id !== claim.inputArtifactId ||
			turn.user_message_id !== claim.userMessageId ||
			!canonicalText(turn.stream_run_id, 256) ||
			!canonicalText(turn.client_turn_id, 256) ||
			turn.request_payload_version !== 'agentic_chat_request_v1' ||
			!isJsonObject(turn.request_payload)
		) {
			throw new AgenticChatExecutionInputError(
				'scope_mismatch',
				'Worker turn command does not match its fenced claim'
			);
		}
		if (
			turn.request_payload.clientTurnId !== turn.client_turn_id ||
			turn.request_payload.streamRunId !== turn.stream_run_id ||
			typeof turn.request_payload.message !== 'string' ||
			!isJsonObject(turn.request_payload.context)
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_command',
				'Worker request payload is malformed or cross-bound'
			);
		}

		const { data: rawArtifact, error: artifactError } = await this.client
			.from('chat_turn_input_artifacts')
			.select(ARTIFACT_COLUMNS)
			.eq('id', claim.inputArtifactId)
			.eq('turn_run_id', claim.turnRunId)
			.eq('session_id', claim.sessionId)
			.eq('user_id', claim.userId)
			.maybeSingle();
		if (artifactError) {
			throw new AgenticChatExecutionInputError('database_error', artifactError.message);
		}
		if (!rawArtifact) {
			throw new AgenticChatExecutionInputError(
				'not_found',
				'Worker input artifact is missing'
			);
		}

		const row = rawArtifact as unknown as Record<string, unknown>;
		if (
			row.id !== claim.inputArtifactId ||
			row.turn_run_id !== claim.turnRunId ||
			row.session_id !== claim.sessionId ||
			row.user_id !== claim.userId ||
			!Array.isArray(row.history) ||
			!isJsonObject(row.prepared) ||
			typeof row.created_at !== 'string' ||
			typeof row.retain_until !== 'string' ||
			typeof row.content_hash !== 'string'
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_artifact',
				'Worker input artifact scope or shape is invalid'
			);
		}

		const artifact = {
			artifactVersion: row.artifact_version,
			historySource: row.history_source,
			history: row.history,
			prepared: row.prepared,
			createdAt: row.created_at,
			retainUntil: row.retain_until,
			contentHash: row.content_hash
		} as unknown as TurnInputArtifactV1;
		const validation = await validateTurnInputArtifactV1(artifact, {
			excludedMessageId: claim.userMessageId
		});
		if (
			!validation.ok ||
			row.source_prepared_prompt_id !==
				validation.normalizedContent.prepared.sourcePreparedPromptId ||
			row.history_bytes !== validation.historyBytes ||
			row.content_bytes !== validation.contentBytes
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_artifact',
				validation.ok
					? 'Worker input artifact integrity metadata is inconsistent'
					: `Worker input artifact failed validation: ${validation.code}`
			);
		}
		if (Date.parse(artifact.retainUntil) <= this.now()) {
			throw new AgenticChatExecutionInputError(
				'artifact_expired',
				'Worker input artifact is outside its execution retention window'
			);
		}

		return {
			claim,
			streamRunId: turn.stream_run_id,
			clientTurnId: turn.client_turn_id,
			requestPayload: turn.request_payload,
			artifact: {
				...artifact,
				...validation.normalizedContent,
				contentHash: validation.contentHash
			}
		};
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

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
