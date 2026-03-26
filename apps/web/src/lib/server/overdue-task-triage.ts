// apps/web/src/lib/server/overdue-task-triage.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';

import type { ServerTiming } from '$lib/server/server-timing';
import {
	attachAssigneesToTasks,
	fetchTaskAssigneesMap,
	type TaskAssignee
} from '$lib/server/task-assignment.service';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type { OverdueTask } from '$lib/types/overdue-triage';
import { resolveOverdueLane, sortGlobalOverdueTasks } from '$lib/utils/overdue-task-batches';

const ACTIVE_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;
const HARD_FETCH_LIMIT = 500;

type OverdueTaskRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string;
	due_at: string | null;
	priority: number | null;
	updated_at: string;
};

type OverdueTaskWithAssignees = OverdueTaskRow & {
	assignees: TaskAssignee[];
};

export async function fetchHydratedOverdueTasks({
	supabase,
	userId,
	timing
}: {
	supabase: TypedSupabaseClient;
	userId: string;
	timing?: ServerTiming;
}): Promise<OverdueTask[]> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	const actorId = await ensureActorId(supabase, userId);
	const projects = await fetchProjectSummaries(supabase, actorId, timing);
	const projectById = new Map(projects.map((project) => [project.id, project]));
	const projectIds = Array.from(projectById.keys());

	if (projectIds.length === 0) {
		return [];
	}

	const nowIso = new Date().toISOString();
	const { data: rows, error } = await measure('db.overdue_tasks.list', () =>
		supabase
			.from('onto_tasks')
			.select('id, project_id, title, description, state_key, due_at, priority, updated_at')
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.lt('due_at', nowIso)
			.order('due_at', { ascending: true, nullsFirst: false })
			.limit(HARD_FETCH_LIMIT)
	);

	if (error) {
		throw error;
	}

	const taskRows = (rows ?? []) as OverdueTaskRow[];
	const assigneeMap = await fetchTaskAssigneesMap({
		supabase,
		taskIds: taskRows.map((task) => task.id)
	});
	const tasksWithAssignees = attachAssigneesToTasks(
		taskRows,
		assigneeMap
	) as OverdueTaskWithAssignees[];

	const hydratedTasks: OverdueTask[] = [];

	for (const task of tasksWithAssignees) {
		const project = projectById.get(task.project_id);
		if (!project) continue;

		const projectIsShared = Boolean(project.is_shared);
		const projectIsCollaborative = projectIsShared;
		const isAssignedToMe = task.assignees.some((assignee) => assignee.actor_id === actorId);

		hydratedTasks.push({
			...task,
			assignees: task.assignees.map((assignee) => ({
				actor_id: assignee.actor_id,
				name: assignee.name,
				email: assignee.email
			})),
			project_name: project.name,
			project_state_key: project.state_key,
			project_updated_at: project.updated_at,
			is_assigned_to_me: isAssignedToMe,
			project_is_shared: projectIsShared,
			project_is_collaborative: projectIsCollaborative,
			lane: resolveOverdueLane({
				is_assigned_to_me: isAssignedToMe,
				project_is_collaborative: projectIsCollaborative
			})
		});
	}

	return sortGlobalOverdueTasks(hydratedTasks);
}
