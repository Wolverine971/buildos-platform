import { z } from 'zod';
import type { RequestHandler } from './$types';
import { hashOcrBatchManifest } from '$lib/server/libri/ocr-batch-manifest';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

const MAX_REQUEST_BYTES = 1024;
const MAX_BATCH_SIZE = 10;
const RESERVED_MICROUSD_PER_IMAGE = 100_000;
const MAX_OUTPUT_CHARS_PER_IMAGE = 50_000;
const DEADLINE_WINDOW_SECONDS = 60 * 60;
const UUID = z.string().uuid();
const SHA256 = /^[0-9a-f]{64}$/;
const PRIVATE_RESPONSE_HEADERS = {
	'Cache-Control': 'private, no-store',
	Pragma: 'no-cache',
	'X-Content-Type-Options': 'nosniff'
} as const;

const requestSchema = z
	.object({
		requestId: UUID,
		libraryId: UUID,
		bookId: UUID,
		imageIds: z
			.array(UUID)
			.min(1)
			.max(MAX_BATCH_SIZE)
			.refine((imageIds) => new Set(imageIds).size === imageIds.length)
	})
	.strict();

type PlanRequest = z.infer<typeof requestSchema>;

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

type LibriPlannerClient = {
	rpc(
		functionName: 'plan_explicit_ocr_batch',
		args: {
			p_library_id: string;
			p_book_id: string;
			p_image_ids: string[];
			p_idempotency_key: string;
			p_requested_by: string;
		}
	): PromiseLike<DatabaseResult>;
	from(table: 'ocr_batch_items'): ManifestQuery;
};

type ReviewedReceipt = {
	runId: string;
	created: boolean;
	stepIds: string[];
};

type ReviewedManifestItem = {
	stepId: string;
	imageId: string;
	position: number;
	expectedOcrVersion: number;
	imageContentSha256: string;
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
			'OCR batch planning is temporarily unavailable',
			HttpStatus.SERVICE_UNAVAILABLE,
			ErrorCode.SERVICE_UNAVAILABLE
		)
	);
}

async function parsePlanRequest(request: Request): Promise<PlanRequest | null> {
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

function reviewReceipt(data: unknown, batchSize: number): ReviewedReceipt | null {
	if (!Array.isArray(data) || data.length !== 1) return null;
	const row = data[0] as Record<string, unknown> | null;
	if (!row || typeof row !== 'object') return null;
	if (!isUuid(row.run_id) || typeof row.created !== 'boolean') return null;
	if (!Array.isArray(row.step_ids) || row.step_ids.length !== batchSize) return null;
	if (!row.step_ids.every(isUuid) || new Set(row.step_ids).size !== batchSize) return null;

	return {
		runId: row.run_id,
		created: row.created,
		stepIds: row.step_ids
	};
}

function reviewManifest(
	data: unknown,
	receipt: ReviewedReceipt,
	requestedImageIds: string[]
): ReviewedManifestItem[] | null {
	if (!Array.isArray(data) || data.length !== requestedImageIds.length) return null;

	const reviewed: ReviewedManifestItem[] = [];
	for (const [position, value] of data.entries()) {
		const row = value as Record<string, unknown> | null;
		if (!row || typeof row !== 'object') return null;
		if (
			row.position !== position ||
			row.image_id !== requestedImageIds[position] ||
			row.step_id !== receipt.stepIds[position] ||
			!Number.isInteger(row.expected_ocr_version) ||
			(row.expected_ocr_version as number) < 1 ||
			typeof row.image_content_sha256 !== 'string' ||
			!SHA256.test(row.image_content_sha256)
		) {
			return null;
		}

		reviewed.push({
			stepId: row.step_id as string,
			imageId: row.image_id as string,
			position,
			expectedOcrVersion: row.expected_ocr_version as number,
			imageContentSha256: row.image_content_sha256
		});
	}

	return reviewed;
}

function plannerError(error: DatabaseError): Response {
	if (error.code === '42501') {
		return privateResponse(ApiResponse.forbidden('Library editor access required'));
	}
	if (error.code === '23505') {
		return privateResponse(ApiResponse.conflict('OCR batch conflicts with an existing plan'));
	}
	if (error.code === '22023') {
		return privateResponse(ApiResponse.badRequest('OCR batch request is not eligible'));
	}

	console.error('[LibriOcrBatchPlanner] Planner RPC failed', {
		code: error.code ?? 'unknown'
	});
	return unavailable();
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return privateResponse(ApiResponse.unauthorized());

	const planRequest = await parsePlanRequest(request);
	if (!planRequest) {
		return privateResponse(ApiResponse.badRequest('Invalid OCR batch plan request'));
	}

	try {
		const supabase = createAdminSupabaseClient();
		// Generated types currently omit custom-schema routines. Keep this cast scoped to the
		// exact reviewed planner and manifest contracts, then re-validate every returned field.
		const libri = supabase.schema('libri') as unknown as LibriPlannerClient;
		const planned = await libri.rpc('plan_explicit_ocr_batch', {
			p_library_id: planRequest.libraryId,
			p_book_id: planRequest.bookId,
			p_image_ids: planRequest.imageIds,
			p_idempotency_key: `ocr-batch:user:${user.id}:request:${planRequest.requestId}`,
			p_requested_by: user.id
		});
		if (planned.error) return plannerError(planned.error);

		const receipt = reviewReceipt(planned.data, planRequest.imageIds.length);
		if (!receipt) {
			console.error('[LibriOcrBatchPlanner] Planner returned an invalid receipt');
			return unavailable();
		}

		const manifestResult = await libri
			.from('ocr_batch_items')
			.select('step_id,image_id,position,expected_ocr_version,image_content_sha256')
			.eq('library_id', planRequest.libraryId)
			.eq('run_id', receipt.runId)
			.order('position', { ascending: true });
		if (manifestResult.error) {
			console.error('[LibriOcrBatchPlanner] Manifest lookup failed', {
				code: manifestResult.error.code ?? 'unknown'
			});
			return unavailable();
		}

		const items = reviewManifest(manifestResult.data, receipt, planRequest.imageIds);
		if (!items) {
			console.error('[LibriOcrBatchPlanner] Planner returned an invalid manifest');
			return unavailable();
		}
		const manifestSha256 = hashOcrBatchManifest({
			runId: receipt.runId,
			libraryId: planRequest.libraryId,
			bookId: planRequest.bookId,
			items
		});

		return privateResponse(
			ApiResponse.success({
				runId: receipt.runId,
				created: receipt.created,
				batch: {
					libraryId: planRequest.libraryId,
					bookId: planRequest.bookId,
					imageCount: items.length,
					items
				},
				limits: {
					maxAttemptsPerImage: 1,
					maxConcurrentImages: Math.min(items.length, 2),
					reservedBudgetMicrousd: items.length * RESERVED_MICROUSD_PER_IMAGE,
					maxOutputCharsPerImage: MAX_OUTPUT_CHARS_PER_IMAGE,
					deadlineWindowSeconds: DEADLINE_WINDOW_SECONDS
				},
				confirmation: {
					version: 1,
					manifestSha256
				},
				transportEnqueued: false
			})
		);
	} catch {
		console.error('[LibriOcrBatchPlanner] Planning request failed');
		return unavailable();
	}
};
