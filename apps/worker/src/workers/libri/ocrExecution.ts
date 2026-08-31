import type { LibriTransactionClient, LibriTransactionalPool } from './lifecycle';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

type OcrExecutionOutcome =
	| 'started'
	| 'settled'
	| 'released'
	| 'reserved'
	| 'stale'
	| 'invalid_payload'
	| 'image_unavailable';

const OCR_EXECUTION_OUTCOMES: ReadonlySet<OcrExecutionOutcome> = new Set([
	'started',
	'settled',
	'released',
	'reserved',
	'stale',
	'invalid_payload',
	'image_unavailable'
]);

export type LibriOcrOwnership = {
	queueRowId: string;
	processingToken: string;
	stepId: string;
	executionGeneration: number;
	leaseToken: string;
};

export type AuthorizeLibriOcrProviderInput = LibriOcrOwnership & {
	reservationId: string;
	imageId: string;
};

export type AuthorizeLibriOcrProviderReceipt = {
	authorized: boolean;
	outcome: OcrExecutionOutcome;
	maxOutputChars: number | null;
	provider: string | null;
	model: string | null;
};

export type CompleteLibriOcrStepInput = AuthorizeLibriOcrProviderInput & {
	extractedText: string;
	summary: string;
	confidence?: number;
	language?: string;
	actualCostMicrousd: bigint;
	promptTokens: bigint;
	completionTokens: bigint;
	providerRequestId: string;
};

export type CompleteLibriOcrStepReceipt = {
	accepted: boolean;
	outcome: OcrExecutionOutcome;
	sourceChunkId: string | null;
	ocrVersion: number | null;
	provider: string | null;
	model: string | null;
	contentSha256: string | null;
	overBudget: boolean;
	totalSpentMicrousd: bigint;
	remainingMicrousd: bigint;
};

export type LibriOcrExecutionPort = {
	authorizeOcrProviderCall(
		input: AuthorizeLibriOcrProviderInput
	): Promise<AuthorizeLibriOcrProviderReceipt>;
	completeOcrStep(input: CompleteLibriOcrStepInput): Promise<CompleteLibriOcrStepReceipt>;
};

type AuthorizationRow = {
	authorized: boolean;
	outcome: string;
	max_output_chars: number | null;
	provider: string | null;
	model: string | null;
};

type CompletionRow = {
	accepted: boolean;
	outcome: string;
	source_chunk_id: string | null;
	ocr_version: number | null;
	provider: string | null;
	model: string | null;
	content_sha256: string | null;
	over_budget: boolean;
	total_spent_microusd: string;
	remaining_microusd: string;
};

export function createLibriOcrExecution(pool: LibriTransactionalPool): LibriOcrExecutionPort {
	return new LibriOcrExecution(pool);
}

class LibriOcrExecution implements LibriOcrExecutionPort {
	constructor(private readonly pool: LibriTransactionalPool) {}

	authorizeOcrProviderCall(
		input: AuthorizeLibriOcrProviderInput
	): Promise<AuthorizeLibriOcrProviderReceipt> {
		validateIdentity(input);
		return withTransaction(this.pool, async (client) => {
			if (!(await lockQueueOwnership(client, input))) return staleAuthorization();
			const result = await client.query<AuthorizationRow>(
				`SELECT * FROM libri.authorize_ocr_provider_call($1, $2, $3, $4, $5, $6, $7)`,
				[
					input.queueRowId,
					input.processingToken,
					input.stepId,
					input.executionGeneration,
					input.leaseToken,
					input.reservationId,
					input.imageId
				]
			);
			return readAuthorization(result.rows);
		});
	}

