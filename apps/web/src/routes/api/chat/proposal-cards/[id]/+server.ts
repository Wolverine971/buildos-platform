// apps/web/src/routes/api/chat/proposal-cards/[id]/+server.ts
//
// POST { choice, session_id, seen_digest? }  (tasker 122, proposal-card rail)
//
// A click on a chat proposal card. The click is the only consent. The body
// carries the card id (path), its chat session, the choice and the digest of
// what the card showed, never what to change: that comes from the card row,
// re-checked against its turn's owner and re-previewed under the user's own
// authority. See proposal-card.service.ts.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { resolveProposalCard } from '$lib/server/proposal-cards/proposal-card.service';
import {
	isUuid,
	parseSeenDigest,
	proposalCardFailureResponse,
	readJsonObject
} from '$lib/server/proposal-cards/proposal-card-http';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isUuid(params.id)) return ApiResponse.badRequest('Invalid card ID');

	const body = await readJsonObject(request);
	const choice = body?.choice;
	const sessionId = body?.session_id;
	const seen = parseSeenDigest(body?.seen_digest);
	if (typeof choice !== 'string' || !choice) return ApiResponse.badRequest('choice is required');
	if (!isUuid(sessionId)) return ApiResponse.badRequest('session_id is required');
	if (!seen.ok) return ApiResponse.badRequest('seen_digest is invalid');

	const result = await resolveProposalCard({
		cardId: params.id,
		sessionId,
		choice,
		seenDigest: seen.digest,
		userId: user.id,
		userClient: locals.supabase,
		admin: createAdminSupabaseClient()
	});
	if (!result.ok) return proposalCardFailureResponse(result);
	return ApiResponse.success(
		{
			resolution: result.resolution,
			already_resolved: result.alreadyResolved,
			description: result.description
		},
		result.description.text
	);
};
