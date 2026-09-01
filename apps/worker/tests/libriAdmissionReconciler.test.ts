// apps/worker/tests/libriAdmissionReconciler.test.ts
import type { QueryResult } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createLibriAdmissionReconciler } from '../src/workers/libri/admissionReconciler';
import {
	hashLibriOcrAdmissionManifest,
	libriOcrQueueMetadata
} from '../src/workers/libri/ocrAdmissionContract';
import type { LibriTransactionClient } from '../src/workers/libri/lifecycle';

const ADMISSION_ID = '10000000-0000-4000-8000-000000000001';
const LIBRARY_ID = '20000000-0000-4000-8000-000000000001';
const RUN_ID = '30000000-0000-4000-8000-000000000001';
const BOOK_ID = '40000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '50000000-0000-4000-8000-000000000001';
const STEP_IDS = ['60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002'];
const IMAGE_IDS = ['70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002'];

const manifest = STEP_IDS.map((stepId, position) => ({
	step_id: stepId,
	image_id: IMAGE_IDS[position]!,
	position,
	expected_ocr_version: position + 1,
	image_content_sha256: String(position + 1).repeat(64),
	payload_version: 1,
	payload: {
		version: 1,
		kind: 'ocr_image',
		imageId: IMAGE_IDS[position]!,
		expectedOcrVersion: position + 1,
		maxOutputChars: 50_000
	},
	step_status: 'pending',
	step_queue_family: 'libri_ingest',
	step_kind: 'ocr_image',
	attempts: 0,
	max_attempts: 1,
	active_queue_job_id: null
}));

const currentImages = IMAGE_IDS.map((imageId, position) => ({
	image_id: imageId,
	book_id: BOOK_ID,
	content_sha256: String(position + 1).repeat(64),
	ocr_status: position === 0 ? 'pending' : 'failed',
	ocr_version: position
}));

const identity = {
	admission_id: ADMISSION_ID,
	library_id: LIBRARY_ID,
	run_id: RUN_ID,
	book_id: BOOK_ID,
	correlation_id: CORRELATION_ID,
	manifest_sha256: ''
};
const MANIFEST_SHA256 = hashLibriOcrAdmissionManifest(identity, manifest);