	completeOcrStep(input: CompleteLibriOcrStepInput): Promise<CompleteLibriOcrStepReceipt> {
		validateCompletion(input);
		return withTransaction(this.pool, async (client) => {
			if (!(await lockQueueOwnership(client, input))) return staleCompletion();
			const persisted = await client.query<CompletionRow>(
				`SELECT * FROM libri.persist_and_settle_ocr_result(
					$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
				)`,
				[
					input.queueRowId,
					input.processingToken,
					input.stepId,
					input.executionGeneration,
					input.leaseToken,
					input.reservationId,
					input.imageId,
					input.extractedText.trim(),
					input.summary.trim(),
					input.confidence ?? null,
					input.language?.trim() || null,
					input.actualCostMicrousd.toString(),
					input.promptTokens.toString(),
					input.completionTokens.toString(),
					input.providerRequestId.trim()
				]
			);
			const receipt = readCompletion(persisted.rows);
			if (!receipt.accepted) return receipt;

			const resultPayload = {
				version: 1,
				kind: 'ocr_image',
				imageId: input.imageId,
				ocrVersion: receipt.ocrVersion,
				sourceChunkId: receipt.sourceChunkId,
				contentSha256: receipt.contentSha256,
				provider: receipt.provider,
				model: receipt.model,
				providerRequestId: input.providerRequestId.trim(),
				promptTokens: input.promptTokens.toString(),
				completionTokens: input.completionTokens.toString(),
				actualCostMicrousd: input.actualCostMicrousd.toString(),
				overBudget: receipt.overBudget
			};
			const queueUpdate = await client.query<{ id: string }>(
				`UPDATE public.queue_jobs
				SET
					status = 'completed',
					processing_token = NULL,
					completed_at = now(),
					updated_at = now(),
					result = $3::jsonb,
					error_message = NULL
				WHERE id = $1 AND status = 'processing' AND processing_token = $2
				RETURNING id`,
				[input.queueRowId, input.processingToken, JSON.stringify(resultPayload)]
			);
			if (queueUpdate.rowCount !== 1) throw ownershipChanged('queue');

			const stepUpdate = await client.query<{ id: string; run_id: string }>(
				`UPDATE libri.research_steps
				SET
					status = 'completed',
					result = $6::jsonb,
					active_processing_token = NULL,
					lease_token = NULL,
					lease_owner = NULL,
					leased_at = NULL,
					lease_expires_at = NULL,
					last_heartbeat_at = now(),
					provider = $7,
					model = $8,
					prompt_tokens = $9,
					completion_tokens = $10,
					estimated_cost_microusd = $11,
					completed_at = now(),
					error_class = NULL,
					error_message = NULL,
					updated_at = now()
				WHERE id = $1
					AND active_queue_job_id = $2
					AND active_processing_token = $3
					AND execution_generation = $4
					AND lease_token = $5
					AND status = 'leased'
				RETURNING id, run_id`,
				[
					input.stepId,
					input.queueRowId,
					input.processingToken,
					input.executionGeneration,
					input.leaseToken,
					JSON.stringify(resultPayload),
					receipt.provider,
					receipt.model,
					input.promptTokens.toString(),
					input.completionTokens.toString(),
					input.actualCostMicrousd.toString()
				]
			);
			const runId = stepUpdate.rows[0]?.run_id;
			if (stepUpdate.rowCount !== 1 || !runId) throw ownershipChanged('step');

			await client.query(
				`UPDATE libri.research_runs
				SET completed_steps = completed_steps + 1,
					last_progress_at = now(), updated_at = now()
				WHERE id = $1`,
				[runId]
			);
			const remaining = await client.query<{ remaining_steps: string }>(
				`SELECT count(*)::text AS remaining_steps
				FROM libri.research_steps
				WHERE run_id = $1
					AND status NOT IN (
						'completed', 'failed', 'cancelled', 'skipped',
						'needs_review', 'dead_letter'
					)`,
				[runId]
			);
			if (
				readNonnegativeBigint(remaining.rows[0]?.remaining_steps, 'remaining_steps') === 0n
			) {
				await client.query(
					`UPDATE libri.research_runs
					SET
						status = CASE
							WHEN cancel_requested_at IS NOT NULL THEN 'cancelled'
							WHEN (dead_letter_steps > 0 OR failed_steps > 0)
								AND completed_steps > 0 THEN 'partial'
							WHEN dead_letter_steps > 0 OR failed_steps > 0 THEN 'failed'
							ELSE 'completed'
						END,
						finished_at = now(),
						updated_at = now()
					WHERE id = $1`,
					[runId]
				);
			}
			return receipt;
		});
	}
}

