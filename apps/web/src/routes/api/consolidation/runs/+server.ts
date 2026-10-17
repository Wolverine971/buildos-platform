// apps/web/src/routes/api/consolidation/runs/+server.ts
//
// POST { project_id?, project_ids?, mode?, request? } — start consolidating.
// Scope: `project_ids` (2-20 projects you can edit; the first is the root, where
// things would end up), else `project_id` and its sub-projects. `mode: 'check'`
// is the quick duplicate check (tasker 122): it only finds groups, ends
// `checked`, and never blocks a full run. A full run returns the open one
// instead when one is already going for the same projects.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	requireCurrentActorProjectAccess,
	requireOntologyActor
} from '$lib/server/ontology-api-access';
import { parseConsolidationRunMode } from '@buildos/shared-agent-ops/consolidation';
import { startConsolidationRun } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure, readJsonBody } from '$lib/server/consolidation/consolidation-http';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	const body = await readJsonBody(request);
	const projectIds = body.project_ids;
	if (projectIds !== undefined && !Array.isArray(projectIds))
		return ApiResponse.badRequest('project_ids must be a list of project ids');
	const projectId = body.project_id ?? (Array.isArray(projectIds) ? projectIds[0] : undefined);
	if (typeof projectId !== 'string' || !isValidUUID(projectId))
		return ApiResponse.badRequest('project_id or project_ids is required');
	const mode = body.mode === undefined ? 'full' : parseConsolidationRunMode(body.mode);
	if (!mode) return ApiResponse.badRequest("mode must be 'full' or 'check'");
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
	// The root here; every other project in `project_ids` is checked by the service.
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
			projectIds: Array.isArray(projectIds) ? projectIds : null,
			mode,
			request: typeof body.request === 'string' ? body.request : null
		});
		return ApiResponse.success(result);
	} catch (error) {
		return consolidationFailure(error, 'Could not start the consolidation.');
	}
};
