// apps/web/src/routes/api/knowledge/locate/questions/[id]/+server.ts
/**
 * POST /api/knowledge/locate/questions/:id
 *   { choice: 'option', key: string }   this is the company: save where it is, as known
 *   { choice: 'none_of_these' }         none of them: leave it for a web search
 *   { choice: 'skipped' }               close the question without an answer
 * The caller's own question only, with their own client (RLS, and KnowledgeStore's writes are
 * theirs). A question already answered is refused, so two tabs keep the first answer.
 */
import type { RequestHandler } from './$types';
import type { CompanyQuestionChoice } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';
import { answerCompanyQuestion } from '$lib/server/knowledge/company-locate.server';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');

	let body: { choice?: unknown; key?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	let answer: CompanyQuestionChoice;
	if (body.choice === 'option') {
		if (typeof body.key !== 'string' || !body.key.trim() || body.key.length > 500)
			return ApiResponse.badRequest('Pick one of the companies');
		answer = { choice: 'option', key: body.key };
	} else if (body.choice === 'none_of_these' || body.choice === 'skipped') {
		answer = { choice: body.choice };
	} else {
		return ApiResponse.badRequest('Invalid choice');
	}

	try {
		const result = await answerCompanyQuestion(
			knowledgeDb(locals.supabase),
			knowledgeStoreFor(locals.supabase, user.id),
			user.id,
			params.id,
			answer
		);
		return ApiResponse.success(result);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not save that answer');
	}
};
