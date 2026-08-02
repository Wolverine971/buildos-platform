// apps/web/src/lib/services/agentic-chat-v2/turn-input-artifact-store.server.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_INPUT_RETENTION_MS,
	hashTurnInputArtifactContentV1,
	normalizeTurnInputArtifactContentV1,
	validateTurnInputArtifactV1,
	type Database,
	type Json,
	type TurnInputArtifactContentV1,
	type TurnInputArtifactV1,
	type TurnInputArtifactValidationErrorCodeV1
} from '@buildos/shared-types';

type TurnInputArtifactStoreClient = Pick<SupabaseClient<Database>, 'from'>;
type TurnInputArtifactRow = Database['public']['Tables']['chat_turn_input_artifacts']['Row'];
type TurnInputArtifactInsert = Database['public']['Tables']['chat_turn_input_artifacts']['Insert'];

const TURN_INPUT_ARTIFACT_COLUMNS = [
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

export type TurnInputArtifactStoreErrorCode =
	| TurnInputArtifactValidationErrorCodeV1
	| 'database_error'
	| 'not_found'
	| 'source_lineage_mismatch'
	| 'history_bytes_mismatch'
	| 'content_bytes_mismatch'
	| 'artifact_expired';

export class TurnInputArtifactStoreError extends Error {
	constructor(
		public readonly code: TurnInputArtifactStoreErrorCode,
		message: string,
		public readonly databaseError: unknown | null = null
	) {
		super(message);
		this.name = 'TurnInputArtifactStoreError';
	}
}

export type StoredTurnInputArtifact = {
	id: string;
	turnRunId: string;
	sessionId: string;
	userId: string;
	sourcePreparedPromptId: string | null;
	artifact: TurnInputArtifactV1;
	historyBytes: number;
	contentBytes: number;
};

/**
 * Persist one pre-generated, immutable execution input.
 *
 * The caller remains responsible for creating/linking the owning turn in the
 * admission transaction. This boundary owns canonicalization, hashing, exact
 * byte counters, retention validation, and exclusion of the admitted message.
 */
export async function writeTurnInputArtifact(params: {
	supabase: TurnInputArtifactStoreClient;
	id: string;
	turnRunId: string;
	sessionId: string;
	userId: string;
	content: TurnInputArtifactContentV1;
	excludedMessageId: string;
	createdAt?: string;
	retainUntil?: string;
}): Promise<StoredTurnInputArtifact> {
	let normalizedContent: TurnInputArtifactContentV1;
	let contentHash: string;
	try {
		normalizedContent = normalizeTurnInputArtifactContentV1(params.content);
		contentHash = await hashTurnInputArtifactContentV1(normalizedContent);
	} catch (error) {
		throw invalidContentError(error);
	}
	const createdAt = params.createdAt ?? new Date().toISOString();
	const createdAtMs = Date.parse(createdAt);
	if (!Number.isFinite(createdAtMs)) {
		throw new TurnInputArtifactStoreError(
			'invalid_retention',
			'Input artifact creation time must be a valid timestamp'
		);
	}
	const retainUntil =
		params.retainUntil ?? new Date(createdAtMs + AGENTIC_CHAT_INPUT_RETENTION_MS).toISOString();
	const artifact: TurnInputArtifactV1 = {
		...normalizedContent,
		createdAt,
		retainUntil,
		contentHash
	};
	const validation = await verifyArtifact(artifact, params.excludedMessageId);

	const row: TurnInputArtifactInsert = {
		id: params.id,
		turn_run_id: params.turnRunId,
		session_id: params.sessionId,
		user_id: params.userId,
		source_prepared_prompt_id: validation.normalizedContent.prepared.sourcePreparedPromptId,
		artifact_version: validation.normalizedContent.artifactVersion,
		history_source: validation.normalizedContent.historySource,
		history: validation.normalizedContent.history as unknown as Json,
		prepared: validation.normalizedContent.prepared as unknown as Json,
		content_hash: validation.contentHash,
		history_bytes: validation.historyBytes,
		content_bytes: validation.contentBytes,
		created_at: createdAt,
		retain_until: retainUntil
	};

	const { error } = await params.supabase.from('chat_turn_input_artifacts').insert(row);
	if (error) {
		throw new TurnInputArtifactStoreError(
			'database_error',
			'Failed to persist the immutable turn input artifact',
			error
		);
	}

	return toStoredArtifact({ row: row as TurnInputArtifactRow, artifact, validation });
}

/**
 * Load and verify a frozen input before provider work begins.
 *
 * Scope filters deliberately travel with the artifact id so a worker command
 * cannot cross a turn, session, or owner boundary. Mutable message/prepared
 * rows are never consulted as a fallback.
 */
export async function readVerifiedTurnInputArtifact(params: {
	supabase: TurnInputArtifactStoreClient;
	id: string;
	turnRunId: string;
	sessionId: string;
	userId: string;
	excludedMessageId: string;
	nowMs?: number;
}): Promise<StoredTurnInputArtifact> {
	const { data, error } = await params.supabase
		.from('chat_turn_input_artifacts')
		.select(TURN_INPUT_ARTIFACT_COLUMNS)
		.eq('id', params.id)
		.eq('turn_run_id', params.turnRunId)
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId)
		.maybeSingle();

	if (error) {
		throw new TurnInputArtifactStoreError(
			'database_error',
			'Failed to load the immutable turn input artifact',
			error
		);
	}
	if (!data) {
		throw new TurnInputArtifactStoreError(
			'not_found',
			'No turn input artifact exists for the requested scope'
		);
	}

	const row = data as unknown as TurnInputArtifactRow;
	const artifact = artifactFromRow(row);
	const validation = await verifyArtifact(artifact, params.excludedMessageId);

	if (
		row.source_prepared_prompt_id !==
		validation.normalizedContent.prepared.sourcePreparedPromptId
	) {
		throw new TurnInputArtifactStoreError(
			'source_lineage_mismatch',
			'Stored prepared-prompt lineage does not match the frozen artifact'
		);
	}
	if (row.history_bytes !== validation.historyBytes) {
		throw new TurnInputArtifactStoreError(
			'history_bytes_mismatch',
			'Stored history byte count does not match canonical history'
		);
	}
	if (row.content_bytes !== validation.contentBytes) {
		throw new TurnInputArtifactStoreError(
			'content_bytes_mismatch',
			'Stored content byte count does not match canonical content'
		);
	}
	if (Date.parse(row.retain_until) <= (params.nowMs ?? Date.now())) {
		throw new TurnInputArtifactStoreError(
			'artifact_expired',
			'Turn input artifact is outside its retained execution window'
		);
	}

	return toStoredArtifact({ row, artifact, validation });
}

