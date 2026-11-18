// apps/web/src/routes/api/onto/task-entities/+server.ts
/**
 * GET /api/onto/task-entities?task_ids=<id>,<id>  - Entities read from these tasks' text
 *     &knowledge=1 also returns `knowledge`: task entity id → the caller's knowledge-graph
 *     entry for that person or organization (the reader's card opens it directly). For one
 *     task in a project other people are in, also `lens`: what the other members' People hold
 *     about the names on it (tasker 168; null for solo projects, which skip the read).
 *
 * One request for a whole list (Today) or a single task (reader, modal). RLS limits rows to
 * tasks the caller can read. `states` says which tasks a model has read; a task without one
 * shows the fixed formats its text contains until the read lands.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	MAX_TASK_IDS_PER_READ,
	loadTaskEntities,
	loadTaskKnowledgeIds,
	loadTaskKnowledgeLinks
} from '$lib/server/task-entities/task-entity-store';
import {
	loadProjectLens,
	projectHasOtherMembers,
	type LensEntry
} from '$lib/server/knowledge/sharing.server';

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
		if (url.searchParams.get('knowledge') !== '1') {
			return ApiResponse.success(await loadTaskEntities(locals.supabase, taskIds));
		}
		// The knowledge links load alongside the entities. Best effort: the task-only card
		// still works without them.
		const [result, links, lens] = await Promise.all([
			loadTaskEntities(locals.supabase, taskIds),
			loadTaskKnowledgeLinks(locals.supabase, session.user.id, taskIds).catch(() => []),
			taskIds.length === 1
				? loadTaskLens(locals.supabase, session.user.id, taskIds[0]!).catch(() => null)
				: Promise.resolve(null)
		]);
		const knowledge = await loadTaskKnowledgeIds(
			locals.supabase,
			session.user.id,
			result.entities,
			links
		).catch(() => ({}));
		return ApiResponse.success({ ...result, knowledge, lens });
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not load task entities');
	}
};

/** What other members know about this task's names; null when nobody else is in the project. */
async function loadTaskLens(
	supabase: App.Locals['supabase'],
	userId: string,
	taskId: string
): Promise<{ project_id: string; entries: LensEntry[] } | null> {
	const { data } = await supabase
		.from('onto_tasks')
		.select('project_id')
		.eq('id', taskId)
		.maybeSingle();
	const projectId = (data as { project_id: string | null } | null)?.project_id;
	if (!projectId || !(await projectHasOtherMembers(supabase, projectId, userId))) return null;
	const entries = await loadProjectLens(supabase, {
		projectId,
		recordKind: 'task',
		recordIds: [taskId]
	});
	return { project_id: projectId, entries };
}
