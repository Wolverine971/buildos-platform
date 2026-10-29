// apps/web/src/routes/api/inbox/check-ins/+server.ts
// GET: "Did this happen?" check-ins from overdue tasks (and "Still on?" for quiet projects).
// POST: answers (done / move / drop / restore per task; pause / finish / restore per project).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	answerCheckIns,
	loadInboxCheckIns,
	parseCheckInAnswers
} from '$lib/server/inbox-check-ins.service';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = url.searchParams.get('project_id');
	if (projectId && !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project_id');

	try {
		const payload = await loadInboxCheckIns({
			supabase: locals.supabase,
			userId: user.id,
			// Invalid or missing zones fall back to America/New_York.
			timeZone: url.searchParams.get('tz'),
			projectId
		});
		return ApiResponse.success(payload);
	} catch (error) {
		console.error('[Inbox check-ins] Failed to load:', error);
		return ApiResponse.internalError(error, 'Failed to load check-ins');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const body = await request.json().catch(() => null);
	const parsed = parseCheckInAnswers(body);
	if (!parsed.ok) return ApiResponse.badRequest(parsed.error);

	try {
		// Per-answer outcomes (including access and not-found refusals) are in `results`.
		const payload = await answerCheckIns({
			supabase: locals.supabase,
			userId: user.id,
			answers: parsed.answers
		});
		return ApiResponse.success(payload);
	} catch (error) {
		console.error('[Inbox check-ins] Failed to save answers:', error);
		return ApiResponse.internalError(error, 'Failed to save check-in answers');
	}
};
