// apps/web/src/routes/api/consolidation/runs/+server.ts
//
// POST { project_id, request? } — start consolidating a project and its sub-projects.
// The worker surveys the docs; the run page follows along. Returns the open run
// instead when one is already going for this project.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	requireCurrentActorProjectAccess,
	requireOntologyActor
} from '$lib/server/ontology-api-access';
import { startConsolidationRun } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure, readJsonBody } from '$lib/server/consolidation/consolidation-http';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	const body = await readJsonBody(request);
	const projectId = body.project_id;
	if (typeof projectId !== 'string' || !isValidUUID(projectId))
		return ApiResponse.badRequest('project_id is required');
	const audit = {
		endpoint: '/api/consolidation/runs',
		method: 'POST',
		entityType: 'project',
		projectId,
		consoleLabel: 'Consolidation API'
	};
	const actor = await requireOntologyActor({
		supabase: locals.supabase,
		user,
		audit,
		operation: 'consolidation_actor'
	});
	if (!actor.ok) return actor.response;
	const access = await requireCurrentActorProjectAccess({
		supabase: locals.supabase,
		actor: actor.actor,
		projectId,
		requiredAccess: 'write',
		audit,
		operation: 'consolidation_access',
		forbiddenMessage: 'You need edit access to consolidate this project.'
	});
	if (!access.ok) return access.response;
	try {
		const result = await startConsolidationRun({
			session: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: user.id,
			projectId,
			request: typeof body.request === 'string' ? body.request : null
		});
		return ApiResponse.success(result);
	} catch (error) {
		return consolidationFailure(error, 'Could not start the consolidation.');
	}
};
