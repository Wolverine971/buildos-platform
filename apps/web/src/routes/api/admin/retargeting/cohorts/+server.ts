// apps/web/src/routes/api/admin/retargeting/cohorts/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';

function parseBoolean(value: string | null): boolean | undefined {
	if (value === null) {
		return undefined;
	}

	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	return undefined;
}

function parseNumber(value: unknown): number | undefined {
	if (value === null || typeof value === 'undefined' || value === '') {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const cohortId = url.searchParams.get('cohort_id')?.trim();
	if (!cohortId) {
		return ApiResponse.badRequest('cohort_id is required');
	}

	try {
		const service = new RetargetingPilotService(createAdminSupabaseClient());
		const payload = await service.getCohortMembers({
			campaignId: url.searchParams.get('campaign_id')?.trim() || undefined,
			cohortId,
			batchId: url.searchParams.get('batch_id')?.trim() || undefined,
			includeHoldout: parseBoolean(url.searchParams.get('include_holdout'))
		});

		return ApiResponse.success(payload);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load retargeting cohort');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const body = await request.json();
		const cohortId = typeof body?.cohort_id === 'string' ? body.cohort_id.trim() : '';
		if (!cohortId) {
			return ApiResponse.badRequest('cohort_id is required');
		}

		const service = new RetargetingPilotService(createAdminSupabaseClient());
		const payload = await service.freezeCohort({
			campaignId: typeof body?.campaign_id === 'string' ? body.campaign_id.trim() : undefined,
			cohortId,
			cohortFrozenAt:
				typeof body?.cohort_frozen_at === 'string' ? body.cohort_frozen_at : undefined,
			batchSize: parseNumber(body?.batch_size),
			holdoutUsersIfSmall: parseNumber(body?.holdout_users_if_small),
			holdoutPctIfLarge: parseNumber(body?.holdout_pct_if_large),
			conversionWindowDays: parseNumber(body?.conversion_window_days),
			replaceExisting: body?.replace_existing === true
		});

		return ApiResponse.created(payload);
	} catch (error) {
		if (error instanceof Error && error.message.includes('already exists')) {
			return ApiResponse.conflict(error.message);
		}

		return ApiResponse.internalError(error, 'Failed to freeze retargeting cohort');
	}
};
