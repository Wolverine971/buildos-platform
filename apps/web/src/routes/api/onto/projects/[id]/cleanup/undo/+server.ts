// apps/web/src/routes/api/onto/projects/[id]/cleanup/undo/+server.ts
//
// POST /api/onto/projects/[id]/cleanup/undo
//   body: { suggestion_id }
//   -> { ok: true, view }
//
// Undo one change a review pass applied without asking ("Done for you", tasker 149). The row's
// stored undo replays through the app's own write paths (project-cleanup-undo.service.ts); the
// undo is recorded as the user's decision, then the cleanup card is resynced and the fresh,
// verified view returned.
//
// Gated by PROJECT_LOOPS_ENABLED.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { runAfterResponse } from '$lib/server/background';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { captureServerEvent } from '$lib/server/posthog';
import { refreshCleanupCard } from '$lib/server/project-cleanup-decisions.service';
import { undoAutoAppliedCleanup } from '$lib/server/project-cleanup-undo.service';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const undoSchema = z
	.object({
		suggestion_id: z.string().trim().min(1).max(128)
	})
	.strict();

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	const parsed = await parseJsonRequest(request, undoSchema);
	if (!parsed.ok) return parsed.response;

	let outcome;
	try {
		outcome = await undoAutoAppliedCleanup({
			supabase: locals.supabase,
			userId: access.userId,
			actorId: access.actorId,
			projectId: access.projectId,
			suggestionId: parsed.data.suggestion_id
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to undo the change');
	}

	runAfterResponse(
		captureServerEvent(access.userId, 'project_cleanup_auto_apply_undone', {
			project_id: access.projectId,
			suggestion_id: parsed.data.suggestion_id,
			ok: outcome.ok,
			status: outcome.ok ? 200 : outcome.status
		}),
		'project_cleanup_auto_apply_undone'
	);

	if (!outcome.ok) {
		// A partial undo still changed the project: resync the card before reporting it.
		if (outcome.status === 500) await refreshCleanupCard(access.projectId);
		if (outcome.status === 404) return ApiResponse.notFound('Change');
		if (outcome.status === 409) return ApiResponse.conflict(outcome.message);
		return ApiResponse.error(outcome.message, outcome.status);
	}

	const view = await refreshCleanupCard(access.projectId);
	return ApiResponse.success({ ok: true, view });
};
