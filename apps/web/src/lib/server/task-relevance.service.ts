// apps/web/src/lib/server/task-relevance.service.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';

type SupabaseClient = App.Locals['supabase'];

type TaskLogRow = {
	entity_id: string;
	changed_by_actor_id: string | null;
	changed_by: string | null;
};

type ActorByUserRow = {
	id: string;
	user_id: string;
};

export function attachLastChangedByActorToTasks<T extends { id: string }>(
	tasks: T[],
	lastChangedByActorMap: Map<string, string>
): Array<T & { last_changed_by_actor_id: string | null }> {
	return tasks.map((task) => ({
		...task,
		last_changed_by_actor_id: lastChangedByActorMap.get(task.id) ?? null
	}));
}

export async function fetchTaskLastChangedByActorMap({
	supabase,
	projectId,
	taskIds
}: {
	supabase: SupabaseClient;
	projectId: string;
	taskIds: string[];
}): Promise<Map<string, string>> {
	const byTaskId = new Map<string, string>();

	if (taskIds.length === 0) {
		return byTaskId;
	}

	const uniqueTaskIds = Array.from(new Set(taskIds.filter((id) => isValidUUID(id))));
	if (uniqueTaskIds.length === 0) {
		return byTaskId;
	}

	const { data, error } = await (supabase as any)
		.from('onto_project_logs')
		.select('entity_id, changed_by_actor_id, changed_by')
		.eq('project_id', projectId)
		.eq('entity_type', 'task')
		.in('entity_id', uniqueTaskIds)
		.in('action', ['created', 'updated'])
		.order('created_at', { ascending: false });

	if (error) {
		throw error;
	}

	const unresolvedByTaskId = new Map<string, string>();
	const userIdsToResolve = new Set<string>();

	for (const row of (data ?? []) as TaskLogRow[]) {
		if (
			!row.entity_id ||
			byTaskId.has(row.entity_id) ||
			unresolvedByTaskId.has(row.entity_id)
		) {
			continue;
		}

		if (row.changed_by_actor_id) {
			byTaskId.set(row.entity_id, row.changed_by_actor_id);
			continue;
		}

		if (row.changed_by && isValidUUID(row.changed_by)) {
			unresolvedByTaskId.set(row.entity_id, row.changed_by);
			userIdsToResolve.add(row.changed_by);
		}
	}

	if (unresolvedByTaskId.size === 0 || userIdsToResolve.size === 0) {
		return byTaskId;
	}

	const { data: actorRows, error: actorError } = await (supabase as any)
		.from('onto_actors')
		.select('id, user_id')
		.in('user_id', Array.from(userIdsToResolve));

	if (actorError) {
		throw actorError;
	}

	const actorIdByUserId = new Map<string, string>();
	for (const actor of (actorRows ?? []) as ActorByUserRow[]) {
		if (actor.user_id && actor.id) {
			actorIdByUserId.set(actor.user_id, actor.id);
		}
	}

	for (const [taskId, userId] of unresolvedByTaskId.entries()) {
		const actorId = actorIdByUserId.get(userId);
		if (actorId) {
			byTaskId.set(taskId, actorId);
		}
	}

	return byTaskId;
}
