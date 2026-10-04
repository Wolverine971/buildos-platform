// apps/web/src/routes/api/consolidation/questions/[id]/+server.ts
//
// POST — answer one consolidation question card.
//   { via: 'option', option_id }   pick an option
//   { via: 'skip' }                apply the card's keep-only skip option
//   { via: 'text', text }          typed answer: read back, not yet applied
//   { via: 'chat', message }       one turn of "chat about this"
//   { via: 'confirm' }             accept the read-back answer
// The meaning of typed text comes from a structured model reading that the
// owner confirms, never from matching words.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	answerWithOption,
	chatAboutQuestion,
	confirmDraftAnswer,
	readTypedAnswer
} from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure, readJsonBody } from '$lib/server/consolidation/consolidation-http';

// Typed answers and chat wait on a model call (30 s timeout, one retry).
export const config = { maxDuration: 60 };

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid question ID');
	const body = await readJsonBody(request);
	const admin = createAdminSupabaseClient();
	const base = { admin, session: locals.supabase, userId: user.id, questionId: params.id };
	try {
		switch (body.via) {
			case 'option':
				if (typeof body.option_id !== 'string')
					return ApiResponse.badRequest('option_id is required');
				return ApiResponse.success({
					answer: await answerWithOption({
						...base,
						via: 'option',
						optionId: body.option_id
					})
				});
			case 'skip':
				return ApiResponse.success({
					answer: await answerWithOption({ ...base, via: 'skip', optionId: '' })
				});
			case 'text':
				if (typeof body.text !== 'string')
					return ApiResponse.badRequest('text is required');
				return ApiResponse.success(await readTypedAnswer({ ...base, text: body.text }));
			case 'chat':
				if (typeof body.message !== 'string')
					return ApiResponse.badRequest('message is required');
				return ApiResponse.success(
					await chatAboutQuestion({ ...base, message: body.message })
				);
			case 'confirm':
				return ApiResponse.success({ answer: await confirmDraftAnswer(base) });
			default:
				return ApiResponse.badRequest('via must be option, skip, text, chat or confirm');
		}
	} catch (error) {
		return consolidationFailure(error, 'Could not save this answer.');
	}
};
