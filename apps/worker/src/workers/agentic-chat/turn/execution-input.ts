// apps/worker/src/workers/agentic-chat/turn/execution-input.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4,
	AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
	type AgenticChatRawWorkflowInputV4,
	type AgenticChatTurnClaimResultV1,
	type Database,
	type JsonObject,
	type TurnInputArtifactV1,
	validateAgenticChatRawWorkflowInputV4,
	validateTurnInputArtifactV1
} from '@buildos/shared-types';

type ExecutableClaim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;
type ExecutionInputClient = Pick<SupabaseClient<Database>, 'from'>;

const AGENTIC_CHAT_TIMING_CACHE_SOURCES = new Set([
	'not_requested',
	'session_cache',
	'request_prewarm',
	'prepared_prompt',
	'fresh_load',
	'context_build_failed'
]);
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
	'request_payload_version',
	'created_at',
	'started_at',
	'worker_started_at',
	'execution_started_at',
	'history_cutoff_at',
	'request_prewarmed_context',
	'cache_source',
	'cache_age_seconds',
	'history_strategy',
	'history_compressed',
	'raw_history_count',
	'history_for_model_count',
	'prepared_prompt_id',
	'prepared_prompt_hit',
	'prepared_prompt_miss_reason',
	'prepared_surface_profile'
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

// Selected only by the raw workflow loader; ordinary execution never reads v4 columns.
const RAW_WORKFLOW_ARTIFACT_COLUMNS = [
	ARTIFACT_COLUMNS,
	'request',
	'request_hash',
	'history_hash'
].join(',');

export type AgenticChatWorkerExecutionInputV1 = {
	claim: ExecutableClaim;
	streamRunId: string;
	clientTurnId: string;
	requestPayload: JsonObject;
	artifact: TurnInputArtifactV1;
	timingBaseline: AgenticChatWorkerTimingBaselineV1;
};

/** A v4 raw request. It carries no prepared context and cannot reach a provider directly. */
export type AgenticChatRawWorkflowExecutionInputV1 = Omit<
	AgenticChatWorkerExecutionInputV1,
	'artifact'
> & {
	input: AgenticChatRawWorkflowInputV4;
};

type LoadedCommand = Omit<AgenticChatWorkerExecutionInputV1, 'artifact'>;

/**
 * Immutable database-clock and admission-category evidence. Runtime elapsed
 * measurements use a separate monotonic clock and must never be inferred from
 * these wall-clock strings.
 */
