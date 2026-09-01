import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	hashOcrBatchManifest,
	type OcrBatchManifestItem
} from '$lib/server/libri/ocr-batch-manifest';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

const MAX_REQUEST_BYTES = 1024;
const MAX_BATCH_SIZE = 10;
const UUID = z.string().uuid();
const SHA256 = /^[0-9a-f]{64}$/;
const PRIVATE_RESPONSE_HEADERS = {
	'Cache-Control': 'private, no-store',
	Pragma: 'no-cache',
	'X-Content-Type-Options': 'nosniff'
} as const;

const requestSchema = z
	.object({
		confirmationId: UUID,
		libraryId: UUID,
		bookId: UUID,
		runId: UUID,
		manifestSha256: z.string().regex(SHA256)
	})
	.strict();

type ConfirmationRequest = z.infer<typeof requestSchema>;

type DatabaseError = {
	code?: string;
};

type DatabaseResult = {
	data: unknown;
	error: DatabaseError | null;
};

type ManifestQuery = {
	select(columns: string): ManifestQuery;
	eq(column: 'library_id' | 'run_id', value: string): ManifestQuery;
	order(column: 'position', options: { ascending: true }): PromiseLike<DatabaseResult>;
};

type LibriAdmissionClient = {
	rpc(
		functionName: 'confirm_explicit_ocr_batch_admission',
		args: {
			p_library_id: string;
			p_book_id: string;
			p_run_id: string;
			p_confirmation_id: string;
			p_manifest_sha256: string;
			p_step_ids: string[];
			p_image_ids: string[];
			p_expected_ocr_versions: number[];
			p_image_content_sha256s: string[];
			p_requested_by: string;
		}
	): PromiseLike<DatabaseResult>;
};

type LibriManifestClient = {
	from(table: 'ocr_batch_items'): ManifestQuery;
};

type ReviewedAdmission = {
	admissionId: string;
	created: boolean;
	status: 'confirmed' | 'enqueued';
};

function privateResponse(response: Response): Response {
	for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
}

function unavailable(): Response {
	return privateResponse(
		ApiResponse.error(
			'OCR batch confirmation is temporarily unavailable',
			HttpStatus.SERVICE_UNAVAILABLE,
			ErrorCode.SERVICE_UNAVAILABLE
		)
	);
}

async function parseConfirmationRequest(request: Request): Promise<ConfirmationRequest | null> {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	if (contentType !== 'application/json') return null;

	const declaredLength = request.headers.get('content-length');
	if (declaredLength !== null) {
		if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)
			return null;
	}

	let text: string;
	try {
		text = await request.text();
	} catch {
		return null;
	}
	if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return null;

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}

	const parsed = requestSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
}

function isUuid(value: unknown): value is string {
	return UUID.safeParse(value).success;
}

function reviewManifest(data: unknown): OcrBatchManifestItem[] | null {
	if (!Array.isArray(data) || data.length < 1 || data.length > MAX_BATCH_SIZE) return null;

	const reviewed: OcrBatchManifestItem[] = [];
	for (const [position, value] of data.entries()) {
		const row = value as Record<string, unknown> | null;
		if (
			!row ||
			typeof row !== 'object' ||
			row.position !== position ||
			!isUuid(row.step_id) ||
			!isUuid(row.image_id) ||
			!Number.isInteger(row.expected_ocr_version) ||
			(row.expected_ocr_version as number) < 1 ||
			typeof row.image_content_sha256 !== 'string' ||
			!SHA256.test(row.image_content_sha256)
		) {
			return null;
		}

		reviewed.push({
			stepId: row.step_id,
			imageId: row.image_id,
			position,
			expectedOcrVersion: row.expected_ocr_version as number,
			imageContentSha256: row.image_content_sha256
		});
	}
	if (new Set(reviewed.map((item) => item.stepId)).size !== reviewed.length) return null;
	if (new Set(reviewed.map((item) => item.imageId)).size !== reviewed.length) return null;
	return reviewed;
}

