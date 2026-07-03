// apps/web/src/routes/api/admin/retargeting/cohorts/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	getRetargetingConflictMessage,
	getRetargetingValidationMessage
} from '$lib/server/retargeting-pilot.errors';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';
import { parseJsonRequest } from '$lib/utils/request-validation';

const retargetingNumericInputSchema = z.union([z.string(), z.number(), z.null()]).optional();

const freezeRetargetingCohortSchema = z
	.object({
		campaign_id: z.string().optional(),
		cohort_id: z.string().min(1),
		cohort_frozen_at: z.string().optional(),
		batch_size: retargetingNumericInputSchema,
		holdout_users_if_small: retargetingNumericInputSchema,
		holdout_pct_if_large: retargetingNumericInputSchema,
		conversion_window_days: retargetingNumericInputSchema,
		replace_existing: z.boolean().optional()
	})
	.strict();

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

function hasInvalidNumericInput(value: unknown): boolean {
	return !(
		value === null ||
		typeof value === 'undefined' ||
		value === '' ||
		Number.isFinite(Number(value))
	);
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

	let errorLogger: ErrorLoggerService | null = null;
	try {
		const adminSupabase = createAdminSupabaseClient();
		errorLogger = ErrorLoggerService.getInstance(adminSupabase);
		const includeHoldoutParam = url.searchParams.get('include_holdout');
		const includeHoldout = parseBoolean(includeHoldoutParam);
		if (includeHoldoutParam !== null && typeof includeHoldout === 'undefined') {
			return ApiResponse.badRequest('include_holdout must be true or false');
		}

		const service = new RetargetingPilotService(adminSupabase);
		const payload = await service.getCohortMembers({
			campaignId: url.searchParams.get('campaign_id')?.trim() || undefined,
			cohortId,
			batchId: url.searchParams.get('batch_id')?.trim() || undefined,
			includeHoldout
		});

		return ApiResponse.success(payload);
	} catch (error) {
		await errorLogger?.logAPIError(error, '/api/admin/retargeting/cohorts', 'GET', user.id, {
			cohortId,
			campaignId: url.searchParams.get('campaign_id')?.trim() || null,
			batchId: url.searchParams.get('batch_id')?.trim() || null
		});
		return ApiResponse.internalError(error, 'Failed to load retargeting cohort');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const parsed = await parseJsonRequest(request, freezeRetargetingCohortSchema);
	if (!parsed.ok) return parsed.response;
	const body = parsed.data;

	const invalidNumericField = [
		'batch_size',
		'holdout_users_if_small',
		'holdout_pct_if_large',
		'conversion_window_days'
	].find((field) => hasInvalidNumericInput((body as Record<string, unknown>)[field]));
	if (invalidNumericField) {
		return ApiResponse.badRequest(`${invalidNumericField} must be a number`);
	}

	let errorLogger: ErrorLoggerService | null = null;
	try {
		const cohortId = body.cohort_id.trim();
		if (!cohortId) {
			return ApiResponse.badRequest('cohort_id is required');
		}

		const adminSupabase = createAdminSupabaseClient();
		errorLogger = ErrorLoggerService.getInstance(adminSupabase);
		const service = new RetargetingPilotService(adminSupabase);
		const payload = await service.freezeCohort({
			campaignId: body.campaign_id?.trim() || undefined,
			cohortId,
			cohortFrozenAt: body.cohort_frozen_at,
			batchSize: parseNumber(body?.batch_size),
			holdoutUsersIfSmall: parseNumber(body?.holdout_users_if_small),
			holdoutPctIfLarge: parseNumber(body?.holdout_pct_if_large),
			conversionWindowDays: parseNumber(body?.conversion_window_days),
			replaceExisting: body.replace_existing === true
		});

		return ApiResponse.created(payload);
	} catch (error) {
		const validationMessage = getRetargetingValidationMessage(error);
		if (validationMessage) {
			return ApiResponse.badRequest(validationMessage);
		}

		const conflictMessage = getRetargetingConflictMessage(error);
		if (conflictMessage) {
			return ApiResponse.conflict(conflictMessage);
		}

		await errorLogger?.logAPIError(error, '/api/admin/retargeting/cohorts', 'POST', user.id, {
			campaignId: body.campaign_id?.trim() || null,
			cohortId: body.cohort_id.trim() || null,
			replaceExisting: body.replace_existing === true
		});
		return ApiResponse.internalError(error, 'Failed to freeze retargeting cohort');
	}
};