export type AgenticChatWorkerTimingBaselineV1 = {
	admittedAt: string;
	startedAt: string;
	workerStartedAt: string;
	executionStartedAt: string | null;
	historyCutoffAt: string;
	requestPrewarmedContext: boolean;
	cacheSource:
		| 'not_requested'
		| 'session_cache'
		| 'request_prewarm'
		| 'prepared_prompt'
		| 'fresh_load'
		| 'context_build_failed'
		| null;
	cacheAgeSeconds: number | null;
	historyStrategy: string | null;
	historyCompressed: boolean | null;
	rawHistoryCount: number | null;
	historyForModelCount: number | null;
	preparedPromptId: string | null;
	preparedPromptHit: boolean;
	preparedPromptMissReason: string | null;
	preparedSurfaceProfile: string | null;
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
			| 'invalid_timing_source'
			| 'artifact_expired'
			| 'raw_workflow_input_requires_preparation',
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
		const command = await this.loadCommand(claim);
		const { timingBaseline } = command;
		const row = await this.loadArtifactRow(claim, ARTIFACT_COLUMNS);
		if (row.artifact_version === AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4) {
			throw new AgenticChatExecutionInputError(
				'raw_workflow_input_requires_preparation',
				'Raw workflow input must be prepared by the workflow runner before provider execution'
			);
		}
		if (
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
		if (
			timingBaseline.preparedPromptId !==
				validation.normalizedContent.prepared.sourcePreparedPromptId ||
			(timingBaseline.preparedPromptId !== null &&
				timingBaseline.preparedSurfaceProfile !==
					validation.normalizedContent.prepared.surfaceProfile) ||
			(timingBaseline.historyForModelCount !== null &&
				timingBaseline.historyForModelCount !== validation.normalizedContent.history.length)
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_timing_source',
				'Worker timing baseline does not match its immutable input artifact'
			);
		}
		const historyState = validation.normalizedContent.prepared.historyState;
		if (
			historyState &&
			(timingBaseline.historyStrategy !== historyState.strategy ||
				timingBaseline.historyCompressed !== historyState.compressed ||
				timingBaseline.rawHistoryCount !== historyState.rawHistoryCount ||
				timingBaseline.historyForModelCount !== historyState.historyForModelCount)
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_timing_source',
				'Worker history timing evidence does not match its immutable input artifact'
			);
		}
		this.assertRetained(artifact.retainUntil);

		return {
			...command,
			artifact: {
				...artifact,
				...validation.normalizedContent,
				contentHash: validation.contentHash
			}
		};
	}

	/**
	 * Loads and re-verifies an agentic_chat_input_v4 request. Nothing here reads
	 * project context; the workflow runner prepares and checkpoints that separately.
	 */
	async loadRawWorkflowInput(
		claim: ExecutableClaim
	): Promise<AgenticChatRawWorkflowExecutionInputV1> {
		const command = await this.loadCommand(claim);
		const row = await this.loadArtifactRow(claim, RAW_WORKFLOW_ARTIFACT_COLUMNS);
		if (
			row.artifact_version !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V4 ||
			row.prepared !== null ||
			row.source_prepared_prompt_id !== null ||
			!isJsonObject(row.request)
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_artifact',
				'Worker input artifact is not a raw workflow request'
			);
		}
		const input = {
			artifactVersion: row.artifact_version,
			request: row.request,
			historySource: row.history_source,
			history: row.history,
			requestHashVersion: AGENTIC_CHAT_WORKFLOW_REQUEST_HASH_VERSION,
			requestHash: row.request_hash,
			historyHash: row.history_hash,
			contentHash: row.content_hash,
			historyBytes: row.history_bytes,
			contentBytes: row.content_bytes,
			createdAt: row.created_at,
			retainUntil: row.retain_until
		} as unknown as AgenticChatRawWorkflowInputV4;
		const validation = await validateAgenticChatRawWorkflowInputV4(input, {
			artifactId: claim.inputArtifactId,
			turnRunId: claim.turnRunId,
			sessionId: claim.sessionId,
			userId: claim.userId
		});
		if (!validation.ok) {
			throw new AgenticChatExecutionInputError(
				'invalid_artifact',
				`Raw workflow request failed validation: ${validation.code}`
			);
		}
		if (
			input.request.userMessageId !== claim.userMessageId ||
			input.request.clientTurnId !== command.clientTurnId ||
			input.request.streamRunId !== command.streamRunId ||
			input.request.message !== command.requestPayload.message
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_command',
				'Raw workflow request is not bound to its fenced command'
			);
		}
		this.assertRetained(input.retainUntil);
		return { ...command, input };
	}

	private assertRetained(retainUntil: string): void {
		if (Date.parse(retainUntil) <= this.now()) {
			throw new AgenticChatExecutionInputError(
				'artifact_expired',
				'Worker input artifact is outside its execution retention window'
			);
		}
	}

	private async loadCommand(claim: ExecutableClaim): Promise<LoadedCommand> {
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
		return {
			claim,
			streamRunId: turn.stream_run_id,
			clientTurnId: turn.client_turn_id,
			requestPayload: turn.request_payload,
			timingBaseline: parseTimingBaseline(turn)
		};
	}

	private async loadArtifactRow(
		claim: ExecutableClaim,
		columns: string
	): Promise<Record<string, unknown>> {
		const { data: rawArtifact, error: artifactError } = await this.client
			.from('chat_turn_input_artifacts')
			.select(columns)
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
			row.user_id !== claim.userId
		) {
			throw new AgenticChatExecutionInputError(
				'invalid_artifact',
				'Worker input artifact scope or shape is invalid'
			);
		}
		return row;
	}
}

