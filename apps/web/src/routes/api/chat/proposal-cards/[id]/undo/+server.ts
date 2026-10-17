// apps/web/src/routes/api/chat/proposal-cards/[id]/undo/+server.ts
//
// POST { session_id, seen_digest? }  (tasker 122, proposal-card rail)
//
// Undo an applied proposal card, once, within 7 days. Combine cards require
// the digest of the undo preview the user saw (GET …/undo-preview).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { undoProposalCard } from '$lib/server/proposal-cards/proposal-card.service';
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
	const sessionId = body?.session_id;
	const seen = parseSeenDigest(body?.seen_digest);
	if (!isUuid(sessionId)) return ApiResponse.badRequest('session_id is required');
	if (!seen.ok) return ApiResponse.badRequest('seen_digest is invalid');

	const result = await undoProposalCard({
		cardId: params.id,
		sessionId,
		seenDigest: seen.digest,
		userId: user.id,
		userClient: locals.supabase,
		admin: createAdminSupabaseClient()
	});
	if (!result.ok) return proposalCardFailureResponse(result);
	return ApiResponse.success(
		{
			undo: result.undo,
			already_undone: result.alreadyUndone,
			description: result.description
		},
		result.description.text
	);
};
