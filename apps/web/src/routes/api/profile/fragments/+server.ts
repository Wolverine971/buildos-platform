// apps/web/src/routes/api/profile/fragments/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	listProfileFragments,
	updateProfileFragmentStatuses
} from '$lib/server/user-profile.service';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const status = url.searchParams.get('status');
	const limitRaw = url.searchParams.get('limit');
	const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;

	try {
		const { profile, fragments } = await listProfileFragments({
			supabase,
			userId: user.id,
			status,
			limit: Number.isFinite(limit) ? limit : 100
		});
		return ApiResponse.success({
			profile_id: profile.id,
			fragments
		});
	} catch (error) {
		console.error('[Profile API] Failed to list fragments:', error);
		return ApiResponse.internalError(error, 'Failed to load profile fragments');
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
		fragment_ids?: unknown;
		status?: unknown;
	};

	if (!Array.isArray(payload.fragment_ids) || payload.fragment_ids.length === 0) {
		return ApiResponse.badRequest('fragment_ids must be a non-empty array');
	}

	const status =
		payload.status === 'pending' ||
		payload.status === 'accepted' ||
		payload.status === 'dismissed' ||
		payload.status === 'needs_review'
			? payload.status
			: null;

	if (!status) {
		return ApiResponse.badRequest(
			'status must be one of pending, accepted, dismissed, needs_review'
		);
	}

	const fragmentIds = payload.fragment_ids.filter(
		(id): id is string => typeof id === 'string' && id.trim().length > 0
	);

	if (!fragmentIds.length) {
		return ApiResponse.badRequest('fragment_ids must contain valid ids');
	}

	try {
		const result = await updateProfileFragmentStatuses({
			supabase,
			userId: user.id,
			fragmentIds,
			status
		});
		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Profile API] Failed to update fragments:', error);
		return ApiResponse.internalError(error, 'Failed to update profile fragments');
	}
};
