// packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts
import { isValidUUID, type Json } from '@buildos/shared-types';
import {
	AutoOrganizeError,
	ENTITY_TABLES,
	assertEntityRefsInProject,
	prepareRelationshipMutationPlan,
	relationshipMutationErrorFromDatabase,
	toParentRefs
} from '../ontology/auto-organizer.service';
import { ensureActorId } from '../ontology/ontology-projects.service';
import type { ConnectionRef } from '../ontology/relationship-resolver';
import { normalizeTaskStateInput } from '../ontology/task-state';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	loadVisibleProjects
} from './op-execution-gateway.access';
import {
	type GatewayCalendarSyncReceipt,
	syncCreatedTaskSideEffects,
	syncUpdatedTaskSideEffects
} from './op-execution-gateway.activity';
import {
	applyArchivedReadFilter,
	normalizeArchivedUpdate,
	normalizeCalendarSyncMode,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeOptionalDate,
	normalizeOptionalUuid,
	normalizeProps,
	requireTrimmedString,
	resolveGatewayCivilTimezone
} from './op-execution-gateway.normalization';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { searchEntitiesByType } from './op-execution-gateway.search';
import {
	fetchGatewayTaskAssignees,
	resolveGatewayTaskAssignees
} from './op-execution-gateway.task-assignment';
import type { ToolExecutionContext } from './op-execution-gateway.types';

type AtomicTaskUpdateResult = {
	task?: Record<string, unknown>;
	added_actor_ids?: string[];
};

type AtomicTaskCreateResult = AtomicTaskUpdateResult & {
	idempotent_replay?: boolean;
};

const ALLOWED_TASK_PARENT_KINDS = new Set(Object.keys(ENTITY_TABLES));

function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function atomicTaskUpdateError(error: { message?: string } | null | undefined): never {
	const message = error?.message ?? 'Failed to update task atomically';
	const relationshipError = relationshipMutationErrorFromDatabase({ message });
	if (relationshipError) {
		const code =
			relationshipError.status === 404
				? 'NOT_FOUND'
				: relationshipError.status === 403
					? 'FORBIDDEN'
					: relationshipError.status === 409
						? 'CONFLICT'
						: relationshipError.status === 400
							? 'VALIDATION_ERROR'
							: 'INTERNAL';
		throw new ExternalToolGatewayError(code, relationshipError.message);
	}
	if (message.includes('task_not_found')) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}
	if (message.includes('access_denied')) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'Access denied');
	}
	if (message.includes('invalid_state_key')) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', message);
	}
	throw new ExternalToolGatewayError('INTERNAL', message);
}

function atomicTaskCreateError(error: { message?: string } | null | undefined): never {
	const message = error?.message ?? 'Failed to create task atomically';
	const relationshipError = relationshipMutationErrorFromDatabase({ message });
	if (relationshipError) {
		const code =
			relationshipError.status === 404
				? 'NOT_FOUND'
				: relationshipError.status === 403
					? 'FORBIDDEN'
					: relationshipError.status === 409
						? 'CONFLICT'
						: relationshipError.status === 400
							? 'VALIDATION_ERROR'
							: 'INTERNAL';
		throw new ExternalToolGatewayError(code, relationshipError.message);
	}
	if (message.includes('access_denied')) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'Access denied');
	}
	if (message.includes('invalid_state_key')) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', message);
	}
	throw new ExternalToolGatewayError('INTERNAL', message);
}

function relationshipPlanningError(error: unknown): never {
	if (!(error instanceof AutoOrganizeError)) throw error;
	const code =
		error.status === 404
			? 'NOT_FOUND'
			: error.status === 403
				? 'FORBIDDEN'
				: error.status === 409
					? 'CONFLICT'
					: error.status === 400
						? 'VALIDATION_ERROR'
						: 'INTERNAL';
	throw new ExternalToolGatewayError(code, error.message);
}

