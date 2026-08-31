import type { QueryResult } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { LibriTransactionClient } from '../src/workers/libri/lifecycle';
import {
	createLibriOcrExecution,
	type CompleteLibriOcrStepInput
} from '../src/workers/libri/ocrExecution';

const QUEUE_ROW_ID = 'c1000000-0000-4000-8000-000000000001';
const PROCESSING_TOKEN = 'c2000000-0000-4000-8000-000000000001';
const STEP_ID = 'c3000000-0000-4000-8000-000000000001';
const RUN_ID = 'c4000000-0000-4000-8000-000000000001';
const LEASE_TOKEN = 'c5000000-0000-4000-8000-000000000001';
const RESERVATION_ID = 'c6000000-0000-4000-8000-000000000001';
const IMAGE_ID = 'c7000000-0000-4000-8000-000000000001';
const SOURCE_CHUNK_ID = 'c8000000-0000-4000-8000-000000000001';
const CONTENT_SHA256 = 'a'.repeat(64);

describe('Libri atomic OCR execution', () => {
	it('locks the exact queue row before atomically authorizing provider authority and image ownership', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.startsWith('SELECT id FROM public.queue_jobs'))
				return result([{ id: QUEUE_ROW_ID }]);
			if (sql.includes('libri.authorize_ocr_provider_call')) {
				return result([
					{
						authorized: true,
						outcome: 'started',
						max_output_chars: 100_000,
						provider: 'openrouter',
						model: 'openai/gpt-4.1-mini'
					}
				]);
			}
			return result([]);
		});
		const execution = createLibriOcrExecution(harness.pool);

		await expect(execution.authorizeOcrProviderCall(identity())).resolves.toEqual({
			authorized: true,
			outcome: 'started',
			maxOutputChars: 100_000,
			provider: 'openrouter',
			model: 'openai/gpt-4.1-mini'
		});
		expect(harness.statements[0]?.sql).toBe('BEGIN');
		expect(harness.statements[1]?.sql).toContain("job_type = 'libri_ingest'");
		expect(harness.statements[2]?.sql).toContain('libri.authorize_ocr_provider_call');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
		expect(harness.release).toHaveBeenCalledOnce();
	});

	it('does not call the database capability after queue ownership is stale', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.startsWith('SELECT id FROM public.queue_jobs')) return result([]);
			return result([]);
		});
		const execution = createLibriOcrExecution(harness.pool);

		await expect(execution.authorizeOcrProviderCall(identity())).resolves.toMatchObject({
			authorized: false,
			outcome: 'stale'
		});
		expect(harness.joinedSql()).not.toContain('libri.authorize_ocr_provider_call');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
	});

	it('persists, settles, and completes queue, step, and run in one transaction', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.startsWith('SELECT id FROM public.queue_jobs'))
				return result([{ id: QUEUE_ROW_ID }]);
			if (sql.includes('libri.persist_and_settle_ocr_result'))
				return result([completionRow()]);
			if (sql.startsWith('UPDATE public.queue_jobs')) return result([{ id: QUEUE_ROW_ID }]);
			if (sql.startsWith('UPDATE libri.research_steps')) {
				return result([{ id: STEP_ID, run_id: RUN_ID }]);
			}
			if (sql.includes('count(*)::text AS remaining_steps')) {
				return result([{ remaining_steps: '0' }]);
			}
			return result([]);
		});
		const execution = createLibriOcrExecution(harness.pool);

		await expect(execution.completeOcrStep(completionInput())).resolves.toEqual({
			accepted: true,
			outcome: 'settled',
			sourceChunkId: SOURCE_CHUNK_ID,
			ocrVersion: 1,
			provider: 'openrouter',
			model: 'openai/gpt-4.1-mini',
			contentSha256: CONTENT_SHA256,
			overBudget: false,
			totalSpentMicrousd: 1234n,
			remainingMicrousd: 998766n
		});
		const sql = harness.joinedSql();
		expect(sql.indexOf('libri.persist_and_settle_ocr_result')).toBeLessThan(
			sql.indexOf('UPDATE public.queue_jobs')
		);
		expect(sql).toContain('UPDATE libri.research_steps');
		expect(sql).toContain('completed_steps = completed_steps + 1');
		expect(sql).toContain("ELSE 'completed'");
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
		const persistenceValues = harness.statements.find((statement) =>
			statement.sql.includes('persist_and_settle_ocr_result')
		)?.values;
		expect(persistenceValues?.slice(-4)).toEqual(['1234', '25', '9', 'openrouter-request-1']);
	});

	it('does not mutate queue or lifecycle state when persistence rejects the fence', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.startsWith('SELECT id FROM public.queue_jobs'))
				return result([{ id: QUEUE_ROW_ID }]);
			if (sql.includes('libri.persist_and_settle_ocr_result')) {
				return result([
					{
						...completionRow(),
						accepted: false,
						outcome: 'stale',
						source_chunk_id: null,
						ocr_version: null,
						provider: null,
						model: null,
						content_sha256: null,
						total_spent_microusd: '0',
						remaining_microusd: '0'
					}
				]);
			}
			return result([]);
		});
		const execution = createLibriOcrExecution(harness.pool);

		await expect(execution.completeOcrStep(completionInput())).resolves.toMatchObject({
			accepted: false,
			outcome: 'stale'
		});
		expect(harness.joinedSql()).not.toContain('UPDATE public.queue_jobs');
		expect(harness.joinedSql()).not.toContain('UPDATE libri.research_steps');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
	});

	it('rolls back persisted OCR and settled cost if queue completion fails', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.startsWith('SELECT id FROM public.queue_jobs'))
				return result([{ id: QUEUE_ROW_ID }]);
			if (sql.includes('libri.persist_and_settle_ocr_result'))
				return result([completionRow()]);
			if (sql.startsWith('UPDATE public.queue_jobs')) throw new Error('queue write failed');
			return result([]);
		});
		const execution = createLibriOcrExecution(harness.pool);

		await expect(execution.completeOcrStep(completionInput())).rejects.toThrow(
			'queue write failed'
		);
		expect(harness.statements.at(-1)?.sql).toBe('ROLLBACK');
		expect(harness.release).toHaveBeenCalledOnce();
	});

	it('validates identifiers, content, confidence, and bigint usage before connecting', async () => {
		const harness = fakeTransaction(() => result([]));
		const execution = createLibriOcrExecution(harness.pool);

		expect(() =>
			execution.authorizeOcrProviderCall({ ...identity(), imageId: 'not-a-uuid' })
		).toThrow('imageId');
		expect(() =>
			execution.completeOcrStep({ ...completionInput(), extractedText: ' ' })
		).toThrow('extractedText');
		expect(() => execution.completeOcrStep({ ...completionInput(), confidence: 2 })).toThrow(
			'confidence'
		);
		expect(() =>
			execution.completeOcrStep({ ...completionInput(), actualCostMicrousd: -1n })
		).toThrow('actualCostMicrousd');
		expect(harness.connect).not.toHaveBeenCalled();
	});
});

