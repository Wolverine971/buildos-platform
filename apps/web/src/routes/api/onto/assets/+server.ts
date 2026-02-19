// apps/web/src/routes/api/onto/assets/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureProjectAccess, getFileExtension, isEntityKind, parsePositiveInt } from './shared';

const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

type CreateAssetRequest = {
	project_id?: string;
	file_name?: string;
	content_type?: string;
	file_size_bytes?: number;
	width?: number | null;
	height?: number | null;
	alt_text?: string | null;
	caption?: string | null;
	metadata?: Record<string, unknown> | null;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const projectId = url.searchParams.get('project_id');
	if (!projectId) {
		return ApiResponse.badRequest('project_id is required');
	}

	const accessResult = await ensureProjectAccess(
		locals.supabase,
		projectId,
		session.user.id,
		'read'
	);
	if ('error' in accessResult) {
		return accessResult.error;
	}

	const entityKind = url.searchParams.get('entity_kind');
	const entityId = url.searchParams.get('entity_id');
	const role = url.searchParams.get('role');
	const ocrStatus = url.searchParams.get('ocr_status');
	const limit = Math.min(parsePositiveInt(url.searchParams.get('limit'), 50), 200);
	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);

	let assetIds: string[] | null = null;
	if (entityKind || entityId) {
		if (!entityKind || !entityId) {
			return ApiResponse.badRequest('entity_kind and entity_id must be provided together');
		}
		if (!isEntityKind(entityKind)) {
			return ApiResponse.badRequest('Invalid entity_kind');
		}

		let linksQuery = (locals.supabase as any)
			.from('onto_asset_links')
			.select('asset_id')
			.eq('project_id', projectId)
			.eq('entity_kind', entityKind)
			.eq('entity_id', entityId);

		if (role) {
			linksQuery = linksQuery.eq('role', role);
		}

		const { data: linkRows, error: linksError } = await linksQuery;
		if (linksError) {
			return ApiResponse.databaseError(linksError);
		}

		const linkedAssetIds = (linkRows || []).map((row: { asset_id: string }) => row.asset_id);
		if (linkedAssetIds.length === 0) {
			return ApiResponse.success({ assets: [], count: 0 });
		}
		assetIds = linkedAssetIds;
	}

	let query = (locals.supabase as any)
		.from('onto_assets')
		.select('*', { count: 'exact' })
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (assetIds) {
		query = query.in('id', assetIds);
	}
	if (ocrStatus) {
		query = query.eq('ocr_status', ocrStatus);
	}

	const { data: assets, error: assetsError, count } = await query;
	if (assetsError) {
		return ApiResponse.databaseError(assetsError);
	}

	return ApiResponse.success({
		assets: assets || [],
		count: count || 0
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const body = (await request.json().catch(() => null)) as CreateAssetRequest | null;
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const projectId = body.project_id?.trim();
	const fileName = body.file_name?.trim();
	const contentType = body.content_type?.trim().toLowerCase();
	const fileSizeBytes = Number(body.file_size_bytes ?? 0);

	if (!projectId) {
		return ApiResponse.badRequest('project_id is required');
	}
	if (!fileName) {
		return ApiResponse.badRequest('file_name is required');
	}
	if (!contentType || !contentType.startsWith('image/')) {
		return ApiResponse.badRequest('content_type must be an image/* MIME type');
	}
	if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
		return ApiResponse.badRequest('file_size_bytes must be a positive number');
	}
	if (fileSizeBytes > MAX_IMAGE_SIZE_BYTES) {
		return ApiResponse.badRequest('Image exceeds 25MB limit');
	}

	const accessResult = await ensureProjectAccess(
		locals.supabase,
		projectId,
		session.user.id,
		'write'
	);
	if ('error' in accessResult) {
		return accessResult.error;
	}

	const assetId = crypto.randomUUID();
	const extension = getFileExtension(fileName, contentType);
	const storagePath = `projects/${projectId}/assets/${assetId}/original.${extension}`;

	const insertPayload = {
		id: assetId,
		project_id: projectId,
		kind: 'image',
		storage_bucket: 'onto-assets',
		storage_path: storagePath,
		original_filename: fileName,
		content_type: contentType,
		file_size_bytes: fileSizeBytes,
		width: typeof body.width === 'number' ? body.width : null,
		height: typeof body.height === 'number' ? body.height : null,
		alt_text: typeof body.alt_text === 'string' ? body.alt_text : null,
		caption: typeof body.caption === 'string' ? body.caption : null,
		metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
		ocr_status: 'pending',
		created_by: accessResult.actorId
	};

	const { data: createdAsset, error: insertError } = await (locals.supabase as any)
		.from('onto_assets')
		.insert(insertPayload)
		.select('*')
		.single();

	if (insertError) {
		return ApiResponse.databaseError(insertError);
	}

	const adminSupabase = createAdminSupabaseClient();
	const { data: uploadData, error: uploadError } = await adminSupabase.storage
		.from('onto-assets')
		.createSignedUploadUrl(storagePath);

	if (uploadError || !uploadData?.signedUrl) {
		await (locals.supabase as any).from('onto_assets').delete().eq('id', assetId);
		return ApiResponse.internalError(uploadError || new Error('Failed to create upload URL'));
	}

	return ApiResponse.created({
		asset: createdAsset,
		upload: {
			signed_url: uploadData.signedUrl,
			path: uploadData.path,
			token: uploadData.token ?? null
		}
	});
};
