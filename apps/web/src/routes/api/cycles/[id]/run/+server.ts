// apps/web/src/routes/api/cycles/[id]/run/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { admitManualCycleRun } from '$lib/server/cycles/cycle-service';
import { cycleApiErrorResponse } from '$lib/server/cycles/cycle-api-response';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => ({}));
	try {
		const admission = await admitManualCycleRun({
			readClient: supabase,
			commandClient: createAdminSupabaseClient(),
			userId: user.id,
			userTimezone: user.timezone,
			cycleId: params.id,
			idempotencyKey: request.headers.get('Idempotency-Key'),
			payload
		});
		return ApiResponse.success({ admission }, 'Cycle Run admitted.');
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to start the Cycle.');
	}
};
