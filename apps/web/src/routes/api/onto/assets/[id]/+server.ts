// apps/web/src/routes/api/onto/assets/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureAssetAccess } from '../shared';

type UpdateAssetRequest = {
	alt_text?: string | null;
	caption?: string | null;
	metadata?: Record<string, unknown> | null;
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const assetId = params.id;
	if (!assetId) {
		return ApiResponse.badRequest('Asset ID required');
	}

	const accessResult = await ensureAssetAccess(locals.supabase, assetId, session.user.id, 'read');
	if ('error' in accessResult) {
		return accessResult.error;
	}

	const { data: links, error: linksError } = await (locals.supabase as any)
		.from('onto_asset_links')
		.select('*')
		.eq('asset_id', assetId)
		.order('created_at', { ascending: true });

	if (linksError) {
		return ApiResponse.databaseError(linksError);
	}

	return ApiResponse.success({
		asset: accessResult.asset,
		links: links || []
	});
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

	const body = (await request.json().catch(() => null)) as UpdateAssetRequest | null;
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

	const hasUpdates =
		Object.prototype.hasOwnProperty.call(body, 'alt_text') ||
		Object.prototype.hasOwnProperty.call(body, 'caption') ||
		Object.prototype.hasOwnProperty.call(body, 'metadata');
	if (!hasUpdates) {
		return ApiResponse.badRequest('No updates provided');
	}

	const updatePayload: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};

	if (Object.prototype.hasOwnProperty.call(body, 'alt_text')) {
		updatePayload.alt_text = typeof body.alt_text === 'string' ? body.alt_text : null;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'caption')) {
		updatePayload.caption = typeof body.caption === 'string' ? body.caption : null;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'metadata')) {
		updatePayload.metadata =
			body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
	}

	const { data: asset, error: updateError } = await (locals.supabase as any)
		.from('onto_assets')
		.update(updatePayload)
		.eq('id', assetId)
		.select('*')
		.single();

	if (updateError) {
		return ApiResponse.databaseError(updateError);
	}

	return ApiResponse.success({ asset });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

	const { error: softDeleteError } = await (locals.supabase as any)
		.from('onto_assets')
		.update({
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', assetId);

	if (softDeleteError) {
		return ApiResponse.databaseError(softDeleteError);
	}

	// Best-effort cleanup for links and storage object.
	await (locals.supabase as any).from('onto_asset_links').delete().eq('asset_id', assetId);

	const adminSupabase = createAdminSupabaseClient();
	await adminSupabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);

	return ApiResponse.success({ deleted: true });
};
