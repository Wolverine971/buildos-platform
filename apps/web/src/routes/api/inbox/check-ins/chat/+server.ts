// apps/web/src/routes/api/inbox/check-ins/chat/+server.ts
// "Tell me how it went": opens a project chat about a check-in card's overdue tasks, with
// the assistant's question already in the thread.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { CHECK_IN_MAX_ANSWERS } from '$lib/types/inbox-check-ins';
import { CheckInChatError, createCheckInChatSession } from '$lib/server/inbox-check-ins.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = typeof body?.project_id === 'string' ? body.project_id : null;
	if (!projectId || !isValidUUID(projectId)) {
		return ApiResponse.badRequest('project_id must be a UUID');
	}
	const rawTaskIds = Array.isArray(body?.task_ids) ? body.task_ids : [];
	const validTaskIds = rawTaskIds.filter(
		(id): id is string => typeof id === 'string' && isValidUUID(id)
	);
	if (validTaskIds.length === 0 || validTaskIds.length !== rawTaskIds.length) {
		return ApiResponse.badRequest('task_ids must be a non-empty array of UUIDs');
	}
	const taskIds = [...new Set(validTaskIds)];
	if (taskIds.length > CHECK_IN_MAX_ANSWERS) {
		return ApiResponse.badRequest(`At most ${CHECK_IN_MAX_ANSWERS} tasks per chat`);
	}

	// The chat marks, moves and archives tasks, so it needs write access.
	const access = await requireProjectMemberAccess({
		locals,
		user,
		projectId,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	try {
		const result = await createCheckInChatSession({
			supabase: locals.supabase,
			userId: user.id,
			projectId,
			taskIds,
			timeZone: typeof body?.tz === 'string' ? body.tz : null
		});
		return result.created ? ApiResponse.created(result) : ApiResponse.success(result);
	} catch (error) {
		if (error instanceof CheckInChatError) {
			return ApiResponse.error(error.message, error.status, error.code);
		}
		console.error('[Inbox check-ins] Failed to open chat:', error);
		return ApiResponse.databaseError(error);
	}
};
