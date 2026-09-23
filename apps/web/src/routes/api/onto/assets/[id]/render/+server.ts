// apps/web/src/routes/api/onto/assets/[id]/render/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureAssetAccess } from '../../shared';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes
// Each call mints a new signed URL, so an uncached redirect makes the browser
// re-download an image it already has (and wastes viewer prefetches). Cache the
// redirect privately for a little less than the signed URL lives.
const REDIRECT_CACHE_SECONDS = SIGNED_URL_TTL_SECONDS - 5 * 60;

function parsePositiveNumber(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.floor(parsed);
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
	'image/heic': 'heic'
};

/** "<image name>.<ext>", falling back to the uploaded filename. */
function downloadFilename(asset: {
	caption?: string | null;
	original_filename?: string | null;
	content_type?: string | null;
}): string {
	const original = asset.original_filename?.trim() || '';
	const originalExt = /\.([a-z0-9]{2,5})$/i.exec(original)?.[1];
	const ext =
		originalExt?.toLowerCase() ??
		EXTENSION_BY_CONTENT_TYPE[String(asset.content_type ?? '').toLowerCase()] ??
		'png';
	const name = (asset.caption?.trim() || original.replace(/\.[a-z0-9]{2,5}$/i, '') || 'image')
		// Filesystem-unsafe characters, plus & # = + which encodeURI leaves raw in the query.
		.replace(/[\\/:*?"<>|&#=+\u0000-\u001f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
	return `${name || 'image'}.${ext}`;
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

	// ?download=1 serves the original file as an attachment named after the image.
	if (url.searchParams.has('download')) {
		const { data, error } = await (createAdminSupabaseClient().storage as any)
			.from(String(asset.storage_bucket))
			.createSignedUrl(String(asset.storage_path), SIGNED_URL_TTL_SECONDS, {
				// storage-js encodeURI()s the whole URL, so pass the name raw.
				download: downloadFilename(asset)
			});
		if (error || !data?.signedUrl) {
			return ApiResponse.internalError(error || new Error('Failed to generate download URL'));
		}
		return new Response(null, { status: 302, headers: { Location: data.signedUrl } });
	}

	const width = parsePositiveNumber(url.searchParams.get('width'));
	const height = parsePositiveNumber(url.searchParams.get('height'));
	const format = url.searchParams.get('format');

	const resize = url.searchParams.get('resize');

	const transform: Record<string, unknown> = {};
	if (width) transform.width = width;
	if (height) transform.height = height;
	if (width || height) {
		// Storage fills a missing dimension with the original's and defaults to
		// 'cover', so a width-only request cropped images into a full-height strip.
		// 'contain' scales proportionally unless the caller asks otherwise.
		transform.resize =
			resize && ['cover', 'contain', 'fill'].includes(resize) ? resize : 'contain';
	}
	if (format && ['origin', 'webp', 'avif'].includes(format)) {
		transform.format = format;
	}

	const { data, error } = await (createAdminSupabaseClient().storage as any)
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
			Location: data.signedUrl,
			'Cache-Control': `private, max-age=${REDIRECT_CACHE_SECONDS}`
		}
	});
};
