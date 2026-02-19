// apps/web/src/routes/api/onto/assets/[id]/ocr/+server.ts
import type { RequestHandler } from './$types';
import { buildAssetManualOcrUpdate } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureAssetAccess } from '../../shared';

type OcrUpdateRequest = {
	extracted_text?: string | null;
	extraction_summary?: string | null;
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const assetId = params.id;
	if (!assetId) {
		return ApiResponse.badRequest('Asset ID required');
	}

	const body = (await request.json().catch(() => null)) as OcrUpdateRequest | null;
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const accessResult = await ensureAssetAccess(
		locals.supabase,
		assetId,
		session.user.id,
		'write'
	);
	if ('error' in accessResult) {
		return accessResult.error;
	}

	const hasExtractedText = Object.prototype.hasOwnProperty.call(body, 'extracted_text');
	const hasSummary = Object.prototype.hasOwnProperty.call(body, 'extraction_summary');
	if (!hasExtractedText && !hasSummary) {
		return ApiResponse.badRequest('No OCR update fields provided');
	}

	const updatePayload = buildAssetManualOcrUpdate({
		asset: accessResult.asset,
		actorId: accessResult.actorId,
		hasExtractedText,
		extractedText: typeof body.extracted_text === 'string' ? body.extracted_text : null,
		hasSummary,
		extractionSummary:
			typeof body.extraction_summary === 'string' ? body.extraction_summary : null
	});

	const { data: asset, error } = await (locals.supabase as any)
		.from('onto_assets')
		.update(updatePayload)
		.eq('id', assetId)
		.select('*')
		.single();

	if (error) {
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ asset });
};
