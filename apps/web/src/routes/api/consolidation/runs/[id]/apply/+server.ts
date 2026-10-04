// apps/web/src/routes/api/consolidation/runs/[id]/apply/+server.ts
// POST — apply the plan: moves as one Organize batch, then merged docs, then archives. Unanswered
// groups stay as they are. Returns { confirm } instead when the moves would unlink things; send
// { accept_side_effects: true } to go ahead.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireOntologyActor } from '$lib/server/ontology-api-access';
import { applyConsolidationRun } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure, readJsonBody } from '$lib/server/consolidation/consolidation-http';

// Apply runs an Organize batch, then archives one doc at a time.
export const config = { maxDuration: 60 };

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid run ID');
	const actor = await requireOntologyActor({
		supabase: locals.supabase,
		user,
		audit: {
			endpoint: `/api/consolidation/runs/${params.id}/apply`,
			method: 'POST',
			entityType: 'project',
			consoleLabel: 'Consolidation API'
		},
		operation: 'consolidation_apply'
	});
	if (!actor.ok) return actor.response;
	const body = await readJsonBody(request);
	try {
		const result = await applyConsolidationRun({
			session: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: user.id,
			actorId: actor.actor.actorId,
			runId: params.id,
			acceptSideEffects: body.accept_side_effects === true
		});
		return ApiResponse.success(result);
	} catch (error) {
		return consolidationFailure(error, 'Could not apply this consolidation.');
	}
};
