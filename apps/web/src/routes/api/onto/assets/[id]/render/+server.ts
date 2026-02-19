// apps/web/src/routes/api/onto/assets/[id]/render/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureAssetAccess } from '../../shared';

const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes

function parsePositiveNumber(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.floor(parsed);
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
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

	const { asset } = accessResult;
	const width = parsePositiveNumber(url.searchParams.get('width'));
	const height = parsePositiveNumber(url.searchParams.get('height'));
	const format = url.searchParams.get('format');

	const transform: Record<string, unknown> = {};
	if (width) transform.width = width;
	if (height) transform.height = height;
	if (format && ['origin', 'webp', 'avif'].includes(format)) {
		transform.format = format;
	}

	const adminSupabase = createAdminSupabaseClient();
	const { data, error } = await (adminSupabase.storage as any)
		.from(String(asset.storage_bucket))
		.createSignedUrl(String(asset.storage_path), SIGNED_URL_TTL_SECONDS, {
			transform: Object.keys(transform).length ? transform : undefined
		});

	if (error || !data?.signedUrl) {
		return ApiResponse.internalError(error || new Error('Failed to generate render URL'));
	}

	return new Response(null, {
		status: 302,
		headers: {
			Location: data.signedUrl
		}
	});
};
