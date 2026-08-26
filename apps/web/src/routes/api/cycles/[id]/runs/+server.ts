// apps/web/src/routes/api/cycles/[id]/runs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { listCycleRuns } from '$lib/server/cycles/cycle-service';
import { cycleApiErrorResponse } from '$lib/server/cycles/cycle-api-response';

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	try {
		const runs = await listCycleRuns({
			client: supabase,
			userId: user.id,
			cycleId: params.id,
			limit: Number(url.searchParams.get('limit') || 50)
		});
		return ApiResponse.success({ runs });
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to load Cycle Runs.');
	}
};
