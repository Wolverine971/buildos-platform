// apps/worker/src/workers/libri/admissionDispatcher.ts
import { randomUUID } from 'node:crypto';
import type { LibriTransactionClient, LibriTransactionalPool } from './lifecycle';
import {
	LIBRI_SHA256_PATTERN,
	LIBRI_UUID_PATTERN,
	type LibriOcrQueueReceipt,
	hashLibriOcrAdmissionManifest,
	libriOcrQueueMetadata,
	libriOcrQueueReceiptMatchesItem,
	libriOcrQueueReceiptMatchesStepState
} from './ocrAdmissionContract';

const MAXIMUM_BATCH_SIZE = 10;
const MAXIMUM_OUTPUT_CHARS = 50_000;

export type DispatchLibriOcrAdmissionInput = {
	admissionId: string;
	dispatchExpiresAt: string;
};

export type DispatchedLibriOcrJob = {
	stepId: string;
	queueRowId: string;
	queueJobId: string;
	created: boolean;
};

export type DispatchLibriOcrAdmissionReceipt = {
	admissionId: string;
	runId: string;
	manifestSha256: string;
	created: boolean;
	jobs: DispatchedLibriOcrJob[];
};

export type LibriAdmissionDispatcherPort = {
	dispatchOcrAdmission: (
		input: DispatchLibriOcrAdmissionInput
	) => Promise<DispatchLibriOcrAdmissionReceipt>;
};

type AdmissionContextRow = {
	admission_id: string;
	library_id: string;
	run_id: string;
	manifest_sha256: string;
	admission_status: string;
	queue_family: string;
	run_kind: string;
	subject_type: string;
	book_id: string | null;
	requested_by: string | null;
	run_status: string;
	cancel_requested_at: string | null;
	dispatch_window_open: boolean;
	planned_steps: number;
	max_steps: number;
	max_attempts_per_step: number;
	max_concurrent_steps: number;
	correlation_id: string;
	library_created_by: string;
};

type ManifestRow = {
	step_id: string;
	image_id: string;
	position: number;
	expected_ocr_version: number;
	image_content_sha256: string;
	step_status: string;
	queue_family: string;
	step_kind: string;
	priority: number;
	payload_version: number;
	payload: Record<string, unknown> | null;
	attempts: number;
	max_attempts: number;
	active_queue_job_id: string | null;
};

type CurrentImageRow = {
	image_id: string;
	book_id: string | null;
	content_sha256: string;
	ocr_status: string;
	ocr_version: number;
};

export function createLibriAdmissionDispatcher(
	pool: LibriTransactionalPool
): LibriAdmissionDispatcherPort {
	return new LibriAdmissionDispatcher(pool);
}

class LibriAdmissionDispatcher implements LibriAdmissionDispatcherPort {
	constructor(private readonly pool: LibriTransactionalPool) {}

	dispatchOcrAdmission(
		input: DispatchLibriOcrAdmissionInput
	): Promise<DispatchLibriOcrAdmissionReceipt> {
		assertUuid(input.admissionId, 'admissionId');
		assertTimestamp(input.dispatchExpiresAt, 'dispatchExpiresAt');

		return withTransaction(this.pool, async (client) => {
			await configureDispatchTransaction(client, input.dispatchExpiresAt);
			const context = await lockAdmissionContext(client, input.admissionId);
			const manifest = await lockManifest(client, context);
			validateImmutableContract(context, manifest);

			const manifestSha256 = hashLibriOcrAdmissionManifest(context, manifest);
			if (manifestSha256 !== context.manifest_sha256) {
				throw new Error('Confirmed Libri OCR admission manifest hash changed');
			}

			if (context.admission_status === 'enqueued') {
				const jobs = await loadEnqueuedJobs(client, context, manifest);
				return {
					admissionId: context.admission_id,
					runId: context.run_id,
					manifestSha256,
					created: false,
					jobs
				};
			}

			const currentImages = await lockCurrentImages(client, context, manifest);
			validateDispatchableContract(context, manifest, currentImages);
			const jobs: DispatchedLibriOcrJob[] = [];
			for (const item of manifest) {
				jobs.push(await enqueueManifestItem(client, context, item));
			}

			const admissionUpdate = await client.query<{ admission_id: string }>(
				`SELECT admission_id
				FROM libri.finalize_ocr_batch_admission_dispatch($1, $2::timestamptz)`,
				[context.admission_id, input.dispatchExpiresAt]
			);
			if (admissionUpdate.rowCount !== 1) {
				throw new Error('Libri OCR admission dispatch finalization failed');
			}

			return {
				admissionId: context.admission_id,
				runId: context.run_id,
				manifestSha256,
				created: true,
				jobs
			};
		});
	}
}

