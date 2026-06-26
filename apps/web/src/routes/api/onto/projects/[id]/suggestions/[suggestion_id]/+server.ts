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
import { decideProjectSuggestionWithClarification } from '$lib/server/clarified-decision.service';
import { decideProjectSuggestion } from '$lib/server/project-suggestion-actions.service';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	let body: {
		action?: string;
		reason?: unknown;
		note?: unknown;
		feedback?: unknown;
		clarification?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const action = body.action;
	if (action !== 'approve' && action !== 'dismiss') {
		return ApiResponse.badRequest("action must be 'approve' or 'dismiss'");
	}

	const clarification =
		typeof body.clarification === 'string' && body.clarification.trim()
			? body.clarification
			: null;
	const outcome = clarification
		? await decideProjectSuggestionWithClarification({
				supabase: locals.supabase,
				userId: access.userId,
				projectId: access.projectId,
				suggestionId: params.suggestion_id,
				action,
				clarification,
				reason: body.reason
			})
		: await decideProjectSuggestion({
				supabase: locals.supabase,
				userId: access.userId,
				projectId: access.projectId,
				suggestionId: params.suggestion_id,
				action,
				feedback: body.feedback ?? { reason: body.reason, note: body.note }
			});

	if (!outcome.ok) {
		return ApiResponse.error(outcome.message, outcome.status);
	}
	const extendedOutcome = outcome as typeof outcome & {
		agentRun?: Record<string, unknown>;
		agent_run_id?: string;
		delegated?: boolean;
		degraded?: boolean;
	};

	return ApiResponse.success({
		suggestion: outcome.suggestion,
		result: outcome.result,
		agentRun: extendedOutcome.agentRun,
		agent_run_id: extendedOutcome.agent_run_id,
		delegated: extendedOutcome.delegated ?? false,
		degraded: extendedOutcome.degraded ?? false,
		alreadyDecided: outcome.alreadyDecided ?? false,
		superseded: outcome.superseded ?? false
	});
};
