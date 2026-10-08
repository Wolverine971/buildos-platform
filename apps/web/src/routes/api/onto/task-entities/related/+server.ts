// apps/web/src/routes/api/onto/task-entities/related/+server.ts
/**
 * GET /api/onto/task-entities/related?kind=person&key=<natural_key>&task_id=<current task>
 *
 * The entity card's "Also in": other tasks the caller can read that name the same person,
 * organization or place, and the numbers, emails and addresses those tasks tie to it.
 */
import type { RequestHandler } from './$types';
import type { TaskEntityKind } from '@buildos/shared-agent-ops/task-entities';
import { ApiResponse } from '$lib/utils/api-response';
import { loadRelatedTaskEntities } from '$lib/server/task-entities/task-entity-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_KINDS: readonly TaskEntityKind[] = ['person', 'org', 'place'];

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) return ApiResponse.unauthorized('Authentication required');

	const kind = url.searchParams.get('kind') ?? '';
	const key = (url.searchParams.get('key') ?? '').trim();
	const taskId = url.searchParams.get('task_id') ?? '';
	if (!CARD_KINDS.includes(kind as TaskEntityKind)) return ApiResponse.badRequest('Invalid kind');
	if (!key || key.length > 300) return ApiResponse.badRequest('Invalid key');
	if (!UUID.test(taskId)) return ApiResponse.badRequest('Invalid task id');

	try {
		return ApiResponse.success(
			await loadRelatedTaskEntities(locals.supabase, {
				kind: kind as TaskEntityKind,
				key,
				excludeTaskId: taskId
			})
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not load related tasks');
	}
};