async function configureDispatchTransaction(
	client: LibriTransactionClient,
	dispatchExpiresAt: string
): Promise<void> {
	const configured = await client.query<{ active: boolean }>(
		`SELECT
			$1::timestamptz > clock_timestamp() AS active,
			set_config(
				'lock_timeout',
				GREATEST(
					1,
					LEAST(
						5000,
						floor(extract(epoch FROM ($1::timestamptz - clock_timestamp())) * 1000)::integer
					)
				)::text || 'ms',
				true
			),
			set_config(
				'statement_timeout',
				GREATEST(
					1,
					LEAST(
						60000,
						floor(extract(epoch FROM ($1::timestamptz - clock_timestamp())) * 1000)::integer
					)
				)::text || 'ms',
				true
			)`,
		[dispatchExpiresAt]
	);
	if (configured.rows[0]?.active !== true) {
		throw new Error('Libri OCR admission dispatch window expired before transaction locks');
	}
}

async function lockAdmissionContext(
	client: LibriTransactionClient,
	admissionId: string
): Promise<AdmissionContextRow> {
	const lockedRun = await client.query<{ run_id: string }>(
		`SELECT run.id AS run_id
		FROM libri.ocr_batch_admissions admission
		JOIN libri.research_runs run
			ON run.library_id = admission.library_id AND run.id = admission.run_id
		WHERE admission.id = $1
		FOR UPDATE OF run`,
		[admissionId]
	);
	if (!lockedRun.rows[0]) {
		throw new Error('Confirmed Libri OCR admission was not found');
	}

	// Read the admission after the owning run lock is acquired. Under READ COMMITTED,
	// this gives a concurrent exact dispatcher a fresh view of the first dispatch and
	// lets it return the durable enqueued receipt instead of acting on a stale join.
	const result = await client.query<AdmissionContextRow>(
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
		WHERE admission.id = $1 AND run.id = $2`,
		[admissionId, lockedRun.rows[0].run_id]
	);
	const context = result.rows[0];
	if (!context) throw new Error('Confirmed Libri OCR admission was not found');
	return context;
}

async function lockManifest(
	client: LibriTransactionClient,
	context: AdmissionContextRow
): Promise<ManifestRow[]> {
	const result = await client.query<ManifestRow>(
		`SELECT
			item.step_id,
			item.image_id,
			item.position,
			item.expected_ocr_version,
			item.image_content_sha256,
			step.status AS step_status,
			step.queue_family,
			step.kind AS step_kind,
			step.priority,
			step.payload_version,
			step.payload,
			step.attempts,
			step.max_attempts,
			step.active_queue_job_id
		FROM libri.ocr_batch_items item
		JOIN libri.research_steps step
			ON step.library_id = item.library_id
			AND step.run_id = item.run_id
			AND step.id = item.step_id
		WHERE item.library_id = $1 AND item.run_id = $2
		ORDER BY item.position
		FOR UPDATE OF step`,
		[context.library_id, context.run_id]
	);
	return result.rows;
}

async function lockCurrentImages(
	client: LibriTransactionClient,
	context: AdmissionContextRow,
	manifest: ManifestRow[]
): Promise<CurrentImageRow[]> {
	const result = await client.query<CurrentImageRow>(
		`SELECT
			image.id AS image_id,
			image.book_id,
			image.content_sha256,
			image.ocr_status::text,
			image.ocr_version
		FROM libri.images image
		WHERE image.library_id = $1 AND image.id = ANY($2::uuid[])
		ORDER BY image.id
		FOR SHARE OF image`,
		[context.library_id, manifest.map((item) => item.image_id)]
	);
	return result.rows;
}

function validateImmutableContract(context: AdmissionContextRow, manifest: ManifestRow[]): void {
	if (context.admission_status !== 'confirmed' && context.admission_status !== 'enqueued') {
		throw new Error(`Libri OCR admission cannot dispatch from ${context.admission_status}`);
	}
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
		throw new Error('Libri OCR admission run contract is invalid');
	}
	if (
		manifest.length < 1 ||
		manifest.length > MAXIMUM_BATCH_SIZE ||
		context.planned_steps !== manifest.length ||
		context.max_steps !== manifest.length ||
		context.max_attempts_per_step !== 1 ||
		context.max_concurrent_steps !== Math.min(manifest.length, 2)
	) {
		throw new Error('Libri OCR admission batch limits changed');
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
			throw new Error('Libri OCR admission manifest is invalid');
		}
		stepIds.add(item.step_id);
		imageIds.add(item.image_id);
	}
}

function validateDispatchableContract(
	context: AdmissionContextRow,
	manifest: ManifestRow[],
	currentImages: CurrentImageRow[]
): void {
	if (
		context.admission_status !== 'confirmed' ||
		context.run_status !== 'queued' ||
		context.cancel_requested_at !== null ||
		!context.dispatch_window_open
	) {
		throw new Error('Libri OCR admission is no longer dispatchable');
	}
	const imageById = new Map(currentImages.map((image) => [image.image_id, image]));
	for (const item of manifest) {
		const image = imageById.get(item.image_id);
		if (
			item.step_status !== 'pending' ||
			item.queue_family !== 'libri_ingest' ||
			item.step_kind !== 'ocr_image' ||
			item.attempts !== 0 ||
			item.max_attempts !== 1 ||
			item.active_queue_job_id !== null ||
			!image ||
			image.book_id !== context.book_id ||
			image.content_sha256 !== item.image_content_sha256 ||
			!['pending', 'failed'].includes(image.ocr_status) ||
			image.ocr_version + 1 !== item.expected_ocr_version
		) {
			throw new Error('Libri OCR admission steps are no longer dispatchable');
		}
	}
}

async function enqueueManifestItem(
	client: LibriTransactionClient,
	context: AdmissionContextRow,
	item: ManifestRow
): Promise<DispatchedLibriOcrJob> {
	const dedupKey = `libri:research-step:${item.step_id}`;
	const metadata = libriOcrQueueMetadata(context, item);
	const queueJobId = `libri_ingest_${randomUUID()}`;
	const inserted = await client.query<LibriOcrQueueReceipt>(
		`INSERT INTO public.queue_jobs (
			queue_job_id,
			user_id,
			job_type,
			metadata,
			status,
			priority,
			scheduled_for,
			dedup_key,
			attempts,
			max_attempts
		) VALUES (
			$1, $2, 'libri_ingest', $3::jsonb, 'pending', $4,
			transaction_timestamp(), $5, 0, 1
		)
		ON CONFLICT (dedup_key)
		WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
		DO NOTHING
		RETURNING id, queue_job_id, job_type::text, metadata, status::text`,
		[queueJobId, context.library_created_by, JSON.stringify(metadata), item.priority, dedupKey]
	);
	let queueJob = inserted.rows[0];
	const created = Boolean(queueJob);
	if (!queueJob) {
		const existing = await client.query<LibriOcrQueueReceipt>(
			`SELECT id, queue_job_id, job_type::text, metadata, status::text
			FROM public.queue_jobs
			WHERE dedup_key = $1 AND status IN ('pending', 'processing')
			ORDER BY created_at ASC
			LIMIT 1
			FOR UPDATE`,
			[dedupKey]
		);
		queueJob = existing.rows[0];
	}
	if (!queueJob || !libriOcrQueueReceiptMatchesItem(queueJob, context, item)) {
		throw new Error('Active Libri queue dedup row does not match the confirmed admission');
	}

	const stepUpdate = await client.query<{ id: string }>(
		`UPDATE libri.research_steps
		SET
			status = 'queued',
			scheduled_for = transaction_timestamp(),
			active_queue_job_id = $2,
			active_processing_token = NULL,
			lease_token = NULL,
			lease_owner = NULL,
			leased_at = NULL,
			lease_expires_at = NULL,
			last_heartbeat_at = NULL,
			updated_at = now()
		WHERE id = $1
			AND library_id = $3
			AND run_id = $4
			AND status = 'pending'
			AND attempts = 0
			AND active_queue_job_id IS NULL
		RETURNING id`,
		[item.step_id, queueJob.id, context.library_id, context.run_id]
	);
	if (stepUpdate.rowCount !== 1) {
		throw new Error('Libri OCR step dispatch ownership changed');
	}

	return {
		stepId: item.step_id,
		queueRowId: queueJob.id,
		queueJobId: queueJob.queue_job_id,
		created
	};
}

async function loadEnqueuedJobs(
	client: LibriTransactionClient,
	context: AdmissionContextRow,
	manifest: ManifestRow[]
): Promise<DispatchedLibriOcrJob[]> {
	const queueRowIds = manifest.map((item) => item.active_queue_job_id);
	if (queueRowIds.some((queueRowId) => queueRowId === null)) {
		throw new Error('Enqueued Libri OCR admission queue receipt is incomplete');
	}
	const result = await client.query<LibriOcrQueueReceipt>(
		`SELECT id, queue_job_id, job_type::text, metadata, status::text
		FROM public.queue_jobs
		WHERE id = ANY($1::uuid[]) AND job_type = 'libri_ingest'
		ORDER BY (metadata->>'libriBatchPosition')::integer`,
		[queueRowIds]
	);
	if (result.rows.length !== manifest.length) {
		throw new Error('Enqueued Libri OCR admission queue receipt is incomplete');
	}
	return result.rows.map((queueJob, position) => {
		const item = manifest[position];
		if (
			!item ||
			item.active_queue_job_id !== queueJob.id ||
			!libriOcrQueueReceiptMatchesItem(queueJob, context, item) ||
			!libriOcrQueueReceiptMatchesStepState(queueJob, item)
		) {
			throw new Error('Enqueued Libri OCR admission queue receipt changed');
		}
		return {
			stepId: item.step_id,
			queueRowId: queueJob.id,
			queueJobId: queueJob.queue_job_id,
			created: false
		};
	});
}

function stepPayloadMatchesManifestItem(item: ManifestRow): boolean {
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
		try {
			await client.query('ROLLBACK');
		} catch {
			// Preserve the original transaction failure.
		}
		throw error;
	} finally {
		client.release();
	}
}

function assertUuid(value: string, name: string): void {
	if (!LIBRI_UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID`);
}

function assertTimestamp(value: string, name: string): void {
	if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
		throw new Error(`${name} must be an ISO timestamp`);
	}
}