function normalizePriority(
	value: unknown,
	fieldName: string,
	options?: { allowNull?: boolean }
): number | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		if (options?.allowNull) {
			return null;
		}
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a number from 1 to 5`
		);
	}

	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a number from 1 to 5`
		);
	}

	const normalized = Math.floor(value);
	if (normalized < 1 || normalized > 5) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a number from 1 to 5`
		);
	}

	return normalized;
}

function toNullableText(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return value ?? null;
	}

	return value.trim().length > 0 ? value : null;
}

export async function listTasks(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	const stateKey = normalizeEntityStateFilter(args.state_key, 'task');
	const typeKey = normalizeEntityTypeFilter(args.type_key, 'task');
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			tasks: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	let query = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, archived_at, updated_at',
			{ count: 'exact' }
		)
		.in('project_id', projectIds)
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	query = applyArchivedReadFilter(query, args);

	if (stateKey) {
		query = query.eq('state_key', stateKey);
	}
	if (typeKey) {
		query = query.eq('type_key', typeKey);
	}

	const { data, error, count } = await query;
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to list tasks');
	}

	const tasks = (data ?? []).map((task: Record<string, unknown>) => ({
		...task,
		project_name: visible.projectMap.get(String(task.project_id))?.name ?? null
	}));

	return {
		tasks,
		total: count ?? tasks.length,
		pagination: buildPaginationForRows(offset, limit, count ?? tasks.length, tasks.length)
	};
}

export async function searchTasks(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['task']);
}

export async function getTask(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskId = args.task_id;
	if (typeof taskId !== 'string' || !isValidUUID(taskId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	let query = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
		)
		.eq('id', taskId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	query = applyArchivedReadFilter(query, args);

	const { data, error } = await query.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load task');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, data.project_id);

	return {
		task: {
			...data,
			project_name: project.name
		}
	};
}

export async function createTask(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);

	const title = requireTrimmedString(args.title, 'title');
	const description =
		args.description === undefined
			? undefined
			: requireTrimmedString(args.description, 'description', { allowEmpty: true });
	const stateKeyInput =
		args.state_key === undefined
			? undefined
			: requireTrimmedString(args.state_key, 'state_key');
	const stateKey = stateKeyInput === undefined ? 'todo' : normalizeTaskStateInput(stateKeyInput);

	if (!stateKey) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'state_key must be one of: todo, in_progress, blocked, done'
		);
	}

	const typeKey =
		args.type_key === undefined
			? 'task.default'
			: (requireTrimmedString(args.type_key, 'type_key') ?? 'task.default');
	const priority = normalizePriority(args.priority, 'priority');
	// A bare YYYY-MM-DD is a civil day in the user's timezone: start_at opens it,
	// due_at closes it. Only date-only input triggers the timezone lookup.
	const civilTimezone = await resolveGatewayCivilTimezone(context, [args.start_at, args.due_at]);
	const startAt = normalizeOptionalDate(args.start_at, 'start_at', {
		boundary: 'start',
		timezone: civilTimezone
	});
	const dueAt = normalizeOptionalDate(args.due_at, 'due_at', {
		boundary: 'end',
		timezone: civilTimezone
	});
	const calendarSync = normalizeCalendarSyncMode(args.calendar_sync);
	const props = normalizeProps(args.props, 'props');
	const actorId = await ensureActorId(context.admin, context.userId);
	const assignees = await resolveGatewayTaskAssignees({
		admin: context.admin,
		projectId: project.id,
		projectOwnerActorId: project.owner_actor_id,
		args
	});
	const planId = normalizeOptionalUuid(args.plan_id, 'plan_id');
	const goalId = normalizeOptionalUuid(args.goal_id, 'goal_id');
	const milestoneId = normalizeOptionalUuid(
		args.supporting_milestone_id,
		'supporting_milestone_id'
	);
	const explicitParents = toParentRefs({
		parent:
			args.parent && typeof args.parent === 'object' && !Array.isArray(args.parent)
				? (args.parent as never)
				: null
	});
	const invalidParent = explicitParents.find(
		(parent) => !ALLOWED_TASK_PARENT_KINDS.has(parent.kind)
	);
	if (invalidParent) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`Unsupported parent kind: ${invalidParent.kind}`
		);
	}
	const connections: ConnectionRef[] = [
		...explicitParents,
		...(planId ? [{ kind: 'plan' as const, id: planId }] : []),
		...(goalId ? [{ kind: 'goal' as const, id: goalId }] : []),
		...(milestoneId
			? [
					{
						kind: 'milestone' as const,
						id: milestoneId,
						rel: 'targets_milestone' as const
					}
				]
			: [])
	];
	try {
		if (connections.length > 0) {
			await assertEntityRefsInProject({
				supabase: context.admin,
				projectId: project.id,
				refs: connections,
				allowProject: true
			});
		}
	} catch (error) {
		relationshipPlanningError(error);
	}

	const taskId = crypto.randomUUID();
	let relationshipPlan: Awaited<ReturnType<typeof prepareRelationshipMutationPlan>>;
	try {
		relationshipPlan = await prepareRelationshipMutationPlan({
			supabase: context.admin,
			projectId: project.id,
			entity: { kind: 'task', id: taskId },
			connections,
			options: { mode: 'replace' },
			referencesValidated: true
		});
	} catch (error) {
		relationshipPlanningError(error);
	}

	const insertPayload: Record<string, unknown> = {
		id: taskId,
		project_id: project.id,
		title,
		description: toNullableText(description),
		type_key: typeKey,
		state_key: stateKey,
		priority: priority ?? 3,
		created_by: actorId,
		start_at: startAt ?? null,
		due_at: dueAt ?? null,
		props: {
			...(props ?? {}),
			...(goalId ? { goal_id: goalId } : {}),
			...(milestoneId ? { supporting_milestone_id: milestoneId } : {})
		}
	};

	if (stateKey === 'done') {
		insertPayload.completed_at = new Date().toISOString();
	}

	const { data: atomicResult, error: atomicError } = await context.admin.rpc(
		'onto_task_create_with_relationships_atomic',
		{
			p_task: insertPayload as Json,
			p_relationship_plan: relationshipPlan as Json,
			p_sync_assignees: assignees.hasInput,
			p_assignee_actor_ids: assignees.hasInput ? assignees.assigneeActorIds : null,
			p_assigned_by_actor_id: assignees.hasInput ? actorId : null,
			p_source: 'manual',
			p_idempotency_key: context.downstreamIdempotencyKey ?? null
		}
	);
	if (atomicError || !atomicResult) atomicTaskCreateError(atomicError);
	const atomic = atomicResult as AtomicTaskCreateResult;
	if (!atomic.task) atomicTaskCreateError(null);
	const task = atomic.task as Record<string, unknown>;
	if (task.project_id !== project.id) {
		throw new ExternalToolGatewayError(
			'CONFLICT',
			'Task idempotency key resolved outside the requested project'
		);
	}

	let calendarReceipt: GatewayCalendarSyncReceipt = { calendar_sync: 'unchanged' };
	if (!atomic.idempotent_replay) {
		calendarReceipt = await syncCreatedTaskSideEffects({
			context,
			project,
			actorId,
			task,
			calendarSync,
			addedAssigneeActorIds: assignees.hasInput
				? (atomic.added_actor_ids ?? []).filter(
						(id): id is string => typeof id === 'string'
					)
				: undefined
		});
	} else if (calendarSync === 'none') {
		calendarReceipt = { calendar_sync: 'skipped' };
	}

	const responseTaskBase = { ...task };
	// The domain key is internal replay authority, not part of the public task
	// contract. The former direct-insert gateway did not expose this column.
	delete responseTaskBase.idempotency_key;
	let responseTask: Record<string, unknown> = { ...responseTaskBase, assignees: [] };
	try {
		responseTask = {
			...responseTaskBase,
			assignees: await fetchGatewayTaskAssignees({
				admin: context.admin,
				projectId: project.id,
				taskId: String(task.id)
			})
		};
	} catch (assigneeError) {
		console.warn('[External Tool Gateway] Failed to enrich task assignees:', assigneeError);
	}

	return {
		task: {
			...responseTask,
			project_name: project.name
		},
		...calendarReceipt
	};
}

export async function updateTask(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskId = args.task_id;
	if (typeof taskId !== 'string' || !isValidUUID(taskId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const calendarSync = normalizeCalendarSyncMode(args.calendar_sync);
	let existingTaskQuery = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
		)
		.eq('id', taskId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	if (archivedAtUpdate !== null) {
		existingTaskQuery = existingTaskQuery.is('archived_at', null);
	}

	const { data: existingTask, error: existingTaskError } = await existingTaskQuery.maybeSingle();

	if (existingTaskError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			existingTaskError.message || 'Failed to load task'
		);
	}

	if (!existingTask) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, existingTask.project_id);
	assertProjectWriteAccess(project, context.scope);
	const actorId = await ensureActorId(context.admin, context.userId);
	const assignees = await resolveGatewayTaskAssignees({
		admin: context.admin,
		projectId: project.id,
		projectOwnerActorId: project.owner_actor_id,
		args
	});
	const hasGoalInput = hasOwn(args, 'goal_id');
	const hasMilestoneInput = hasOwn(args, 'supporting_milestone_id');
	const goalId = hasGoalInput ? normalizeOptionalUuid(args.goal_id, 'goal_id') : undefined;
	const milestoneId = hasMilestoneInput
		? normalizeOptionalUuid(args.supporting_milestone_id, 'supporting_milestone_id')
		: undefined;
	const requiresAtomicRelationshipUpdate =
		assignees.hasInput || hasGoalInput || hasMilestoneInput;
	if (requiresAtomicRelationshipUpdate && archivedAtUpdate !== undefined) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'archived cannot be combined with task assignee or relationship updates'
		);
	}

	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};
	let changedFieldCount = 0;
	const changedFields: string[] = [];

	if (args.title !== undefined) {
		updateData.title = requireTrimmedString(args.title, 'title');
		changedFieldCount += 1;
		changedFields.push('title');
	}

	if (args.description !== undefined) {
		if (args.description === null) {
			updateData.description = null;
		} else {
			updateData.description = toNullableText(
				requireTrimmedString(args.description, 'description', {
					allowEmpty: true
				})
			);
		}
		changedFieldCount += 1;
		changedFields.push('description');
	}

	if (args.type_key !== undefined) {
		updateData.type_key = requireTrimmedString(args.type_key, 'type_key');
		changedFieldCount += 1;
		changedFields.push('type_key');
	}

	if (args.priority !== undefined) {
		updateData.priority = normalizePriority(args.priority, 'priority', { allowNull: true });
		changedFieldCount += 1;
		changedFields.push('priority');
	}

	const civilTimezone = await resolveGatewayCivilTimezone(context, [args.start_at, args.due_at]);
	const startAt = normalizeOptionalDate(args.start_at, 'start_at', {
		boundary: 'start',
		timezone: civilTimezone
	});
	if (startAt !== undefined) {
		updateData.start_at = startAt;
		changedFieldCount += 1;
		changedFields.push('start_at');
	}

	const dueAt = normalizeOptionalDate(args.due_at, 'due_at', {
		boundary: 'end',
		timezone: civilTimezone
	});
	if (dueAt !== undefined) {
		updateData.due_at = dueAt;
		changedFieldCount += 1;
		changedFields.push('due_at');
	}

	const propsPatch = normalizeProps(args.props, 'props');
	if (args.props !== undefined || hasGoalInput || hasMilestoneInput) {
		const nextProps = {
			...((existingTask.props as Record<string, unknown> | null) ?? {}),
			...(propsPatch ?? {})
		};
		if (hasGoalInput) nextProps.goal_id = goalId ?? null;
		if (hasMilestoneInput) nextProps.supporting_milestone_id = milestoneId ?? null;
		updateData.props = nextProps;
	}
	if (args.props !== undefined) {
		changedFieldCount += 1;
		changedFields.push('props');
	}
	if (hasGoalInput) {
		changedFieldCount += 1;
		changedFields.push('goal_id');
	}
	if (hasMilestoneInput) {
		changedFieldCount += 1;
		changedFields.push('supporting_milestone_id');
	}
	if (assignees.hasInput) {
		changedFieldCount += 1;
		changedFields.push('assignees');
	}

	if (args.state_key !== undefined) {
		const normalizedStateInput = requireTrimmedString(args.state_key, 'state_key');
		const normalizedState = normalizeTaskStateInput(normalizedStateInput);
		if (!normalizedState) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'state_key must be one of: todo, in_progress, blocked, done'
			);
		}

		updateData.state_key = normalizedState;
		if (existingTask.state_key !== 'done' && normalizedState === 'done') {
			updateData.completed_at = new Date().toISOString();
		} else if (existingTask.state_key === 'done' && normalizedState !== 'done') {
			updateData.completed_at = null;
		}
		changedFieldCount += 1;
		changedFields.push('state_key');
	}

	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changedFieldCount += 1;
		changedFields.push('archived');
	}

	if (changedFieldCount === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable task field is required'
		);
	}

	const noEffect = detectNoEffectTaskUpdate(
		existingTask as Record<string, unknown>,
		updateData,
		changedFields
	);
	if (noEffect.noEffect) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`No-effect update: every supplied field (${noEffect.comparedFields.join(', ')}) already matches task "${noEffect.taskTitle ?? taskId}" — nothing changed. ` +
				'Include a field whose value actually differs; for a reschedule set due_at (or start_at) to the new ISO 8601 datetime.'
		);
	}

	let data: Record<string, unknown>;
	let addedAssigneeActorIds: string[] = [];
	if (requiresAtomicRelationshipUpdate) {
		const connections: ConnectionRef[] = [
			...(goalId ? [{ kind: 'goal' as const, id: goalId }] : []),
			...(milestoneId
				? [
						{
							kind: 'milestone' as const,
							id: milestoneId,
							rel: 'targets_milestone' as const
						}
					]
				: [])
		];
		let relationshipPlan: Awaited<ReturnType<typeof prepareRelationshipMutationPlan>> | null =
			null;
		if (hasGoalInput || hasMilestoneInput) {
			try {
				if (connections.length > 0) {
					await assertEntityRefsInProject({
						supabase: context.admin,
						projectId: project.id,
						refs: connections,
						allowProject: true
					});
				}
				relationshipPlan = await prepareRelationshipMutationPlan({
					supabase: context.admin,
					projectId: project.id,
					entity: { kind: 'task', id: taskId },
					connections,
					options: {
						mode: 'replace',
						explicitKinds: [
							...(hasGoalInput ? (['goal'] as const) : []),
							...(hasMilestoneInput ? (['milestone'] as const) : [])
						],
						skipContainment: !hasGoalInput && hasMilestoneInput
					},
					referencesValidated: true
				});
			} catch (error) {
				relationshipPlanningError(error);
			}
		}

		const { data: atomicResult, error: atomicError } = await context.admin.rpc(
			'onto_task_update_with_relationships_atomic',
			{
				p_task_id: taskId,
				p_updates: updateData as Json,
				p_sync_assignees: assignees.hasInput,
				p_assignee_actor_ids: assignees.hasInput ? assignees.assigneeActorIds : null,
				p_assigned_by_actor_id: assignees.hasInput ? actorId : null,
				p_relationship_plan: relationshipPlan as Json | null,
				p_source: 'manual'
			}
		);
		if (atomicError || !atomicResult) atomicTaskUpdateError(atomicError);
		const result = atomicResult as AtomicTaskUpdateResult;
		if (!result.task) atomicTaskUpdateError(null);
		data = result.task;
		addedAssigneeActorIds = Array.isArray(result.added_actor_ids)
			? result.added_actor_ids.filter((id): id is string => typeof id === 'string')
			: [];
	} else {
		const { data: updatedTask, error } = await context.admin
			.from('onto_tasks')
			.update(updateData)
			.eq('id', taskId)
			.select(
				'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
			)
			.single();

		if (error || !updatedTask) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error?.message || 'Failed to update task'
			);
		}
		data = updatedTask as Record<string, unknown>;
	}

	const calendarReceipt = await syncUpdatedTaskSideEffects({
		context,
		project,
		actorId,
		existingTask: existingTask as Record<string, unknown>,
		updatedTask: data as Record<string, unknown>,
		changedArgs: args,
		calendarSync,
		addedAssigneeActorIds: assignees.hasInput ? addedAssigneeActorIds : undefined
	});

	let responseTask: Record<string, unknown> = data;
	if (requiresAtomicRelationshipUpdate) {
		try {
			responseTask = {
				...data,
				assignees: await fetchGatewayTaskAssignees({
					admin: context.admin,
					projectId: project.id,
					taskId
				})
			};
		} catch (assigneeError) {
			console.warn('[External Tool Gateway] Failed to enrich task assignees:', assigneeError);
			responseTask = { ...data, assignees: [] };
		}
	}

	return {
		task: {
			...responseTask,
			project_name: project.name
		},
		...calendarReceipt
	};
}

/**
 * Legacy-compatible guard for scalar task echoes. Props/archival updates skip
 * this comparison because their deep/derived semantics can create real work.
 */
export function detectNoEffectTaskUpdate(
	existingTask: Record<string, unknown>,
	updateData: Record<string, unknown>,
	changedFields: readonly string[]
): { noEffect: boolean; comparedFields: string[]; taskTitle?: string } {
	const comparableFields = new Set([
		'title',
		'description',
		'type_key',
		'state_key',
		'priority',
		'start_at',
		'due_at'
	]);
	if (
		changedFields.length === 0 ||
		!changedFields.every((field) => comparableFields.has(field))
	) {
		return { noEffect: false, comparedFields: [] };
	}

	const dateFields = new Set(['start_at', 'due_at']);
	const matchesCurrent = changedFields.every((field) => {
		const supplied = updateData[field];
		const current = existingTask[field];
		if (supplied === null || supplied === undefined) {
			return current === null || current === undefined;
		}
		if (dateFields.has(field) && typeof supplied === 'string') {
			const suppliedMs = Date.parse(supplied);
			const currentMs = typeof current === 'string' ? Date.parse(current) : Number.NaN;
			if (Number.isFinite(suppliedMs) || Number.isFinite(currentMs)) {
				return suppliedMs === currentMs;
			}
		}
		if (typeof supplied === 'string' && typeof current === 'string') {
			return supplied.trim() === current.trim();
		}
		return supplied === current;
	});

	return {
		noEffect: matchesCurrent,
		comparedFields: [...changedFields],
		taskTitle: typeof existingTask.title === 'string' ? existingTask.title : undefined
	};
}
