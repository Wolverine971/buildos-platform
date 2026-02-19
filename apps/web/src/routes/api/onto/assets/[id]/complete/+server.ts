// apps/web/src/routes/api/onto/assets/[id]/complete/+server.ts
import type { RequestHandler } from './$types';
import { buildAssetOcrFailedUpdate, buildAssetOcrPendingUpdate } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureAssetAccess } from '../../shared';
import { queueAssetOcrExtraction } from '$lib/server/asset-ocr-queue.service';

export const POST: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const assetId = params.id;
	if (!assetId) {
		return ApiResponse.badRequest('Asset ID required');
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

	const { asset } = accessResult;

	const pathParts = String(asset.storage_path).split('/');
	const filename = pathParts.pop();
	const folder = pathParts.join('/');

	if (!filename) {
		return ApiResponse.badRequest('Invalid storage path');
	}

	const adminSupabase = createAdminSupabaseClient();
	const { data: listed, error: listError } = await adminSupabase.storage
		.from(String(asset.storage_bucket))
		.list(folder, { limit: 1, search: filename });

	if (listError) {
		return ApiResponse.internalError(listError, 'Failed to verify uploaded file');
	}

	const fileExists = (listed || []).some((entry) => entry.name === filename);
	if (!fileExists) {
		return ApiResponse.badRequest('Uploaded file not found in storage');
	}

	const { data: updatedAsset, error: updateError } = await (locals.supabase as any)
		.from('onto_assets')
		.update(buildAssetOcrPendingUpdate())
		.eq('id', assetId)
		.select('*')
		.single();

	if (updateError) {
		return ApiResponse.databaseError(updateError);
	}

	const queueResult = await queueAssetOcrExtraction({
		assetId,
		projectId: String(asset.project_id),
		userId: session.user.id,
		dedupKey: `asset-ocr-${assetId}`
	});

	if (!queueResult.queued) {
		await (locals.supabase as any)
			.from('onto_assets')
			.update(
				buildAssetOcrFailedUpdate(queueResult.reason || 'Failed to queue OCR extraction')
			)
			.eq('id', assetId);

		return ApiResponse.internalError(
			new Error(queueResult.reason || 'Failed to queue OCR extraction')
		);
	}

	return ApiResponse.success({
		asset: updatedAsset,
		queued: true,
		jobId: queueResult.jobId
	});
};