async function verifyArtifact(artifact: TurnInputArtifactV1, excludedMessageId: string) {
	try {
		const validation = await validateTurnInputArtifactV1(artifact, { excludedMessageId });
		if (!validation.ok) {
			throw new TurnInputArtifactStoreError(validation.code, validation.detail);
		}
		return validation;
	} catch (error) {
		if (error instanceof TurnInputArtifactStoreError) throw error;
		throw invalidContentError(error);
	}
}

function invalidContentError(error: unknown): TurnInputArtifactStoreError {
	return new TurnInputArtifactStoreError(
		'invalid_content',
		error instanceof Error
			? `Turn input artifact is not valid canonical content: ${error.message}`
			: 'Turn input artifact is not valid canonical content'
	);
}

function artifactFromRow(row: TurnInputArtifactRow): TurnInputArtifactV1 {
	const prepared = row.prepared as unknown as TurnInputArtifactContentV1['prepared'];
	return {
		artifactVersion: row.artifact_version as TurnInputArtifactV1['artifactVersion'],
		historySource: row.history_source as TurnInputArtifactV1['historySource'],
		history: row.history as unknown as TurnInputArtifactV1['history'],
		prepared,
		createdAt: row.created_at,
		retainUntil: row.retain_until,
		contentHash: row.content_hash
	};
}

function toStoredArtifact(params: {
	row: TurnInputArtifactRow;
	artifact: TurnInputArtifactV1;
	validation: Extract<Awaited<ReturnType<typeof validateTurnInputArtifactV1>>, { ok: true }>;
}): StoredTurnInputArtifact {
	return {
		id: params.row.id,
		turnRunId: params.row.turn_run_id,
		sessionId: params.row.session_id,
		userId: params.row.user_id,
		sourcePreparedPromptId: params.row.source_prepared_prompt_id,
		artifact: {
			...params.validation.normalizedContent,
			createdAt: params.artifact.createdAt,
			retainUntil: params.artifact.retainUntil,
			contentHash: params.validation.contentHash
		},
		historyBytes: params.validation.historyBytes,
		contentBytes: params.validation.contentBytes
	};
}
