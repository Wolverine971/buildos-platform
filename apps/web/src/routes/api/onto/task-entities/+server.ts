// apps/web/src/routes/api/onto/task-entities/+server.ts
/**
 * GET /api/onto/task-entities?task_ids=<id>,<id>  - Entities read from these tasks' text
 *
 * One request for a whole list (Today) or a single task (reader, modal). RLS limits rows to
 * tasks the caller can read. `states` says which tasks a model has read; a task without one
 * shows the fixed formats its text contains until the read lands.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	MAX_TASK_IDS_PER_READ,
	loadTaskEntities
} from '$lib/server/task-entities/task-entity-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) return ApiResponse.unauthorized('Authentication required');

	const taskIds = (url.searchParams.get('task_ids') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	if (!taskIds.length) return ApiResponse.badRequest('task_ids is required');
	if (taskIds.length > MAX_TASK_IDS_PER_READ) {
		return ApiResponse.badRequest(`At most ${MAX_TASK_IDS_PER_READ} task ids per request`);
	}
	if (!taskIds.every((id) => UUID.test(id))) return ApiResponse.badRequest('Invalid task id');

	try {
		return ApiResponse.success(await loadTaskEntities(locals.supabase, taskIds));
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not load task entities');
	}
};
