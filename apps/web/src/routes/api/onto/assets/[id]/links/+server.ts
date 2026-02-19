// apps/web/src/routes/api/onto/assets/[id]/links/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureAssetAccess, ensureEntityInProject, isEntityKind } from '../../shared';

type LinkRequestBody = {
	entity_kind?: string;
	entity_id?: string;
	role?: string;
	props?: Record<string, unknown> | null;
};

const ALLOWED_ROLES = new Set(['attachment', 'inline', 'gallery', 'cover']);

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const assetId = params.id;
	if (!assetId) {
		return ApiResponse.badRequest('Asset ID required');
	}

	const body = (await request.json().catch(() => null)) as LinkRequestBody | null;
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const entityKind = body.entity_kind?.trim() || '';
	const entityId = body.entity_id?.trim() || '';
	const role = body.role?.trim() || 'attachment';

	if (!entityKind || !entityId) {
		return ApiResponse.badRequest('entity_kind and entity_id are required');
	}
	if (!isEntityKind(entityKind)) {
		return ApiResponse.badRequest('Invalid entity_kind');
	}
	if (!ALLOWED_ROLES.has(role)) {
		return ApiResponse.badRequest('Invalid role');
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

	const { asset, actorId } = accessResult;

	const entityCheck = await ensureEntityInProject(locals.supabase, {
		projectId: String(asset.project_id),
		entityKind,
		entityId
	});
	if ('error' in entityCheck) {
		return entityCheck.error;
	}

	const { data: link, error } = await (locals.supabase as any)
		.from('onto_asset_links')
		.upsert(
			{
				project_id: asset.project_id,
				asset_id: asset.id,
				entity_kind: entityKind,
				entity_id: entityId,
				role,
				props: body.props && typeof body.props === 'object' ? body.props : {},
				created_by: actorId
			},
			{
				onConflict: 'asset_id,entity_kind,entity_id,role',
				ignoreDuplicates: false
			}
		)
		.select('*')
		.single();

	if (error) {
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ link });
};

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const assetId = params.id;
	if (!assetId) {
		return ApiResponse.badRequest('Asset ID required');
	}

	const entityKind = url.searchParams.get('entity_kind')?.trim() || '';
	const entityId = url.searchParams.get('entity_id')?.trim() || '';
	const role = url.searchParams.get('role')?.trim();

	if (!entityKind || !entityId) {
		return ApiResponse.badRequest('entity_kind and entity_id are required');
	}
	if (!isEntityKind(entityKind)) {
		return ApiResponse.badRequest('Invalid entity_kind');
	}
	if (role && !ALLOWED_ROLES.has(role)) {
		return ApiResponse.badRequest('Invalid role');
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

	let deleteQuery = (locals.supabase as any)
		.from('onto_asset_links')
		.delete()
		.eq('asset_id', assetId)
		.eq('entity_kind', entityKind)
		.eq('entity_id', entityId);

	if (role) {
		deleteQuery = deleteQuery.eq('role', role);
	}

	const { error } = await deleteQuery;
	if (error) {
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ unlinked: true });
};
