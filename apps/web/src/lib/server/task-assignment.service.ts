// apps/web/src/lib/server/task-assignment.service.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const MAX_TASK_ASSIGNEES = 10;

type SupabaseClient = App.Locals['supabase'];

type ActorRow = {
	id: string;
	user_id: string | null;
	name: string | null;
	email: string | null;
};

type TaskAssigneeRow = {
	task_id: string;
	assignee_actor_id: string;
	created_at: string;
	assignee: ActorRow | ActorRow[] | null;
};

export type TaskAssignee = {
	actor_id: string;
	user_id: string | null;
	name: string | null;
	email: string | null;
	assigned_at: string;
};

export class TaskAssignmentValidationError extends Error {
	status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.name = 'TaskAssignmentValidationError';
		this.status = status;
	}
}

export function parseAssigneeActorIds(body: Record<string, unknown>): {
	hasInput: boolean;
	assigneeActorIds: string[];
} {
	const hasInput = Object.prototype.hasOwnProperty.call(body, 'assignee_actor_ids');
	if (!hasInput) {
		return { hasInput: false, assigneeActorIds: [] };
	}

	const rawValue = body.assignee_actor_ids;
	if (rawValue === null) {
		return { hasInput: true, assigneeActorIds: [] };
	}

	if (!Array.isArray(rawValue)) {
		throw new TaskAssignmentValidationError('assignee_actor_ids must be an array of actor IDs');
	}

	const normalized: string[] = [];
	const seen = new Set<string>();

	for (const value of rawValue) {
		if (typeof value !== 'string' || value.trim().length === 0) {
			throw new TaskAssignmentValidationError(
				'assignee_actor_ids must contain only non-empty UUID strings'
			);
		}

		const id = value.trim();
		if (!isValidUUID(id)) {
			throw new TaskAssignmentValidationError(`Invalid assignee actor ID: ${id}`);
		}

		if (!seen.has(id)) {
			seen.add(id);
			normalized.push(id);
		}
	}

	if (normalized.length > MAX_TASK_ASSIGNEES) {
		throw new TaskAssignmentValidationError(
			`A task can have at most ${MAX_TASK_ASSIGNEES} assignees`
		);
	}

	return { hasInput: true, assigneeActorIds: normalized };
}

export async function validateAssigneesAreProjectEligible({
	supabase,
	projectId,
	assigneeActorIds,
	projectOwnerActorId
}: {
	supabase: SupabaseClient;
	projectId: string;
	assigneeActorIds: string[];
	projectOwnerActorId?: string | null;
}): Promise<void> {
	if (assigneeActorIds.length === 0) {
		return;
	}

	let ownerActorId = projectOwnerActorId ?? null;
	if (!ownerActorId) {
		const { data: projectRow, error: projectError } = await supabase
			.from('onto_projects')
			.select('created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !projectRow) {
			throw new TaskAssignmentValidationError('Project not found');
		}
		ownerActorId = projectRow.created_by;
	}

	const { data: memberRows, error: membersError } = await supabase
		.from('onto_project_members')
		.select('actor_id')
		.eq('project_id', projectId)
		.is('removed_at', null)
		.in('actor_id', assigneeActorIds);

	if (membersError) {
		throw new TaskAssignmentValidationError('Failed to validate task assignees', 500);
	}

	const allowedActorIds = new Set<string>((memberRows ?? []).map((row) => row.actor_id));
	if (ownerActorId) {
		allowedActorIds.add(ownerActorId);
	}

	const invalidActorIds = assigneeActorIds.filter((actorId) => !allowedActorIds.has(actorId));
	if (invalidActorIds.length > 0) {
		throw new TaskAssignmentValidationError(
			`Assignees must be active project members: ${invalidActorIds.join(', ')}`
		);
	}
}

export async function syncTaskAssignees({
	supabase,
	projectId,
	taskId,
	assigneeActorIds,
	assignedByActorId,
	source = 'manual'
}: {
	supabase: SupabaseClient;
	projectId: string;
	taskId: string;
	assigneeActorIds: string[];
	assignedByActorId: string;
	source?: 'manual' | 'agent' | 'import';
}): Promise<{ addedActorIds: string[]; removedActorIds: string[] }> {
	const { data: existingRows, error: existingError } = await (supabase as any)
		.from('onto_task_assignees')
		.select('assignee_actor_id')
		.eq('project_id', projectId)
		.eq('task_id', taskId);

	if (existingError) {
		throw new TaskAssignmentValidationError('Failed to load existing task assignees', 500);
	}

	const existingActorIds = new Set<string>(
		((existingRows ?? []) as Array<{ assignee_actor_id: string }>).map(
			(row) => row.assignee_actor_id
		)
	);
	const nextActorIds = new Set<string>(assigneeActorIds);

	const addedActorIds = assigneeActorIds.filter((actorId) => !existingActorIds.has(actorId));
	const removedActorIds = Array.from(existingActorIds).filter(
		(actorId) => !nextActorIds.has(actorId)
	);

	if (removedActorIds.length > 0) {
		const { error: removeError } = await (supabase as any)
			.from('onto_task_assignees')
			.delete()
			.eq('project_id', projectId)
			.eq('task_id', taskId)
			.in('assignee_actor_id', removedActorIds);

		if (removeError) {
			throw new TaskAssignmentValidationError('Failed to remove task assignees', 500);
		}
	}

	if (addedActorIds.length > 0) {
		const rows = addedActorIds.map((assigneeActorId) => ({
			project_id: projectId,
			task_id: taskId,
			assignee_actor_id: assigneeActorId,
			assigned_by_actor_id: assignedByActorId,
			source
		}));

		const { error: addError } = await (supabase as any)
			.from('onto_task_assignees')
			.insert(rows);
		if (addError) {
			throw new TaskAssignmentValidationError('Failed to add task assignees', 500);
		}
	}

	return { addedActorIds, removedActorIds };
}