function identity() {
	return {
		queueRowId: QUEUE_ROW_ID,
		processingToken: PROCESSING_TOKEN,
		stepId: STEP_ID,
		executionGeneration: 1,
		leaseToken: LEASE_TOKEN,
		reservationId: RESERVATION_ID,
		imageId: IMAGE_ID
	};
}

function completionInput(): CompleteLibriOcrStepInput {
	return {
		...identity(),
		extractedText: 'Atomic OCR text',
		summary: 'One sentence summary.',
		confidence: 0.95,
		language: 'en',
		actualCostMicrousd: 1234n,
		promptTokens: 25n,
		completionTokens: 9n,
		providerRequestId: 'openrouter-request-1'
	};
}

function completionRow() {
	return {
		accepted: true,
		outcome: 'settled',
		source_chunk_id: SOURCE_CHUNK_ID,
		ocr_version: 1,
		provider: 'openrouter',
		model: 'openai/gpt-4.1-mini',
		content_sha256: CONTENT_SHA256,
		over_budget: false,
		total_spent_microusd: '1234',
		remaining_microusd: '998766'
	};
}

function fakeTransaction(
	handler: (
		sql: string,
		values: readonly unknown[] | undefined
	) => QueryResult<Record<string, unknown>>
) {
	const statements: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];
	const release = vi.fn();
	const client: LibriTransactionClient = {
		async query<T extends Record<string, unknown> = Record<string, unknown>>(
			text: string,
			values?: readonly unknown[]
		): Promise<QueryResult<T>> {
			const sql = text.replace(/\s+/g, ' ').trim();
			statements.push({ sql, values });
			return handler(sql, values) as QueryResult<T>;
		},
		release
	};
	const connect = vi.fn(async () => client);
	return {
		pool: { connect },
		connect,
		release,
		statements,
		joinedSql: () => statements.map((statement) => statement.sql).join('\n')
	};
}

function result<T extends Record<string, unknown>>(
	rows: T[],
	rowCount: number = rows.length
): QueryResult<T> {
	return {
		command: '',
		rowCount,
		oid: 0,
		fields: [],
		rows
	};
}
