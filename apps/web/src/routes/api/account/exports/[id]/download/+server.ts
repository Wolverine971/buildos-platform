// apps/web/src/routes/api/account/exports/[id]/download/+server.ts
// Redirects the export's owner to a 1-hour signed URL for one part of a ready,
// unexpired export. The user-exports bucket has no browser storage policy, so
// this route is the only way to fetch an export.
import type { RequestHandler } from './$types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { routeErrorResponse } from '$lib/server/route-error';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadExportById } from '$lib/server/user-data-export';
import { DATA_EXPORT_LINK_TTL_SECONDS } from '$lib/privacy/retention-policy';
import {
	USER_DATA_EXPORT_BUCKET,
	userDataExportFileName,
	userDataExportObjectPath
} from '$lib/privacy/user-data';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP_GONE = 410;

export const GET: RequestHandler = async (event) => {
	const {
		params,
		url,
		locals: { safeGetSession, supabase }
	} = event;
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const exportId = params.id;
	if (!UUID_PATTERN.test(exportId)) {
		return ApiResponse.notFound('Export');
	}
	const part = Number(url.searchParams.get('part') ?? '1');
	if (!Number.isInteger(part) || part < 1) {
		return ApiResponse.badRequest('Invalid part');
	}

	try {
		const row = await loadExportById(supabase, user.id, exportId);
		if (!row) {
			return ApiResponse.notFound('Export');
		}
		const expired =
			row.status === 'expired' ||
			(row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now());
		if (expired) {
			return ApiResponse.error(
				'This download has expired. Start a new export.',
				HTTP_GONE,
				ErrorCode.NOT_FOUND
			);
		}
		if (row.status !== 'ready' || !row.storage_path) {
			return ApiResponse.error(
				'This export is not ready yet.',
				HttpStatus.CONFLICT,
				ErrorCode.INVALID_REQUEST
			);
		}
		const parts = Math.max(1, row.part_count ?? 1);
		if (part > parts) {
			return ApiResponse.notFound('Export part');
		}

		const objectPath =
			part === 1 ? row.storage_path : userDataExportObjectPath(user.id, row.id, part);
		const { data: signed, error: signError } = await createAdminSupabaseClient()
			.storage.from(USER_DATA_EXPORT_BUCKET)
			.createSignedUrl(objectPath, DATA_EXPORT_LINK_TTL_SECONDS, {
				download: userDataExportFileName(row.completed_at, part, parts)
			});
		if (signError || !signed?.signedUrl) {
			throw signError ?? new Error('signed URL missing');
		}

		return new Response(null, {
			status: 303,
			headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		return routeErrorResponse(event, error, {
			operation: 'account.exports.download',
			userId: user.id,
			message: 'Could not prepare your download'
		});
	}
};
