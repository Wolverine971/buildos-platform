import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { QueryResult } from 'pg';
import { createLibriAdmissionDispatcher } from '../src/workers/libri/admissionDispatcher';
import type { LibriTransactionClient } from '../src/workers/libri/lifecycle';

const ADMISSION_ID = '10000000-0000-4000-8000-000000000001';
const LIBRARY_ID = '20000000-0000-4000-8000-000000000001';
const RUN_ID = '30000000-0000-4000-8000-000000000001';
const BOOK_ID = '40000000-0000-4000-8000-000000000001';
const USER_ID = '50000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '60000000-0000-4000-8000-000000000001';
const STEP_IDS = ['70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002'];
const IMAGE_IDS = ['80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002'];
const QUEUE_ROW_IDS = [
	'90000000-0000-4000-8000-000000000001',
	'90000000-0000-4000-8000-000000000002'
];

const manifest = STEP_IDS.map((stepId, position) => ({
	step_id: stepId,
	image_id: IMAGE_IDS[position]!,
	position,
	expected_ocr_version: position + 1,
	image_content_sha256: String(position + 1).repeat(64),
	step_status: 'pending',
	queue_family: 'libri_ingest',
	step_kind: 'ocr_image',
	priority: 100,
	payload_version: 1,
	attempts: 0,
	max_attempts: 1,
	active_queue_job_id: null
}));

const MANIFEST_SHA256 = createHash('sha256')
	.update(
		JSON.stringify({
			version: 1,
			runId: RUN_ID,
			libraryId: LIBRARY_ID,
			bookId: BOOK_ID,
			items: manifest.map((item) => ({
				stepId: item.step_id,
				imageId: item.image_id,
				position: item.position,
				expectedOcrVersion: item.expected_ocr_version,
				imageContentSha256: item.image_content_sha256
			}))
		}),
		'utf8'
	)
	.digest('hex');

