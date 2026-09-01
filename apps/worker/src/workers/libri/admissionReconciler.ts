// apps/worker/src/workers/libri/admissionReconciler.ts
import type { LibriTransactionClient, LibriTransactionalPool } from './lifecycle';
import {
	LIBRI_SHA256_PATTERN,
	LIBRI_UUID_PATTERN,
	type LibriOcrAdmissionIdentity,
	type LibriOcrManifestIdentity,
	type LibriOcrQueueReceipt,
	hashLibriOcrAdmissionManifest,
	libriOcrQueueReceiptMatchesItem,
	libriOcrQueueReceiptMatchesStepState
} from './ocrAdmissionContract';

const MAXIMUM_BATCH_SIZE = 10;
const MAXIMUM_OUTPUT_CHARS = 50_000;

export type AuditLibriOcrAdmissionInput = {
	admissionId: string;
};

export type LibriOcrAdmissionAuditClassification =
	| 'confirmed_ready'
	| 'confirmed_blocked'
	| 'enqueued_consistent'
	| 'enqueued_incomplete';

export type LibriOcrAdmissionAuditReceipt = {
	admissionId: string;
	runId: string;
	status: 'confirmed' | 'enqueued';
	classification: LibriOcrAdmissionAuditClassification;
	healthy: boolean;
	manifestSha256: string;
	manifestItems: number;
	queueReceipts: number;
	issues: string[];
};

export type LibriAdmissionReconcilerPort = {
	auditOcrAdmission: (
		input: AuditLibriOcrAdmissionInput
	) => Promise<LibriOcrAdmissionAuditReceipt>;
};

type AuditContextRow = LibriOcrAdmissionIdentity & {
	admission_status: string;
	queue_family: string;
	run_kind: string;
	subject_type: string;
	requested_by: string | null;
	library_created_by: string;
	run_status: string;
	cancel_requested_at: string | null;
	dispatch_window_open: boolean;
	planned_steps: number;
	max_steps: number;
	max_attempts_per_step: number;
	max_concurrent_steps: number;
};

type AuditManifestRow = LibriOcrManifestIdentity & {
	payload: Record<string, unknown> | null;
	step_status: string | null;
	step_queue_family: string | null;
	step_kind: string | null;
	attempts: number | null;
	max_attempts: number | null;
	active_queue_job_id: string | null;
};

type AuditCurrentImageRow = {
	image_id: string;
	book_id: string | null;
	content_sha256: string;
	ocr_status: string;
	ocr_version: number;
};

export function createLibriAdmissionReconciler(
	pool: LibriTransactionalPool
): LibriAdmissionReconcilerPort {
	return new LibriAdmissionReconciler(pool);
}

class LibriAdmissionReconciler implements LibriAdmissionReconcilerPort {
	constructor(private readonly pool: LibriTransactionalPool) {}

	auditOcrAdmission(input: AuditLibriOcrAdmissionInput): Promise<LibriOcrAdmissionAuditReceipt> {
		if (!LIBRI_UUID_PATTERN.test(input.admissionId)) {
			throw new Error('admissionId must be a UUID');
		}

		return withReadOnlySnapshot(this.pool, async (client) => {
			const context = await loadContext(client, input.admissionId);
			const manifest = await loadManifest(client, context);
			const currentImages =
				context.admission_status === 'confirmed'
					? await loadCurrentImages(client, context, manifest)
					: [];
			const queueReceipts = await loadQueueReceipts(client, manifest);
			return reconcile(context, manifest, currentImages, queueReceipts);
		});
	}
}

async function loadContext(
	client: LibriTransactionClient,
	admissionId: string
): Promise<AuditContextRow> {
	const result = await client.query<AuditContextRow>(
		`SELECT
			admission.id AS admission_id,
			admission.library_id,
			admission.run_id,
			admission.manifest_sha256,
			admission.status AS admission_status,
			run.queue_family,
			run.kind AS run_kind,
			run.subject_type,
			run.subject_id AS book_id,
			run.requested_by,
			run.status AS run_status,
			run.cancel_requested_at,
			(run.deadline_at IS NOT NULL AND run.deadline_at > now()) AS dispatch_window_open,
			run.planned_steps,
			run.max_steps,
			run.max_attempts_per_step,
			run.max_concurrent_steps,
			run.correlation_id,
			library.created_by AS library_created_by
		FROM libri.ocr_batch_admissions admission
		JOIN libri.research_runs run
			ON run.library_id = admission.library_id AND run.id = admission.run_id
		JOIN libri.libraries library ON library.id = admission.library_id
		WHERE admission.id = $1`,
		[admissionId]
	);
	const context = result.rows[0];
	if (!context) throw new Error('Visible Libri OCR admission was not found');
	return context;
}

