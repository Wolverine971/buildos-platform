// apps/web/src/routes/api/onto/tasks/overdue/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import {
	attachAssigneesToTasks,
	fetchTaskAssigneesMap,
	type TaskAssignee
} from '$lib/server/task-assignment.service';

const ACTIVE_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const HARD_FETCH_LIMIT = 500;

type LaneKey = 'assigned_collab' | 'assigned_other' | 'other';

const LANE_ORDER: LaneKey[] = ['assigned_collab', 'assigned_other', 'other'];
const LANE_WEIGHT: Record<LaneKey, number> = {
	assigned_collab: 0,
	assigned_other: 1,
	other: 2
};

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

type OverdueTaskPayload = OverdueTaskRow & {
	project_name: string;
	is_assigned_to_me: boolean;
	project_is_shared: boolean;
	project_is_collaborative: boolean;
	assignees: TaskAssignee[];
	lane: LaneKey;
};

function toPositiveInt(raw: string | null, fallback: number): number {
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

function toPriorityValue(priority: number | null): number {
	if (typeof priority !== 'number' || !Number.isFinite(priority)) return Number.MAX_SAFE_INTEGER;
	return priority;
}

function safeTimeMs(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Date.parse(raw);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function resolveLane(task: {
	is_assigned_to_me: boolean;
	project_is_collaborative: boolean;
}): LaneKey {
	if (!task.is_assigned_to_me) return 'other';
	return task.project_is_collaborative ? 'assigned_collab' : 'assigned_other';
}

function parseLane(raw: string | null): LaneKey | null {
	if (!raw) return null;
	return LANE_ORDER.includes(raw as LaneKey) ? (raw as LaneKey) : null;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const limit = Math.min(toPositiveInt(url.searchParams.get('limit'), DEFAULT_LIMIT), MAX_LIMIT);
		const cursor = toPositiveInt(url.searchParams.get('cursor'), 0);
		const laneFilter = parseLane(url.searchParams.get('lane'));

		const actorId = await ensureActorId(locals.supabase, session.user.id);
		const projects = await fetchProjectSummaries(locals.supabase, actorId, locals.serverTiming);
		const projectById = new Map(projects.map((project) => [project.id, project]));
		const projectIds = Array.from(projectById.keys());

		if (projectIds.length === 0) {
			return ApiResponse.success({
				tasks: [] as OverdueTaskPayload[],
				total: 0,
				nextCursor: null,
				laneCounts: {
					assigned_collab: 0,
					assigned_other: 0,
					other: 0
				}
			});
		}

		const nowIso = new Date().toISOString();
		const { data: rows, error } = await locals.supabase
			.from('onto_tasks')
			.select('id, project_id, title, description, state_key, due_at, priority, updated_at')
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.lt('due_at', nowIso)
			.order('due_at', { ascending: true, nullsFirst: false })
			.limit(HARD_FETCH_LIMIT);

		if (error) {
			console.error('[Overdue Tasks API] Failed to load overdue tasks:', error);
			return ApiResponse.databaseError(error);
		}

		const taskRows = (rows ?? []) as OverdueTaskRow[];
		const assigneeMap = await fetchTaskAssigneesMap({
			supabase: locals.supabase,
			taskIds: taskRows.map((task) => task.id)
		});
		const tasksWithAssignees = attachAssigneesToTasks(taskRows, assigneeMap);

		const hydratedTasks: OverdueTaskPayload[] = tasksWithAssignees
			.map((task) => {
				const project = projectById.get(task.project_id);
				if (!project) return null;

				const projectIsShared = Boolean(project.is_shared);
				const projectIsCollaborative = projectIsShared;
				const isAssignedToMe = task.assignees.some(
					(assignee) => assignee.actor_id === actorId
				);

				const payload: OverdueTaskPayload = {
					...task,
					project_name: project.name,
					is_assigned_to_me: isAssignedToMe,
					project_is_shared: projectIsShared,
					project_is_collaborative: projectIsCollaborative,
					lane: resolveLane({
						is_assigned_to_me: isAssignedToMe,
						project_is_collaborative: projectIsCollaborative
					})
				};

				return payload;
			})
			.filter((task): task is OverdueTaskPayload => Boolean(task));

		hydratedTasks.sort((a, b) => {
			const laneDelta = LANE_WEIGHT[a.lane] - LANE_WEIGHT[b.lane];
			if (laneDelta !== 0) return laneDelta;

			const dueDelta = safeTimeMs(a.due_at) - safeTimeMs(b.due_at);
			if (dueDelta !== 0) return dueDelta;

			const priorityDelta = toPriorityValue(a.priority) - toPriorityValue(b.priority);
			if (priorityDelta !== 0) return priorityDelta;

			return safeTimeMs(a.updated_at) - safeTimeMs(b.updated_at);
		});

		const laneCounts = {
			assigned_collab: hydratedTasks.filter((task) => task.lane === 'assigned_collab').length,
			assigned_other: hydratedTasks.filter((task) => task.lane === 'assigned_other').length,
			other: hydratedTasks.filter((task) => task.lane === 'other').length
		};

		const filtered = laneFilter
			? hydratedTasks.filter((task) => task.lane === laneFilter)
			: hydratedTasks;
		const paged = filtered.slice(cursor, cursor + limit);
		const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

		return ApiResponse.success({
			tasks: paged,
			total: filtered.length,
			nextCursor,
			laneCounts
		});
	} catch (error) {
		console.error('[Overdue Tasks API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load overdue tasks');
	}
};
