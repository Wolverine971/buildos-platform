// apps/web/src/routes/api/cycles/[id]/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { deleteCycle, getCycle, updateCycle } from '$lib/server/cycles/cycle-service';
import { cycleApiErrorResponse } from '$lib/server/cycles/cycle-api-response';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	try {
		const cycle = await getCycle({ client: supabase, userId: user.id, cycleId: params.id });
		return ApiResponse.success({ cycle });
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to load the Cycle.');
	}
};

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);
	try {
		const cycle = await updateCycle({
			readClient: supabase,
			commandClient: createAdminSupabaseClient(),
			userId: user.id,
			cycleId: params.id,
			payload
		});
		return ApiResponse.success({ cycle }, 'Cycle updated.');
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to update the Cycle.');
	}
};

export const DELETE: RequestHandler = async ({
	params,
	url,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	try {
		const cycle = await deleteCycle({
			readClient: supabase,
			commandClient: createAdminSupabaseClient(),
			userId: user.id,
			cycleId: params.id,
			expectedVersion: Number(url.searchParams.get('expected_version'))
		});
		return ApiResponse.success({ cycle }, 'Cycle deleted.');
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to delete the Cycle.');
	}
};