async function loadManifest(
	client: LibriTransactionClient,
	context: AuditContextRow
): Promise<AuditManifestRow[]> {
	const result = await client.query<AuditManifestRow>(
		`SELECT
			item.step_id,
			item.image_id,
			item.position,
			item.expected_ocr_version,
			item.image_content_sha256,
			step.payload_version,
			step.payload,
			step.status AS step_status,
			step.queue_family AS step_queue_family,
			step.kind AS step_kind,
			step.attempts,
			step.max_attempts,
			step.active_queue_job_id
		FROM libri.ocr_batch_items item
		LEFT JOIN libri.research_steps step
			ON step.library_id = item.library_id
			AND step.run_id = item.run_id
			AND step.id = item.step_id
		WHERE item.library_id = $1 AND item.run_id = $2
		ORDER BY item.position`,
		[context.library_id, context.run_id]
	);
	return result.rows;
}

async function loadCurrentImages(
	client: LibriTransactionClient,
	context: AuditContextRow,
	manifest: AuditManifestRow[]
): Promise<AuditCurrentImageRow[]> {
	const result = await client.query<AuditCurrentImageRow>(
		`SELECT
			image.id AS image_id,
			image.book_id,
			image.content_sha256,
			image.ocr_status::text,
			image.ocr_version
		FROM libri.images image
		WHERE image.library_id = $1 AND image.id = ANY($2::uuid[])
		ORDER BY image.id`,
		[context.library_id, manifest.map((item) => item.image_id)]
	);
	return result.rows;
}

async function loadQueueReceipts(
	client: LibriTransactionClient,
	manifest: AuditManifestRow[]
): Promise<LibriOcrQueueReceipt[]> {
	const queueRowIds = manifest
		.map((item) => item.active_queue_job_id)
		.filter((queueRowId): queueRowId is string => queueRowId !== null);
	if (queueRowIds.length === 0) return [];
	const result = await client.query<LibriOcrQueueReceipt>(
		`SELECT id, queue_job_id, job_type::text, metadata, status::text
		FROM public.queue_jobs
		WHERE id = ANY($1::uuid[])
		ORDER BY
			CASE
				WHEN metadata->>'libriBatchPosition' ~ '^[0-9]+$'
				THEN (metadata->>'libriBatchPosition')::integer
			END,
			id`,
		[queueRowIds]
	);
	return result.rows;
}

function reconcile(
	context: AuditContextRow,
	manifest: AuditManifestRow[],
	currentImages: AuditCurrentImageRow[],
	queueReceipts: LibriOcrQueueReceipt[]
): LibriOcrAdmissionAuditReceipt {
	const issues = immutableIssues(context, manifest);

	if (context.admission_status === 'confirmed') {
		if (
			context.run_status !== 'queued' ||
			context.cancel_requested_at !== null ||
			!context.dispatch_window_open
		) {
			issues.push('confirmed_run_not_dispatchable');
		}
		if (
			manifest.some(
				(item) =>
					item.step_status !== 'pending' ||
					item.step_queue_family !== 'libri_ingest' ||
					item.step_kind !== 'ocr_image' ||
					item.attempts !== 0 ||
					item.max_attempts !== 1 ||
					item.active_queue_job_id !== null
			)
		) {
			issues.push('confirmed_steps_not_dispatchable');
		}
		if (!currentImagesMatchManifest(context, manifest, currentImages)) {
			issues.push('confirmed_images_not_dispatchable');
		}
		if (queueReceipts.length !== 0) issues.push('confirmed_has_queue_receipts');
	} else if (context.admission_status === 'enqueued') {
		if (queueReceipts.length !== manifest.length) {
			issues.push('enqueued_queue_receipt_count_mismatch');
		}
		if (
			queueReceipts.some((queueJob, position) => {
				const item = manifest[position];
				return !item || !libriOcrQueueReceiptMatchesItem(queueJob, context, item);
			})
		) {
			issues.push('enqueued_queue_receipt_mismatch');
		}
		if (
			queueReceipts.some((queueJob, position) => {
				const item = manifest[position];
				return !item || item.active_queue_job_id !== queueJob.id;
			})
		) {
			issues.push('enqueued_step_queue_link_mismatch');
		}
		if (
			queueReceipts.some((queueJob, position) => {
				const item = manifest[position];
				return !item || !libriOcrQueueReceiptMatchesStepState(queueJob, item);
			})
		) {
			issues.push('enqueued_queue_step_state_mismatch');
		}
	} else {
		throw new Error(
			`Unsupported visible Libri OCR admission status: ${context.admission_status}`
		);
	}

	const uniqueIssues = [...new Set(issues)];
	const healthy = uniqueIssues.length === 0;
	const classification = classify(context.admission_status, healthy);
	return {
		admissionId: context.admission_id,
		runId: context.run_id,
		status: context.admission_status,
		classification,
		healthy,
		manifestSha256: context.manifest_sha256,
		manifestItems: manifest.length,
		queueReceipts: queueReceipts.length,
		issues: uniqueIssues
	};
}

