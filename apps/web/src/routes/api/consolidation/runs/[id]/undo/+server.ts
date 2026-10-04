// apps/web/src/routes/api/consolidation/runs/[id]/undo/+server.ts
// POST — put back everything this run applied: the Organize batch, then archived docs.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireOntologyActor } from '$lib/server/ontology-api-access';
import { undoConsolidationRun } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure } from '$lib/server/consolidation/consolidation-http';

// Undo reverses an Organize batch, then restores one doc at a time.
export const config = { maxDuration: 60 };

export const POST: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid run ID');
	const actor = await requireOntologyActor({
		supabase: locals.supabase,
		user,
		audit: {
			endpoint: `/api/consolidation/runs/${params.id}/undo`,
			method: 'POST',
			entityType: 'project',
			consoleLabel: 'Consolidation API'
		},
		operation: 'consolidation_undo'
	});
	if (!actor.ok) return actor.response;
	try {
		const receipt = await undoConsolidationRun({
			session: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: user.id,
			actorId: actor.actor.actorId,
			runId: params.id
		});
		return ApiResponse.success({ receipt });
	} catch (error) {
		return consolidationFailure(error, 'Could not undo this consolidation.');
	}
};