function reviewAdmission(data: unknown): ReviewedAdmission | null {
	if (!Array.isArray(data) || data.length !== 1) return null;
	const row = data[0] as Record<string, unknown> | null;
	if (
		!row ||
		typeof row !== 'object' ||
		!isUuid(row.admission_id) ||
		typeof row.created !== 'boolean' ||
		(row.admission_status !== 'confirmed' && row.admission_status !== 'enqueued')
	) {
		return null;
	}

	return {
		admissionId: row.admission_id,
		created: row.created,
		status: row.admission_status
	};
}

function admissionError(error: DatabaseError): Response {
	if (error.code === '42501') {
		return privateResponse(ApiResponse.forbidden('Library editor access required'));
	}
	if (error.code === '23505' || error.code === '55000') {
		return privateResponse(ApiResponse.conflict('OCR batch is not confirmable'));
	}
	if (error.code === '22023') {
		return privateResponse(ApiResponse.badRequest('OCR batch confirmation is invalid'));
	}

	console.error('[LibriOcrBatchAdmission] Confirmation RPC failed', {
		code: error.code ?? 'unknown'
	});
	return unavailable();
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());

	const confirmationRequest = await parseConfirmationRequest(request);
	if (!confirmationRequest) {
		return privateResponse(ApiResponse.badRequest('Invalid OCR batch confirmation request'));
	}

	try {
		// Read the manifest through the caller's session so the existing member RLS policy applies.
		// Generated types currently omit custom-schema tables, so keep this cast exact and review
		// every untyped value before any service authority is created.
		const libriReader = supabase.schema('libri') as unknown as LibriManifestClient;
		const manifestResult = await libriReader
			.from('ocr_batch_items')
			.select('step_id,image_id,position,expected_ocr_version,image_content_sha256')
			.eq('library_id', confirmationRequest.libraryId)
			.eq('run_id', confirmationRequest.runId)
			.order('position', { ascending: true });
		if (manifestResult.error) {
			console.error('[LibriOcrBatchAdmission] Manifest lookup failed', {
				code: manifestResult.error.code ?? 'unknown'
			});
			return unavailable();
		}
		if (Array.isArray(manifestResult.data) && manifestResult.data.length === 0) {
			return privateResponse(ApiResponse.notFound('OCR batch'));
		}

		const items = reviewManifest(manifestResult.data);
		if (!items) {
			console.error('[LibriOcrBatchAdmission] Manifest is invalid');
			return unavailable();
		}
		const manifestSha256 = hashOcrBatchManifest({
			runId: confirmationRequest.runId,
			libraryId: confirmationRequest.libraryId,
			bookId: confirmationRequest.bookId,
			items
		});
		if (manifestSha256 !== confirmationRequest.manifestSha256) {
			return privateResponse(ApiResponse.conflict('OCR batch preview is stale'));
		}

		const adminSupabase = createAdminSupabaseClient();
		const libri = adminSupabase.schema('libri') as unknown as LibriAdmissionClient;
		const admitted = await libri.rpc('confirm_explicit_ocr_batch_admission', {
			p_library_id: confirmationRequest.libraryId,
			p_book_id: confirmationRequest.bookId,
			p_run_id: confirmationRequest.runId,
			p_confirmation_id: confirmationRequest.confirmationId,
			p_manifest_sha256: manifestSha256,
			p_step_ids: items.map((item) => item.stepId),
			p_image_ids: items.map((item) => item.imageId),
			p_expected_ocr_versions: items.map((item) => item.expectedOcrVersion),
			p_image_content_sha256s: items.map((item) => item.imageContentSha256),
			p_requested_by: user.id
		});
		if (admitted.error) return admissionError(admitted.error);

		const admission = reviewAdmission(admitted.data);
		if (!admission) {
			console.error('[LibriOcrBatchAdmission] Confirmation returned an invalid receipt');
			return unavailable();
		}

		return privateResponse(
			ApiResponse.success({
				admissionId: admission.admissionId,
				runId: confirmationRequest.runId,
				created: admission.created,
				status: admission.status,
				manifestSha256,
				transportEnqueued: admission.status === 'enqueued'
			})
		);
	} catch {
		console.error('[LibriOcrBatchAdmission] Confirmation request failed');
		return unavailable();
	}
};