function immutableIssues(context: AuditContextRow, manifest: AuditManifestRow[]): string[] {
	const issues: string[] = [];
	if (
		context.queue_family !== 'libri_ingest' ||
		context.run_kind !== 'ocr_book_batch' ||
		context.subject_type !== 'book' ||
		!context.book_id ||
		!LIBRI_UUID_PATTERN.test(context.book_id) ||
		!context.requested_by ||
		!LIBRI_UUID_PATTERN.test(context.requested_by) ||
		!LIBRI_UUID_PATTERN.test(context.correlation_id) ||
		!LIBRI_UUID_PATTERN.test(context.library_created_by) ||
		!LIBRI_SHA256_PATTERN.test(context.manifest_sha256)
	) {
		issues.push('batch_contract_changed');
	}
	if (
		manifest.length < 1 ||
		manifest.length > MAXIMUM_BATCH_SIZE ||
		context.planned_steps !== manifest.length ||
		context.max_steps !== manifest.length ||
		context.max_attempts_per_step !== 1 ||
		context.max_concurrent_steps !== Math.min(manifest.length, 2)
	) {
		issues.push('manifest_cardinality_changed');
	}

	const stepIds = new Set<string>();
	const imageIds = new Set<string>();
	for (const [position, item] of manifest.entries()) {
		if (
			item.position !== position ||
			!LIBRI_UUID_PATTERN.test(item.step_id) ||
			!LIBRI_UUID_PATTERN.test(item.image_id) ||
			!Number.isSafeInteger(item.expected_ocr_version) ||
			item.expected_ocr_version < 1 ||
			!LIBRI_SHA256_PATTERN.test(item.image_content_sha256) ||
			!stepPayloadMatchesManifestItem(item) ||
			stepIds.has(item.step_id) ||
			imageIds.has(item.image_id)
		) {
			issues.push('manifest_identity_changed');
		}
		stepIds.add(item.step_id);
		imageIds.add(item.image_id);
	}

	if (
		LIBRI_SHA256_PATTERN.test(context.manifest_sha256) &&
		hashLibriOcrAdmissionManifest(context, manifest) !== context.manifest_sha256
	) {
		issues.push('manifest_hash_changed');
	}
	return issues;
}

function currentImagesMatchManifest(
	context: AuditContextRow,
	manifest: AuditManifestRow[],
	currentImages: AuditCurrentImageRow[]
): boolean {
	const imageById = new Map(currentImages.map((image) => [image.image_id, image]));
	return manifest.every((item) => {
		const image = imageById.get(item.image_id);
		return Boolean(
			image &&
				image.book_id === context.book_id &&
				image.content_sha256 === item.image_content_sha256 &&
				['pending', 'failed'].includes(image.ocr_status) &&
				image.ocr_version + 1 === item.expected_ocr_version
		);
	});
}

function stepPayloadMatchesManifestItem(item: AuditManifestRow): boolean {
	const payload = item.payload;
	if (!payload || Array.isArray(payload) || item.payload_version !== 1) return false;
	const keys = Object.keys(payload).sort();
	return (
		keys.join(',') === 'expectedOcrVersion,imageId,kind,maxOutputChars,version' &&
		payload.version === 1 &&
		payload.kind === 'ocr_image' &&
		payload.imageId === item.image_id &&
		payload.expectedOcrVersion === item.expected_ocr_version &&
		payload.maxOutputChars === MAXIMUM_OUTPUT_CHARS
	);
}

function classify(status: string, healthy: boolean): LibriOcrAdmissionAuditClassification {
	if (status === 'confirmed') return healthy ? 'confirmed_ready' : 'confirmed_blocked';
	return healthy ? 'enqueued_consistent' : 'enqueued_incomplete';
}

async function withReadOnlySnapshot<T>(
	pool: LibriTransactionalPool,
	operation: (client: LibriTransactionClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
		const result = await operation(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		try {
			await client.query('ROLLBACK');
		} catch {
			// Preserve the original audit failure.
		}
		throw error;
	} finally {
		client.release();
	}
}
