// apps/web/src/routes/api/onto/projects/[id]/suggestions/[suggestion_id]/+server.ts
//
// POST /api/onto/projects/[id]/suggestions/[suggestion_id]
//   body: { action: 'approve' | 'dismiss' }
//
// approve  -> replay the suggestion's operations through ChatToolExecutor
//             (the same write path the agentic chat uses) and mark applied/failed
// dismiss  -> mark rejected
//
// Gated by PROJECT_LOOPS_ENABLED.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { decideProjectSuggestion } from '$lib/server/project-suggestion-actions.service';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	let body: { action?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const action = body.action;
	if (action !== 'approve' && action !== 'dismiss') {
		return ApiResponse.badRequest("action must be 'approve' or 'dismiss'");
	}

	const outcome = await decideProjectSuggestion({
		supabase: locals.supabase,
		userId: access.userId,
		projectId: access.projectId,
		suggestionId: params.suggestion_id,
		action
	});

	if (!outcome.ok) {
		return ApiResponse.error(outcome.message, outcome.status);
	}

	return ApiResponse.success({
		suggestion: outcome.suggestion,
		result: outcome.result,
		alreadyDecided: outcome.alreadyDecided ?? false
	});
};
