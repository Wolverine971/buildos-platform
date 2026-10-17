// apps/web/src/routes/api/chat/proposal-cards/[id]/undo-preview/+server.ts
//
// GET ?session_id=  (tasker 122, proposal-card rail): what an Undo would bring
// back and what stays, with the digest the Undo click must send. Read-only.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { previewProposalCard } from '$lib/server/proposal-cards/proposal-card.service';
import { isUuid, proposalCardFailureResponse } from '$lib/server/proposal-cards/proposal-card-http';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isUuid(params.id)) return ApiResponse.badRequest('Invalid card ID');
	const sessionId = url.searchParams.get('session_id');
	if (!isUuid(sessionId)) return ApiResponse.badRequest('session_id is required');

	const result = await previewProposalCard({
		cardId: params.id,
		sessionId,
		phase: 'undo',
		userId: user.id,
		userClient: locals.supabase,
		admin: createAdminSupabaseClient()
	});
	if (!result.ok) return proposalCardFailureResponse(result);
	return ApiResponse.success({ view: result.view, digest: result.digest });
};
