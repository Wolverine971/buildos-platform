// apps/web/src/routes/api/chat/shared-document-edits/[id]/+server.ts
//
// POST { choice: 'apply' | 'copy' | 'cancel', session_id }  (project hierarchy Phase 2)
//
// A click on the chat confirm card for an edit to a parent's shared document.
// The click is the only consent. The body carries the card id (path), its chat
// session and the choice — never the edit: that is read from the card's
// service-only ledger row. See shared-document-edit-card.service.ts.
import type { RequestHandler } from './$types';
import {
	SHARED_DOCUMENT_EDIT_CHOICES,
	describeSharedDocumentEditResolution,
	type SharedDocumentEditChoice
} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { resolveSharedDocumentEditCard } from '$lib/server/shared-document-edit-card.service';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid card ID');

	let body: Record<string, unknown> | null = null;
	try {
		const parsed: unknown = await request.json();
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
			body = parsed as Record<string, unknown>;
	} catch {
		body = null;
	}
	const choice = body?.choice;
	const sessionId = body?.session_id;
	if (
		typeof choice !== 'string' ||
		!SHARED_DOCUMENT_EDIT_CHOICES.includes(choice as SharedDocumentEditChoice)
	)
		return ApiResponse.badRequest('choice must be apply, copy, or cancel');
	if (typeof sessionId !== 'string' || !isValidUUID(sessionId))
		return ApiResponse.badRequest('session_id is required');

	const result = await resolveSharedDocumentEditCard({
		cardId: params.id,
		sessionId,
		choice: choice as SharedDocumentEditChoice,
		userId: user.id,
		userClient: locals.supabase,
		admin: createAdminSupabaseClient()
	});
	if (!result.ok) return ApiResponse.error(result.message, result.status, result.code);
	return ApiResponse.success(
		{ resolution: result.resolution, already_resolved: result.alreadyResolved },
		describeSharedDocumentEditResolution(result.resolution).text
	);
};