describe('Libri OCR admission reconciler', () => {
	it('reports a confirmed exact batch ready without taking locks or writing', async () => {
		const harness = auditHarness(admissionContext(), manifest, []);
		const reconciler = createLibriAdmissionReconciler(harness.pool);

		await expect(reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })).resolves.toEqual({
			admissionId: ADMISSION_ID,
			runId: RUN_ID,
			status: 'confirmed',
			classification: 'confirmed_ready',
			healthy: true,
			manifestSha256: MANIFEST_SHA256,
			manifestItems: 2,
			queueReceipts: 0,
			issues: []
		});
		expect(harness.statements[0]).toBe(
			'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'
		);
		expect(harness.statements.at(-1)).toBe('COMMIT');
		expect(harness.joinedSql()).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/);
	});

	it('reports an enqueued admission consistent only when every durable receipt matches', async () => {
		const enqueuedManifest = manifest.map((item, position) => ({
			...item,
			step_status: 'queued',
			active_queue_job_id: `80000000-0000-4000-8000-00000000000${position + 1}`
		}));
		const context = admissionContext({ admission_status: 'enqueued' });
		const queueReceipts = enqueuedManifest.map((item, position) => ({
			id: `80000000-0000-4000-8000-00000000000${position + 1}`,
			queue_job_id: `libri_ingest_existing_${position}`,
			job_type: 'libri_ingest',
			metadata: libriOcrQueueMetadata(context, item),
			status: 'pending'
		}));
		const reconciler = createLibriAdmissionReconciler(
			auditHarness(context, enqueuedManifest, queueReceipts).pool
		);

		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			status: 'enqueued',
			classification: 'enqueued_consistent',
			healthy: true,
			manifestItems: 2,
			queueReceipts: 2,
			issues: []
		});
	});

	it('classifies a stale confirmed admission as blocked without scanning unlinked queue rows', async () => {
		const reconciler = createLibriAdmissionReconciler(
			auditHarness(admissionContext({ dispatch_window_open: false }), manifest, [
				{
					id: '80000000-0000-4000-8000-000000000001',
					queue_job_id: 'unexpected',
					job_type: 'libri_ingest',
					metadata: libriOcrQueueMetadata(admissionContext(), manifest[0]!),
					status: 'pending'
				}
			]).pool
		);

		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'confirmed_blocked',
			healthy: false,
			issues: ['confirmed_run_not_dispatchable']
		});
	});

	it('classifies an enqueued admission with a missing receipt as incomplete', async () => {
		const context = admissionContext({ admission_status: 'enqueued' });
		const enqueuedManifest = manifest.map((item, position) => ({
			...item,
			step_status: 'queued',
			active_queue_job_id: `80000000-0000-4000-8000-00000000000${position + 1}`
		}));
		const reconciler = createLibriAdmissionReconciler(
			auditHarness(context, enqueuedManifest, [
				{
					id: '80000000-0000-4000-8000-000000000001',
					queue_job_id: 'only-one',
					job_type: 'libri_ingest',
					metadata: libriOcrQueueMetadata(context, enqueuedManifest[0]!),
					status: 'pending'
				}
			]).pool
		);

		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'enqueued_incomplete',
			healthy: false,
			queueReceipts: 1,
			issues: ['enqueued_queue_receipt_count_mismatch']
		});
	});

	it('blocks a confirmed admission when the current image or payload changed', async () => {
		const changedManifest = manifest.map((item, position) =>
			position === 0 ? { ...item, payload: { ...item.payload, maxOutputChars: 1 } } : item
		);
		const changedImages = currentImages.map((image, position) =>
			position === 1 ? { ...image, content_sha256: 'f'.repeat(64) } : image
		);
		const reconciler = createLibriAdmissionReconciler(
			auditHarness(admissionContext(), changedManifest, [], changedImages).pool
		);

		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'confirmed_blocked',
			healthy: false,
			issues: ['manifest_identity_changed', 'confirmed_images_not_dispatchable']
		});
	});

	it('rejects an enqueued receipt whose research step no longer points to that queue row', async () => {
		const enqueuedManifest = manifest.map((item, position) => ({
			...item,
			step_status: 'queued',
			active_queue_job_id:
				position === 0
					? '80000000-0000-4000-8000-000000000099'
					: `80000000-0000-4000-8000-00000000000${position + 1}`
		}));
		const context = admissionContext({ admission_status: 'enqueued' });
		const queueReceipts = enqueuedManifest.map((item, position) => ({
			id: `80000000-0000-4000-8000-00000000000${position + 1}`,
			queue_job_id: `libri_ingest_existing_${position}`,
			job_type: 'libri_ingest',
			metadata: libriOcrQueueMetadata(context, item),
			status: 'pending'
		}));
		const reconciler = createLibriAdmissionReconciler(
			auditHarness(context, enqueuedManifest, queueReceipts).pool
		);

		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'enqueued_incomplete',
			healthy: false,
			issues: ['enqueued_step_queue_link_mismatch']
		});
	});

	it('rejects an enqueued receipt whose queue and step lifecycle states disagree', async () => {
		const enqueuedManifest = manifest.map((item, position) => ({
			...item,
			step_status: position === 0 ? 'leased' : 'queued',
			attempts: position === 0 ? 1 : 0,
			active_queue_job_id: `80000000-0000-4000-8000-00000000000${position + 1}`
		}));
		const context = admissionContext({ admission_status: 'enqueued' });
		const queueReceipts = enqueuedManifest.map((item, position) => ({
			id: `80000000-0000-4000-8000-00000000000${position + 1}`,
			queue_job_id: `libri_ingest_existing_${position}`,
			job_type: 'libri_ingest',
			metadata: libriOcrQueueMetadata(context, item),
			status: 'pending'
		}));
		const reconciler = createLibriAdmissionReconciler(
			auditHarness(context, enqueuedManifest, queueReceipts).pool
		);

		await expect(
			reconciler.auditOcrAdmission({ admissionId: ADMISSION_ID })
		).resolves.toMatchObject({
			classification: 'enqueued_incomplete',
			healthy: false,
			issues: ['enqueued_queue_step_state_mismatch']
		});
	});

	it('rejects a non-UUID before opening a database connection', () => {
		const harness = auditHarness(admissionContext(), manifest, []);
		const reconciler = createLibriAdmissionReconciler(harness.pool);

		expect(() => reconciler.auditOcrAdmission({ admissionId: 'all-admissions' })).toThrow(
			'admissionId must be a UUID'
		);
		expect(harness.connect).not.toHaveBeenCalled();
	});
});

function admissionContext(overrides: Record<string, unknown> = {}) {
	return {
		...identity,
		manifest_sha256: MANIFEST_SHA256,
		admission_status: 'confirmed',
		queue_family: 'libri_ingest',
		run_kind: 'ocr_book_batch',
		subject_type: 'book',
		requested_by: '90000000-0000-4000-8000-000000000001',
		library_created_by: '90000000-0000-4000-8000-000000000001',
		run_status: 'queued',
		cancel_requested_at: null,
		dispatch_window_open: true,
		planned_steps: 2,
		max_steps: 2,
		max_attempts_per_step: 1,
		max_concurrent_steps: 2,
		...overrides
	};
}

function auditHarness(
	context: Record<string, unknown>,
	manifestRows: Array<Record<string, unknown>>,
	queueRows: Array<Record<string, unknown>>,
	imageRows: Array<Record<string, unknown>> = currentImages
) {
	const statements: string[] = [];
	const release = vi.fn();
	const client: LibriTransactionClient = {
		async query<T extends Record<string, unknown> = Record<string, unknown>>(
			text: string
		): Promise<QueryResult<T>> {
			const sql = text.replace(/\s+/g, ' ').trim();
			statements.push(sql);
			if (sql.includes('FROM libri.ocr_batch_admissions admission')) {
				return result([context]) as QueryResult<T>;
			}
			if (sql.includes('FROM libri.ocr_batch_items item')) {
				return result(manifestRows) as QueryResult<T>;
			}
			if (sql.includes('FROM libri.images image')) {
				return result(imageRows) as QueryResult<T>;
			}
			if (sql.includes('FROM public.queue_jobs')) {
				return result(queueRows) as QueryResult<T>;
			}
			return result([]) as QueryResult<T>;
		},
		release
	};
	const connect = vi.fn(async () => client);
	return {
		pool: { connect },
		connect,
		statements,
		joinedSql: () => statements.join('\n')
	};
}

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
	return {
		command: 'SELECT',
		rowCount: rows.length,
		oid: 0,
		fields: [],
		rows
	};
}
