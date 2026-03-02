// apps/web/src/routes/api/profile/me/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getUserProfileWithCounts,
	updateUserProfileSettings
} from '$lib/server/user-profile.service';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const profile = await getUserProfileWithCounts(supabase, user.id);
		return ApiResponse.success({ profile });
	} catch (error) {
		console.error('[Profile API] Failed to load /api/profile/me:', error);
		return ApiResponse.internalError(error, 'Failed to load profile');
	}
};

export const PATCH: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const payload = body as {
		extraction_enabled?: unknown;
		summary?: unknown;
		safe_summary?: unknown;
	};

	const extractionEnabled =
		typeof payload.extraction_enabled === 'boolean' ? payload.extraction_enabled : undefined;
	const summary =
		typeof payload.summary === 'string' || payload.summary === null
			? payload.summary
			: undefined;
	const safeSummary =
		typeof payload.safe_summary === 'string' || payload.safe_summary === null
			? payload.safe_summary
			: undefined;

	if (extractionEnabled === undefined && summary === undefined && safeSummary === undefined) {
		return ApiResponse.badRequest(
			'At least one of extraction_enabled, summary, or safe_summary is required'
		);
	}

	try {
		const profile = await updateUserProfileSettings({
			supabase,
			userId: user.id,
			extractionEnabled,
			summary,
			safeSummary
		});
		return ApiResponse.success({ profile });
	} catch (error) {
		console.error('[Profile API] Failed to update /api/profile/me:', error);
		return ApiResponse.internalError(error, 'Failed to update profile');
	}
};
