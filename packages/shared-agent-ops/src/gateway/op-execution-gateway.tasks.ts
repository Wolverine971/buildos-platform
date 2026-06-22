// packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts
import { isValidUUID } from '@buildos/shared-types';
import { ensureActorId } from '../ontology/ontology-projects.service';
import { normalizeTaskStateInput } from '../ontology/task-state';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	loadVisibleProjects
} from './op-execution-gateway.access';
import {
	syncCreatedTaskSideEffects,
	syncUpdatedTaskSideEffects
} from './op-execution-gateway.activity';
import {
	applyArchivedReadFilter,
	normalizeArchivedUpdate,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeOptionalDate,
	normalizeProps,
	requireTrimmedString
} from './op-execution-gateway.normalization';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { searchEntitiesByType } from './op-execution-gateway.search';
import type { ToolExecutionContext } from './op-execution-gateway.types';

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
	assertProjectWriteAccess(project);

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
	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	const dueAt = normalizeOptionalDate(args.due_at, 'due_at');
	const props = normalizeProps(args.props, 'props');
	const actorId = await ensureActorId(context.admin, context.userId);

	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		title,
		description: toNullableText(description),
		type_key: typeKey,
		state_key: stateKey,
		created_by: actorId,
		start_at: startAt ?? null,
		due_at: dueAt ?? null,
		props: props ?? {}
	};

	if (priority !== undefined) {
		insertPayload.priority = priority;
	}

	if (stateKey === 'done') {
		insertPayload.completed_at = new Date().toISOString();
	}

	const { data, error } = await context.admin
		.from('onto_tasks')
		.insert(insertPayload)
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at'
		)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create task');
	}

	await syncCreatedTaskSideEffects({
		context,
		project,
		actorId,
		task: data as Record<string, unknown>
	});

	return {
		task: {
			...data,
			project_name: project.name
		}
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
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);

	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};
	let changedFieldCount = 0;

	if (args.title !== undefined) {
		updateData.title = requireTrimmedString(args.title, 'title');
		changedFieldCount += 1;
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
	}

	if (args.type_key !== undefined) {
		updateData.type_key = requireTrimmedString(args.type_key, 'type_key');
		changedFieldCount += 1;
	}

	if (args.priority !== undefined) {
		updateData.priority = normalizePriority(args.priority, 'priority', { allowNull: true });
		changedFieldCount += 1;
	}

	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	if (startAt !== undefined) {
		updateData.start_at = startAt;
		changedFieldCount += 1;
	}

	const dueAt = normalizeOptionalDate(args.due_at, 'due_at');
	if (dueAt !== undefined) {
		updateData.due_at = dueAt;
		changedFieldCount += 1;
	}

	if (args.props !== undefined) {
		const props = normalizeProps(args.props, 'props');
		updateData.props = {
			...((existingTask.props as Record<string, unknown> | null) ?? {}),
			...(props ?? {})
		};
		changedFieldCount += 1;
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
	}

	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changedFieldCount += 1;
	}

	if (changedFieldCount === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable task field is required'
		);
	}

	const { data, error } = await context.admin
		.from('onto_tasks')
		.update(updateData)
		.eq('id', taskId)
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
		)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to update task');
	}

	await syncUpdatedTaskSideEffects({
		context,
		project,
		actorId,
		existingTask: existingTask as Record<string, unknown>,
		updatedTask: data as Record<string, unknown>,
		changedArgs: args
	});

	return {
		task: {
			...data,
			project_name: project.name
		}
	};
}
