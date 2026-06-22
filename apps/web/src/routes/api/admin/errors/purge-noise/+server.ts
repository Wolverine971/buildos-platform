// apps/web/src/routes/api/admin/errors/purge-noise/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

function clampNumericOption(value: unknown, fallback: number, min: number, max: number): number {
	const numeric = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}

	return Math.min(Math.max(Math.trunc(numeric), min), max);
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { data: userData } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!userData || !userData.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const body = await parseRequestBody(request);
	const maxRows = clampNumericOption(body?.maxRows, 10_000, 1, 50_000);
	const batchSize = clampNumericOption(body?.batchSize, 500, 1, 1000);
	const adminSupabase = createAdminSupabaseClient();
	const errorLogger = ErrorLoggerService.getInstance(adminSupabase);

	try {
		const result = await errorLogger.purgeNonActionableNoise({ maxRows, batchSize });
		return ApiResponse.success(result);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to purge scanner noise');
	}
};
