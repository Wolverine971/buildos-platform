import { createHash, randomUUID } from 'node:crypto';
import type { LibriTransactionClient, LibriTransactionalPool } from './lifecycle';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAXIMUM_BATCH_SIZE = 10;

export type DispatchLibriOcrAdmissionInput = {
	admissionId: string;
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
	attempts: number;
	max_attempts: number;
	active_queue_job_id: string | null;
};

type QueueJobRow = {
	id: string;
	queue_job_id: string;
	job_type: string;
	metadata: Record<string, unknown> | null;
	status: string;
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

		return withTransaction(this.pool, async (client) => {
			const context = await lockAdmissionContext(client, input.admissionId);
			const manifest = await lockManifest(client, context);
			validateImmutableContract(context, manifest);

			const manifestSha256 = hashManifest(context, manifest);
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

			validateDispatchableContract(context, manifest);
			const scheduledFor = new Date().toISOString();
			const jobs: DispatchedLibriOcrJob[] = [];
			for (const item of manifest) {
				jobs.push(await enqueueManifestItem(client, context, item, scheduledFor));
			}

			const admissionUpdate = await client.query<{ id: string }>(
				`UPDATE libri.ocr_batch_admissions
				SET status = 'enqueued', enqueued_at = now(), updated_at = now()
				WHERE id = $1 AND library_id = $2 AND run_id = $3 AND status = 'confirmed'
				RETURNING id`,
				[context.admission_id, context.library_id, context.run_id]
			);
			if (admissionUpdate.rowCount !== 1) {
				throw new Error('Libri OCR admission dispatch ownership changed');
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

function validateImmutableContract(context: AdmissionContextRow, manifest: ManifestRow[]): void {
	if (context.admission_status !== 'confirmed' && context.admission_status !== 'enqueued') {
		throw new Error(`Libri OCR admission cannot dispatch from ${context.admission_status}`);
	}
	if (
		context.queue_family !== 'libri_ingest' ||
		context.run_kind !== 'ocr_book_batch' ||
		context.subject_type !== 'book' ||
		!context.book_id ||
		!UUID_PATTERN.test(context.book_id) ||
		!context.requested_by ||
		!UUID_PATTERN.test(context.requested_by) ||
		!SHA256_PATTERN.test(context.manifest_sha256)
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
			!UUID_PATTERN.test(item.step_id) ||
			!UUID_PATTERN.test(item.image_id) ||
			!Number.isSafeInteger(item.expected_ocr_version) ||
			item.expected_ocr_version < 1 ||
			!SHA256_PATTERN.test(item.image_content_sha256) ||
			stepIds.has(item.step_id) ||
			imageIds.has(item.image_id)
		) {
			throw new Error('Libri OCR admission manifest is invalid');
		}
		stepIds.add(item.step_id);
		imageIds.add(item.image_id);
	}
}

function validateDispatchableContract(context: AdmissionContextRow, manifest: ManifestRow[]): void {
	if (
		context.admission_status !== 'confirmed' ||
		context.run_status !== 'queued' ||
		context.cancel_requested_at !== null ||
		!context.dispatch_window_open
	) {
		throw new Error('Libri OCR admission is no longer dispatchable');
	}
	for (const item of manifest) {
		if (
			item.step_status !== 'pending' ||
			item.queue_family !== 'libri_ingest' ||
			item.step_kind !== 'ocr_image' ||
			item.attempts !== 0 ||
			item.max_attempts !== 1 ||
			item.active_queue_job_id !== null
		) {
			throw new Error('Libri OCR admission steps are no longer dispatchable');
		}
	}
}

function hashManifest(context: AdmissionContextRow, manifest: ManifestRow[]): string {
	const canonicalManifest = JSON.stringify({
		version: 1,
		runId: context.run_id,
		libraryId: context.library_id,
		bookId: context.book_id,
		items: manifest.map((item) => ({
			stepId: item.step_id,
			imageId: item.image_id,
			position: item.position,
			expectedOcrVersion: item.expected_ocr_version,
			imageContentSha256: item.image_content_sha256
		}))
	});
	return createHash('sha256').update(canonicalManifest, 'utf8').digest('hex');
}

async function enqueueManifestItem(
	client: LibriTransactionClient,
	context: AdmissionContextRow,
	item: ManifestRow,
	scheduledFor: string
): Promise<DispatchedLibriOcrJob> {
	const dedupKey = `libri:research-step:${item.step_id}`;
	const metadata = queueMetadata(context, item);
	const queueJobId = `libri_ingest_${randomUUID()}`;
	const inserted = await client.query<QueueJobRow>(
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
		) VALUES ($1, $2, 'libri_ingest', $3::jsonb, 'pending', $4, $5, $6, 0, 1)
		ON CONFLICT (dedup_key)
		WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
		DO NOTHING
		RETURNING id, queue_job_id, job_type::text, metadata, status::text`,
		[
			queueJobId,
			context.library_created_by,
			JSON.stringify(metadata),
			item.priority,
			scheduledFor,
			dedupKey
		]
	);
	let queueJob = inserted.rows[0];
	const created = Boolean(queueJob);
	if (!queueJob) {
		const existing = await client.query<QueueJobRow>(
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
	if (!queueJob || !queueJobMatchesItem(queueJob, context, item)) {
		throw new Error('Active Libri queue dedup row does not match the confirmed admission');
	}

	const stepUpdate = await client.query<{ id: string }>(
		`UPDATE libri.research_steps
		SET
			status = 'queued',
			scheduled_for = $2,
			active_queue_job_id = $3,
			active_processing_token = NULL,
			lease_token = NULL,
			lease_owner = NULL,
			leased_at = NULL,
			lease_expires_at = NULL,
			last_heartbeat_at = NULL,
			updated_at = now()
		WHERE id = $1
			AND library_id = $4
			AND run_id = $5
			AND status = 'pending'
			AND attempts = 0
			AND active_queue_job_id IS NULL
		RETURNING id`,
		[item.step_id, scheduledFor, queueJob.id, context.library_id, context.run_id]
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
	const result = await client.query<QueueJobRow>(
		`SELECT id, queue_job_id, job_type::text, metadata, status::text
		FROM public.queue_jobs
		WHERE job_type = 'libri_ingest'
			AND metadata->>'libriAdmissionId' = $1
		ORDER BY (metadata->>'libriBatchPosition')::integer`,
		[context.admission_id]
	);
	if (result.rows.length !== manifest.length) {
		throw new Error('Enqueued Libri OCR admission queue receipt is incomplete');
	}
	return result.rows.map((queueJob, position) => {
		const item = manifest[position];
		if (!item || !queueJobMatchesItem(queueJob, context, item)) {
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

function queueMetadata(context: AdmissionContextRow, item: ManifestRow): Record<string, unknown> {
	return {
		correlationId: context.correlation_id,
		libraryId: context.library_id,
		researchRunId: context.run_id,
		researchStepId: item.step_id,
		payloadVersion: item.payload_version,
		libriAdmissionId: context.admission_id,
		libriManifestSha256: context.manifest_sha256,
		libriBatchPosition: item.position
	};
}

function queueJobMatchesItem(
	queueJob: QueueJobRow,
	context: AdmissionContextRow,
	item: ManifestRow
): boolean {
	const expected = queueMetadata(context, item);
	return (
		queueJob.job_type === 'libri_ingest' &&
		queueJob.metadata?.researchStepId === expected.researchStepId &&
		queueJob.metadata?.researchRunId === expected.researchRunId &&
		queueJob.metadata?.libraryId === expected.libraryId &&
		queueJob.metadata?.libriAdmissionId === expected.libriAdmissionId &&
		queueJob.metadata?.libriManifestSha256 === expected.libriManifestSha256 &&
		queueJob.metadata?.libriBatchPosition === expected.libriBatchPosition &&
		queueJob.metadata?.payloadVersion === expected.payloadVersion
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
	if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID`);
}
