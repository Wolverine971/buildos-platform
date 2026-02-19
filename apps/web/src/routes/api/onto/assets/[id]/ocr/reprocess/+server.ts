// apps/web/src/routes/api/onto/assets/[id]/ocr/reprocess/+server.ts
import type { RequestHandler } from './$types';
import { buildAssetOcrFailedUpdate, buildAssetOcrPendingUpdate } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureAssetAccess } from '../../../shared';
import { queueAssetOcrExtraction } from '$lib/server/asset-ocr-queue.service';

type ReprocessRequest = {
	force_overwrite?: boolean;
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const assetId = params.id;
	if (!assetId) {
		return ApiResponse.badRequest('Asset ID required');
	}

	const body = (await request.json().catch(() => ({}))) as ReprocessRequest;
	const forceOverwrite = Boolean(body?.force_overwrite);

	const accessResult = await ensureAssetAccess(
		locals.supabase,
		assetId,
		session.user.id,
		'write'
	);
	if ('error' in accessResult) {
		return accessResult.error;
	}

	const { asset } = accessResult;
	const { error: pendingError } = await (locals.supabase as any)
		.from('onto_assets')
		.update(buildAssetOcrPendingUpdate())
		.eq('id', assetId);

	if (pendingError) {
		return ApiResponse.databaseError(pendingError);
	}

	const queueResult = await queueAssetOcrExtraction({
		assetId,
		projectId: String(asset.project_id),
		userId: session.user.id,
		forceOverwrite,
		dedupKey: `asset-ocr-${assetId}-${Date.now()}`
	});

	if (!queueResult.queued) {
		await (locals.supabase as any)
			.from('onto_assets')
			.update(
				buildAssetOcrFailedUpdate(queueResult.reason || 'Failed to queue OCR reprocess')
			)
			.eq('id', assetId);
		return ApiResponse.internalError(
			new Error(queueResult.reason || 'Failed to queue OCR reprocess')
		);
	}

	return ApiResponse.success({
		queued: true,
		jobId: queueResult.jobId
	});
};
