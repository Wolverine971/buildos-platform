// apps/web/src/routes/api/onto/projects/[id]/freshness/flags/[flag_id]/+server.ts
//
// POST /api/onto/projects/[id]/freshness/flags/[flag_id]  (Tasker 88)
//   body { action: 'not_stale' }
//   -> { flag: FreshnessFlagRecord; suggestionId: string | null }
//
// "Not out of date": records the calibration outcome and, for a drafted flag, rebuilds the
// pending bundle without that change (suggestionId is the bundle to approve now, if any).

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { markFreshnessFlagNotStale } from '$lib/server/freshness-radar.service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { parseJsonRequest } from '$lib/utils/request-validation';

const flagActionSchema = z.object({ action: z.literal('not_stale') }).strict();

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;
	if (!isValidUUID(params.flag_id)) return ApiResponse.badRequest('Invalid flag ID');

	const parsed = await parseJsonRequest(request, flagActionSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const outcome = await markFreshnessFlagNotStale({
			supabase: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: access.userId,
			projectId: access.projectId,
			flagId: params.flag_id
		});
		if (!outcome.ok) return ApiResponse.error(outcome.message, outcome.status);
		return ApiResponse.success({ flag: outcome.flag, suggestionId: outcome.suggestionId });
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to update the flag');
	}
};