async function lockQueueOwnership(
	client: LibriTransactionClient,
	input: LibriOcrOwnership
): Promise<boolean> {
	const lock = await client.query<{ id: string }>(
		`SELECT id
		FROM public.queue_jobs
		WHERE id = $1
			AND status = 'processing'
			AND processing_token = $2
			AND job_type = 'libri_ingest'::public.queue_type
		FOR UPDATE`,
		[input.queueRowId, input.processingToken]
	);
	return lock.rowCount === 1;
}

async function withTransaction<T>(
	pool: LibriTransactionalPool,
	operation: (client: LibriTransactionClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await operation(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

function validateIdentity(input: AuthorizeLibriOcrProviderInput): void {
	assertUuid(input.queueRowId, 'queueRowId');
	assertUuid(input.processingToken, 'processingToken');
	assertUuid(input.stepId, 'stepId');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration <= 0) {
		throw new Error('Libri OCR executionGeneration must be a positive integer');
	}
	assertUuid(input.leaseToken, 'leaseToken');
	assertUuid(input.reservationId, 'reservationId');
	assertUuid(input.imageId, 'imageId');
}

function validateCompletion(input: CompleteLibriOcrStepInput): void {
	validateIdentity(input);
	normalizeText(input.extractedText, 100_000, 'extractedText');
	normalizeText(input.summary, 1_000, 'summary');
	if (input.language !== undefined) normalizeText(input.language, 64, 'language');
	if (
		input.confidence !== undefined &&
		(!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
	) {
		throw new Error('Libri OCR confidence must be between 0 and 1');
	}
	assertNonnegativeBigint(input.actualCostMicrousd, 'actualCostMicrousd');
	assertNonnegativeBigint(input.promptTokens, 'promptTokens');
	assertNonnegativeBigint(input.completionTokens, 'completionTokens');
	normalizeText(input.providerRequestId, 256, 'providerRequestId');
}

function readAuthorization(rows: AuthorizationRow[]): AuthorizeLibriOcrProviderReceipt {
	if (rows.length !== 1) throw invalidReceipt(`authorization returned ${rows.length} rows`);
	const row = rows[0];
	const outcome = readOutcome(row.outcome);
	if (typeof row.authorized !== 'boolean' || row.authorized !== (outcome === 'started')) {
		if (!(row.authorized === false && outcome === 'started')) {
			throw invalidReceipt('authorization flag contradicted outcome');
		}
	}
	const maxOutputChars = readNullableInteger(
		row.max_output_chars,
		1,
		100_000,
		'max_output_chars'
	);
	const provider = readNullableText(row.provider, 64, 'provider');
	const model = readNullableText(row.model, 120, 'model');
	if (model !== null && !MODEL_PATTERN.test(model)) throw invalidReceipt('model was invalid');
	if (row.authorized && (maxOutputChars === null || provider === null || model === null)) {
		throw invalidReceipt('authorized call omitted execution metadata');
	}
	return { authorized: row.authorized, outcome, maxOutputChars, provider, model };
}

function readCompletion(rows: CompletionRow[]): CompleteLibriOcrStepReceipt {
	if (rows.length !== 1) throw invalidReceipt(`completion returned ${rows.length} rows`);
	const row = rows[0];
	const outcome = readOutcome(row.outcome);
	if (typeof row.accepted !== 'boolean' || row.accepted !== (outcome === 'settled')) {
		throw invalidReceipt('completion flag contradicted outcome');
	}
	const sourceChunkId = readNullableUuid(row.source_chunk_id, 'source_chunk_id');
	const ocrVersion = readNullableInteger(row.ocr_version, 1, 2_147_483_647, 'ocr_version');
	const provider = readNullableText(row.provider, 64, 'provider');
	const model = readNullableText(row.model, 120, 'model');
	const contentSha256 = row.content_sha256;
	if (contentSha256 !== null && !SHA256_PATTERN.test(contentSha256)) {
		throw invalidReceipt('content_sha256 was invalid');
	}
	if (model !== null && !MODEL_PATTERN.test(model)) throw invalidReceipt('model was invalid');
	if (
		row.accepted &&
		(sourceChunkId === null ||
			ocrVersion === null ||
			provider === null ||
			model === null ||
			contentSha256 === null)
	) {
		throw invalidReceipt('accepted completion omitted durable identities');
	}
	if (typeof row.over_budget !== 'boolean') throw invalidReceipt('over_budget was not boolean');
	return {
		accepted: row.accepted,
		outcome,
		sourceChunkId,
		ocrVersion,
		provider,
		model,
		contentSha256,
		overBudget: row.over_budget,
		totalSpentMicrousd: readNonnegativeBigint(row.total_spent_microusd, 'total_spent_microusd'),
		remainingMicrousd: readNonnegativeBigint(row.remaining_microusd, 'remaining_microusd')
	};
}

function staleAuthorization(): AuthorizeLibriOcrProviderReceipt {
	return {
		authorized: false,
		outcome: 'stale',
		maxOutputChars: null,
		provider: null,
		model: null
	};
}

function staleCompletion(): CompleteLibriOcrStepReceipt {
	return {
		accepted: false,
		outcome: 'stale',
		sourceChunkId: null,
		ocrVersion: null,
		provider: null,
		model: null,
		contentSha256: null,
		overBudget: false,
		totalSpentMicrousd: 0n,
		remainingMicrousd: 0n
	};
}

function assertUuid(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
		throw new Error(`Libri OCR ${name} must be a UUID`);
	}
}

function assertNonnegativeBigint(value: bigint, name: string): void {
	if (typeof value !== 'bigint' || value < 0n || value > MAX_BIGINT) {
		throw new Error(`Libri OCR ${name} must be a nonnegative bigint`);
	}
}

function normalizeText(value: unknown, maximum: number, name: string): string {
	if (typeof value !== 'string') throw new Error(`Libri OCR ${name} must be text`);
	const normalized = value.trim();
	if (normalized.length < 1 || normalized.length > maximum) {
		throw new Error(`Libri OCR ${name} must contain 1 to ${maximum} characters`);
	}
	return normalized;
}

function readOutcome(value: unknown): OcrExecutionOutcome {
	if (typeof value !== 'string' || !OCR_EXECUTION_OUTCOMES.has(value as OcrExecutionOutcome)) {
		throw invalidReceipt('outcome was unsupported');
	}
	return value as OcrExecutionOutcome;
}

function readNullableUuid(value: unknown, name: string): string | null {
	if (value === null) return null;
	if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
		throw invalidReceipt(`${name} was not a UUID`);
	}
	return value;
}

function readNullableInteger(
	value: unknown,
	minimum: number,
	maximum: number,
	name: string
): number | null {
	if (value === null) return null;
	if (
		!Number.isSafeInteger(value) ||
		(value as number) < minimum ||
		(value as number) > maximum
	) {
		throw invalidReceipt(`${name} was not a bounded integer`);
	}
	return value as number;
}

function readNullableText(value: unknown, maximum: number, name: string): string | null {
	if (value === null) return null;
	if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
		throw invalidReceipt(`${name} was not bounded text`);
	}
	return value;
}

function readNonnegativeBigint(value: unknown, name: string): bigint {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) {
		throw invalidReceipt(`${name} was not an integer`);
	}
	const parsed = BigInt(value);
	if (parsed > MAX_BIGINT) throw invalidReceipt(`${name} exceeded bigint`);
	return parsed;
}

function ownershipChanged(name: string): Error {
	return new Error(`Libri OCR ${name} completion ownership changed`);
}

function invalidReceipt(reason: string): Error {
	return new Error(`Invalid Libri database receipt: ${reason}`);
}
