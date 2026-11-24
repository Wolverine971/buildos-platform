// apps/web/src/routes/api/knowledge/locate/questions/+server.ts
/**
 * GET /api/knowledge/locate/questions[?entity_id=]
 * The caller's open "Which one?" questions (tasker 170): organizations whose name several
 * companies share, each with the companies to choose between and the people the caller knows
 * there. With entity_id, the one question for that organization's card. Read with the caller's
 * own client.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';
import { listCompanyQuestions } from '$lib/server/knowledge/company-locate.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const entityId = url.searchParams.get('entity_id');
	if (entityId && !UUID_PATTERN.test(entityId)) return ApiResponse.badRequest('Invalid entry');
	try {
		return ApiResponse.success({
			questions: await listCompanyQuestions(knowledgeDb(locals.supabase), user.id, {
				...(entityId ? { entityId } : {})
			})
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load the questions');
	}
};