export async function fetchTaskAssigneesMap({
	supabase,
	taskIds
}: {
	supabase: SupabaseClient;
	taskIds: string[];
}): Promise<Map<string, TaskAssignee[]>> {
	const map = new Map<string, TaskAssignee[]>();

	if (taskIds.length === 0) {
		return map;
	}

	const { data, error } = await (supabase as any)
		.from('onto_task_assignees')
		.select(
			`
			task_id,
			assignee_actor_id,
			created_at,
			assignee:onto_actors!onto_task_assignees_assignee_actor_id_fkey(
				id,
				user_id,
				name,
				email
			)
		`
		)
		.in('task_id', taskIds)
		.order('created_at', { ascending: true });

	if (error) {
		throw new TaskAssignmentValidationError('Failed to fetch task assignees', 500);
	}

	for (const row of (data ?? []) as TaskAssigneeRow[]) {
		const assigneeRaw = Array.isArray(row.assignee) ? (row.assignee[0] ?? null) : row.assignee;
		if (!assigneeRaw || typeof assigneeRaw.id !== 'string') continue;

		const taskAssignee: TaskAssignee = {
			actor_id: assigneeRaw.id,
			user_id: assigneeRaw.user_id ?? null,
			name: assigneeRaw.name ?? null,
			email: assigneeRaw.email ?? null,
			assigned_at: row.created_at
		};

		const existing = map.get(row.task_id) ?? [];
		existing.push(taskAssignee);
		map.set(row.task_id, existing);
	}

	return map;
}

export function attachAssigneesToTask<T extends { id: string }>(
	task: T,
	assigneeMap: Map<string, TaskAssignee[]>
): T & { assignees: TaskAssignee[] } {
	return {
		...task,
		assignees: assigneeMap.get(task.id) ?? []
	};
}

export function attachAssigneesToTasks<T extends { id: string }>(
	tasks: T[],
	assigneeMap: Map<string, TaskAssignee[]>
): Array<T & { assignees: TaskAssignee[] }> {
	return tasks.map((task) => attachAssigneesToTask(task, assigneeMap));
}

export async function notifyTaskAssignmentAdded({
	supabase,
	projectId,
	projectName,
	taskId,
	taskTitle,
	actorUserId,
	actorDisplayName,
	addedAssigneeActorIds,
	coalescedMentionUserIds = []
}: {
	supabase: SupabaseClient;
	projectId: string;
	projectName: string | null | undefined;
	taskId: string;
	taskTitle: string;
	actorUserId: string;
	actorDisplayName: string;
	addedAssigneeActorIds: string[];
	coalescedMentionUserIds?: string[];
}): Promise<{ recipientUserIds: string[] }> {
	if (addedAssigneeActorIds.length === 0) {
		return { recipientUserIds: [] };
	}

	const { data: actorRows, error: actorError } = await supabase
		.from('onto_actors')
		.select('id, user_id')
		.in('id', addedAssigneeActorIds);

	if (actorError) {
		console.error('[Task Assignment] Failed to resolve assignee users:', actorError);
		return { recipientUserIds: [] };
	}

	const recipientUserIds = Array.from(
		new Set(
			(actorRows ?? [])
				.map((row) => row.user_id)
				.filter((userId): userId is string => Boolean(userId && userId !== actorUserId))
		)
	);

	if (recipientUserIds.length === 0) {
		return { recipientUserIds: [] };
	}

	const actorName = actorDisplayName || 'A teammate';
	const projectLabel = projectName || 'your project';
	const message = `${actorName} assigned you a task in ${projectLabel}.`;
	const actionUrl = `/projects/${projectId}/tasks/${taskId}`;
	const coalescedMentionSet = new Set<string>(coalescedMentionUserIds);

	const rows = recipientUserIds.map((userId) => ({
		user_id: userId,
		type: 'task_assigned',
		title: 'Task assigned to you',
		message,
		action_url: actionUrl,
		event_type: 'task.assigned',
		data: {
			project_id: projectId,
			entity_type: 'task',
			entity_id: taskId,
			entity_title: taskTitle,
			task_id: taskId,
			actor_user_id: actorUserId,
			coalesced_from_mention: coalescedMentionSet.has(userId),
			source: 'assignment'
		}
	}));

	const { error: notificationError } = await supabase.from('user_notifications').insert(rows);
	if (notificationError) {
		console.error(
			'[Task Assignment] Failed to create assignment notifications:',
			notificationError
		);
	}

	return { recipientUserIds };
}
