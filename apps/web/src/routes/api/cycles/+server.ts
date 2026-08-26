// apps/web/src/routes/api/cycles/+server.ts
import type { RequestHandler } from './$types';
import { CYCLE_KINDS, type CycleKind } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { createCycle, listCycles } from '$lib/server/cycles/cycle-service';
import { cycleApiErrorResponse } from '$lib/server/cycles/cycle-api-response';

const CYCLE_KIND_SET = new Set<string>(CYCLE_KINDS);
const CYCLE_STATE_SET = new Set(['active', 'paused', 'deleted']);

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const kindParam = url.searchParams.get('kind');
	const stateParam = url.searchParams.get('state');
	if (kindParam && !CYCLE_KIND_SET.has(kindParam)) {
		return ApiResponse.badRequest('Unknown Cycle kind.');
	}
	if (stateParam && !CYCLE_STATE_SET.has(stateParam)) {
		return ApiResponse.badRequest('Unknown Cycle state.');
	}

	try {
		const cycles = await listCycles({
			client: supabase,
			userId: user.id,
			kind: (kindParam as CycleKind | null) ?? undefined,
			state: (stateParam as 'active' | 'paused' | 'deleted' | null) ?? undefined,
			limit: Number(url.searchParams.get('limit') || 50)
		});
		return ApiResponse.success({ cycles });
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to load Cycles.');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);
	try {
		const cycle = await createCycle({
			readClient: supabase,
			commandClient: createAdminSupabaseClient(),
			userId: user.id,
			payload
		});
		return ApiResponse.created({ cycle }, 'Cycle created.');
	} catch (error) {
		return cycleApiErrorResponse(error, 'Failed to create the Cycle.');
	}
};