function parseTimingBaseline(turn: Record<string, unknown>): AgenticChatWorkerTimingBaselineV1 {
	const admittedAt = requiredDatabaseTimestamp(turn.created_at);
	const startedAt = requiredDatabaseTimestamp(turn.started_at);
	const workerStartedAt = requiredDatabaseTimestamp(turn.worker_started_at);
	const executionStartedAt = nullableDatabaseTimestamp(turn.execution_started_at);
	const historyCutoffAt = requiredDatabaseTimestamp(turn.history_cutoff_at);
	const requestPrewarmedContext = turn.request_prewarmed_context;
	const cacheSource = turn.cache_source;
	const cacheAgeSeconds = turn.cache_age_seconds;
	const historyStrategy = turn.history_strategy;
	const historyCompressed = turn.history_compressed;
	const rawHistoryCount = turn.raw_history_count;
	const historyForModelCount = turn.history_for_model_count;
	const preparedPromptId = turn.prepared_prompt_id;
	const preparedPromptHit = turn.prepared_prompt_hit;
	const preparedPromptMissReason = turn.prepared_prompt_miss_reason;
	const preparedSurfaceProfile = turn.prepared_surface_profile;
	const timestampsOrdered =
		Date.parse(admittedAt) <= Date.parse(startedAt) &&
		Date.parse(startedAt) <= Date.parse(workerStartedAt) &&
		Date.parse(admittedAt) <= Date.parse(historyCutoffAt) &&
		Date.parse(historyCutoffAt) <= Date.parse(workerStartedAt) &&
		(executionStartedAt === null ||
			Date.parse(workerStartedAt) <= Date.parse(executionStartedAt));

	if (
		!timestampsOrdered ||
		typeof requestPrewarmedContext !== 'boolean' ||
		!(
			cacheSource === null ||
			(typeof cacheSource === 'string' && AGENTIC_CHAT_TIMING_CACHE_SOURCES.has(cacheSource))
		) ||
		!nullableNonnegativeNumber(cacheAgeSeconds) ||
		!nullableCanonicalText(historyStrategy, 128) ||
		!(historyCompressed === null || typeof historyCompressed === 'boolean') ||
		!nullableNonnegativeInteger(rawHistoryCount) ||
		!nullableNonnegativeInteger(historyForModelCount) ||
		!nullableCanonicalUuid(preparedPromptId) ||
		typeof preparedPromptHit !== 'boolean' ||
		preparedPromptHit !== (preparedPromptId !== null) ||
		requestPrewarmedContext !== (preparedPromptId !== null) ||
		!nullableCanonicalText(preparedPromptMissReason, 256) ||
		!nullableCanonicalText(preparedSurfaceProfile, 128) ||
		(preparedPromptId === null && preparedSurfaceProfile !== null)
	) {
		throw new AgenticChatExecutionInputError(
			'invalid_timing_source',
			'Worker timing baseline is malformed or internally inconsistent'
		);
	}

	return {
		admittedAt,
		startedAt,
		workerStartedAt,
		executionStartedAt,
		historyCutoffAt,
		requestPrewarmedContext,
		cacheSource: cacheSource as AgenticChatWorkerTimingBaselineV1['cacheSource'],
		cacheAgeSeconds,
		historyStrategy,
		historyCompressed,
		rawHistoryCount,
		historyForModelCount,
		preparedPromptId,
		preparedPromptHit,
		preparedPromptMissReason,
		preparedSurfaceProfile
	};
}

function requiredDatabaseTimestamp(value: unknown): string {
	if (!isDatabaseTimestamp(value)) {
		throw new AgenticChatExecutionInputError(
			'invalid_timing_source',
			'Worker timing baseline contains an invalid required timestamp'
		);
	}
	return value;
}

function nullableDatabaseTimestamp(value: unknown): string | null {
	if (value === null) return null;
	return requiredDatabaseTimestamp(value);
}

function isDatabaseTimestamp(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		DATABASE_TIMESTAMP_PATTERN.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

function nullableCanonicalUuid(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && UUID_PATTERN.test(value));
}

function nullableCanonicalText(value: unknown, maximum: number): value is string | null {
	return value === null || canonicalText(value, maximum);
}

function nullableNonnegativeInteger(value: unknown): value is number | null {
	return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function nullableNonnegativeNumber(value: unknown): value is number | null {
	return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
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