describe('Libri explicit OCR admission dispatcher', () => {
	it('atomically enqueues every manifest item and marks the admission enqueued last', async () => {
		let insertedJobs = 0;
		const harness = fakeTransaction((sql, values) => {
			if (sql.includes('FROM libri.ocr_batch_admissions admission')) {
				return result([admissionContext()]);
			}
			if (sql.includes('FROM libri.ocr_batch_items item')) return result(manifest);
			if (sql.includes('INSERT INTO public.queue_jobs')) {
				const index = insertedJobs++;
				return result([
					{
						id: QUEUE_ROW_IDS[index],
						queue_job_id: values?.[0],
						job_type: 'libri_ingest',
						metadata: JSON.parse(String(values?.[2])) as Record<string, unknown>,
						status: 'pending'
					}
				]);
			}
			if (sql.includes('UPDATE libri.research_steps')) {
				return result([{ id: values?.[0] }]);
			}
			if (sql.includes('UPDATE libri.ocr_batch_admissions')) {
				return result([{ id: ADMISSION_ID }]);
			}
			return result([]);
		});
		const dispatcher = createLibriAdmissionDispatcher(harness.pool);

		const receipt = await dispatcher.dispatchOcrAdmission({ admissionId: ADMISSION_ID });

		expect(receipt).toMatchObject({
			admissionId: ADMISSION_ID,
			runId: RUN_ID,
			manifestSha256: MANIFEST_SHA256,
			created: true,
			jobs: [
				{ stepId: STEP_IDS[0], queueRowId: QUEUE_ROW_IDS[0], created: true },
				{ stepId: STEP_IDS[1], queueRowId: QUEUE_ROW_IDS[1], created: true }
			]
		});
		expect(insertedJobs).toBe(2);
		expect(harness.statements[0]?.sql).toBe('BEGIN');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
		expect(harness.joinedSql()).toContain('FOR UPDATE OF run');
		expect(harness.joinedSql()).toContain('FOR UPDATE OF step');
		expect(harness.joinedSql()).toContain('ON CONFLICT (dedup_key)');
		expect(
			harness.statements.findLastIndex((statement) =>
				statement.sql.includes('UPDATE libri.ocr_batch_admissions')
			)
		).toBe(harness.statements.length - 2);
		expect(harness.release).toHaveBeenCalledOnce();
	});

	it('replays an already-enqueued admission without creating or relinking work', async () => {
		const enqueuedManifest = manifest.map((item, position) => ({
			...item,
			step_status: 'queued',
			active_queue_job_id: QUEUE_ROW_IDS[position]
		}));
		const queueJobs = enqueuedManifest.map((item, position) => ({
			id: QUEUE_ROW_IDS[position],
			queue_job_id: `libri_ingest_existing_${position}`,
			job_type: 'libri_ingest',
			metadata: queueMetadata(item, position),
			status: 'pending'
		}));
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM libri.ocr_batch_admissions admission')) {
				return result([admissionContext({ admission_status: 'enqueued' })]);
			}
			if (sql.includes('FROM libri.ocr_batch_items item')) return result(enqueuedManifest);
			if (sql.includes("metadata->>'libriAdmissionId'")) return result(queueJobs);
			return result([]);
		});
		const dispatcher = createLibriAdmissionDispatcher(harness.pool);

		await expect(
			dispatcher.dispatchOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			created: false,
			jobs: [{ created: false }, { created: false }]
		});
		expect(harness.joinedSql()).not.toContain('INSERT INTO public.queue_jobs');
		expect(harness.joinedSql()).not.toContain('UPDATE libri.research_steps');
		expect(harness.joinedSql()).not.toContain('UPDATE libri.ocr_batch_admissions');
		expect(harness.statements.at(-1)?.sql).toBe('COMMIT');
	});

	it('rolls back before queue mutation when the confirmed manifest hash changed', async () => {
		const harness = fakeTransaction((sql) => {
			if (sql.includes('FROM libri.ocr_batch_admissions admission')) {
				return result([admissionContext({ manifest_sha256: 'f'.repeat(64) })]);
			}
			if (sql.includes('FROM libri.ocr_batch_items item')) return result(manifest);
			return result([]);
		});
		const dispatcher = createLibriAdmissionDispatcher(harness.pool);

		await expect(
			dispatcher.dispatchOcrAdmission({ admissionId: ADMISSION_ID })
		).rejects.toThrow('manifest hash changed');
		expect(harness.joinedSql()).not.toContain('INSERT INTO public.queue_jobs');
		expect(harness.statements.at(-1)?.sql).toBe('ROLLBACK');
	});

	it('rolls back every queue and step write when any batch insert fails', async () => {
		let insertCount = 0;
		const harness = fakeTransaction((sql, values) => {
			if (sql.includes('FROM libri.ocr_batch_admissions admission')) {
				return result([admissionContext()]);
			}
			if (sql.includes('FROM libri.ocr_batch_items item')) return result(manifest);
			if (sql.includes('INSERT INTO public.queue_jobs')) {
				if (insertCount++ === 1) throw new Error('second insert failed');
				return result([
					{
						id: QUEUE_ROW_IDS[0],
						queue_job_id: values?.[0],
						job_type: 'libri_ingest',
						metadata: JSON.parse(String(values?.[2])) as Record<string, unknown>,
						status: 'pending'
					}
				]);
			}
			if (sql.includes('UPDATE libri.research_steps')) return result([{ id: STEP_IDS[0] }]);
			return result([]);
		});
		const dispatcher = createLibriAdmissionDispatcher(harness.pool);

		await expect(
			dispatcher.dispatchOcrAdmission({ admissionId: ADMISSION_ID })
		).rejects.toThrow('second insert failed');
		expect(harness.joinedSql()).not.toContain('UPDATE libri.ocr_batch_admissions');
		expect(harness.statements.at(-1)?.sql).toBe('ROLLBACK');
		expect(harness.release).toHaveBeenCalledOnce();
	});

	it('validates the exact admission scope before opening a connection', () => {
		const harness = fakeTransaction(() => result([]));
		const dispatcher = createLibriAdmissionDispatcher(harness.pool);

		expect(() => dispatcher.dispatchOcrAdmission({ admissionId: 'not-a-uuid' })).toThrow(
			'admissionId must be a UUID'
		);
		expect(harness.connect).not.toHaveBeenCalled();
	});
});

function admissionContext(overrides: Record<string, unknown> = {}) {
	return {
		admission_id: ADMISSION_ID,
		library_id: LIBRARY_ID,
		run_id: RUN_ID,
		manifest_sha256: MANIFEST_SHA256,
		admission_status: 'confirmed',
		queue_family: 'libri_ingest',
		run_kind: 'ocr_book_batch',
		subject_type: 'book',
		book_id: BOOK_ID,
		requested_by: USER_ID,
		run_status: 'queued',
		cancel_requested_at: null,
		dispatch_window_open: true,
		planned_steps: 2,
		max_steps: 2,
		max_attempts_per_step: 1,
		max_concurrent_steps: 2,
		correlation_id: CORRELATION_ID,
		library_created_by: USER_ID,
		...overrides
	};
}

function queueMetadata(item: (typeof manifest)[number], position: number) {
	return {
		correlationId: CORRELATION_ID,
		libraryId: LIBRARY_ID,
		researchRunId: RUN_ID,
		researchStepId: item.step_id,
		payloadVersion: 1,
		libriAdmissionId: ADMISSION_ID,
		libriManifestSha256: MANIFEST_SHA256,
		libriBatchPosition: position
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
