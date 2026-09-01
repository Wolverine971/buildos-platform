// apps/worker/src/workers/libri/ocrAdmissionContract.ts
import { createHash } from 'node:crypto';

export const LIBRI_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LIBRI_SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type LibriOcrAdmissionIdentity = {
	admission_id: string;
	library_id: string;
	run_id: string;
	book_id: string | null;
	correlation_id: string;
	manifest_sha256: string;
};

export type LibriOcrManifestIdentity = {
	step_id: string;
	image_id: string;
	position: number;
	expected_ocr_version: number;
	image_content_sha256: string;
	payload_version: number;
};

export type LibriOcrQueueReceipt = {
	id: string;
	queue_job_id: string;
	job_type: string;
	metadata: Record<string, unknown> | null;
	status: string;
};

export type LibriOcrStepQueueState = {
	step_status: string | null;
	attempts: number | null;
	max_attempts: number | null;
};

export function hashLibriOcrAdmissionManifest(
	context: LibriOcrAdmissionIdentity,
	manifest: readonly LibriOcrManifestIdentity[]
): string {
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

export function libriOcrQueueMetadata(
	context: LibriOcrAdmissionIdentity,
	item: LibriOcrManifestIdentity
): Record<string, unknown> {
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

export function libriOcrQueueReceiptMatchesItem(
	queueJob: LibriOcrQueueReceipt,
	context: LibriOcrAdmissionIdentity,
	item: LibriOcrManifestIdentity
): boolean {
	const expected = libriOcrQueueMetadata(context, item);
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

export function libriOcrQueueReceiptMatchesStepState(
	queueJob: LibriOcrQueueReceipt,
	step: LibriOcrStepQueueState
): boolean {
	if (step.max_attempts !== 1 || !Number.isSafeInteger(step.attempts)) return false;
	switch (queueJob.status) {
		case 'pending':
			return step.step_status === 'queued' && step.attempts === 0;
		case 'processing':
			return step.step_status === 'leased' && step.attempts === 1;
		case 'completed':
			return step.step_status === 'completed' && step.attempts === 1;
		case 'failed':
			return (
				['failed', 'dead_letter'].includes(step.step_status ?? '') && step.attempts === 1
			);
		case 'cancelled':
			return step.step_status === 'cancelled' && (step.attempts === 0 || step.attempts === 1);
		default:
			return false;
	}
}
