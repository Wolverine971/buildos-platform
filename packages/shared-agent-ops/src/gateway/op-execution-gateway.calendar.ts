// packages/shared-agent-ops/src/gateway/op-execution-gateway.calendar.ts
//
// Calendar gateway handlers and project/task/event scope enforcement.
import { isValidUUID } from '@buildos/shared-types';
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { CalendarPort, ToolExecutionContext } from './op-execution-gateway.types';

function getStringArg(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return undefined;
}

function createCalendarExecutor(context: ToolExecutionContext): CalendarPort {
	if (!context.calendar) {
		throw new ExternalToolGatewayError('INTERNAL', 'Calendar port not available');
	}
	return context.calendar;
}

function normalizeCalendarToolError(error: unknown): ExternalToolGatewayError {
	if (error instanceof ExternalToolGatewayError) {
		return error;
	}

	const message = error instanceof Error ? error.message : 'Calendar tool execution failed';
	const normalized = message.toLowerCase();
	if (normalized.includes('not found')) {
		return new ExternalToolGatewayError('NOT_FOUND', message);
	}

	if (
		normalized.includes('required') ||
		normalized.includes('invalid') ||
		normalized.includes('must be') ||
		normalized.includes('expected') ||
		normalized.includes('after') ||
		normalized.includes('before')
	) {
		return new ExternalToolGatewayError('VALIDATION_ERROR', message);
	}

	return new ExternalToolGatewayError('INTERNAL', message);
}

async function runCalendarTool(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	invoke: (executor: CalendarPort, args: Record<string, unknown>) => Promise<unknown>
): Promise<Record<string, unknown>> {
	try {
		const result = await invoke(createCalendarExecutor(context), args);
		if (result && typeof result === 'object' && !Array.isArray(result)) {
			return result as Record<string, unknown>;
		}
		return { result: result ?? null };
	} catch (error) {
		throw normalizeCalendarToolError(error);
	}
}

async function assertCalendarProjectAccess(
	context: ToolExecutionContext,
	projectId: unknown,
	access: 'read' | 'write'
): Promise<OntologyProjectSummary> {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, projectId);
	if (access === 'write') {
		assertProjectWriteAccess(project);
	}
	return project;
}

async function assertTaskCalendarProjectAccess(
	context: ToolExecutionContext,
	taskId: unknown,
	access: 'read' | 'write',
	expectedProjectId?: string
): Promise<OntologyProjectSummary> {
	if (typeof taskId !== 'string' || !isValidUUID(taskId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must be a valid UUID');
	}

	const { data, error } = await context.admin
		.from('onto_tasks')
		.select('id, project_id')
		.eq('id', taskId)
		.is('archived_at', null)
		.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load task');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const projectId = (data as { project_id?: unknown }).project_id;
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new ExternalToolGatewayError('INTERNAL', 'Task project_id is invalid');
	}

	if (expectedProjectId && projectId !== expectedProjectId) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must belong to project_id');
	}

	return assertCalendarProjectAccess(context, projectId, access);
}

async function assertCalendarEventAccess(
	context: ToolExecutionContext,
	eventId: unknown,
	access: 'read' | 'write'
): Promise<{ projectId: string }> {
	if (typeof eventId !== 'string' || !isValidUUID(eventId)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'onto_event_id must be a valid UUID'
		);
	}

	const { data, error } = await context.admin
		.from('onto_events')
		.select('id, project_id, owner_entity_type, owner_entity_id')
		.eq('id', eventId)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load event');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Event not found');
	}

	const event = data as {
		project_id?: unknown;
		owner_entity_type?: unknown;
		owner_entity_id?: unknown;
	};
	const projectId = typeof event.project_id === 'string' ? event.project_id : null;
	if (projectId) {
		const project = await assertCalendarProjectAccess(context, projectId, access);
		return { projectId: project.id };
	}

	if (
		event.owner_entity_type === 'project' &&
		typeof event.owner_entity_id === 'string' &&
		isValidUUID(event.owner_entity_id)
	) {
		const project = await assertCalendarProjectAccess(context, event.owner_entity_id, access);
		return { projectId: project.id };
	}

	if (
		event.owner_entity_type === 'task' &&
		typeof event.owner_entity_id === 'string' &&
		isValidUUID(event.owner_entity_id)
	) {
		const project = await assertTaskCalendarProjectAccess(
			context,
			event.owner_entity_id,
			access
		);
		return { projectId: project.id };
	}

	throw new ExternalToolGatewayError(
		'FORBIDDEN',
		'External calendar event access must be scoped to an allowed project or task'
	);
}

async function resolveExternalCalendarProjectArgs(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	access: 'read' | 'write',
	options?: { allowTaskId?: boolean }
): Promise<Record<string, unknown>> {
	const requestedProjectId = getStringArg(args.project_id, args.projectId);
	const taskId = options?.allowTaskId ? getStringArg(args.task_id, args.taskId) : undefined;

	if (taskId) {
		const project = await assertTaskCalendarProjectAccess(
			context,
			taskId,
			access,
			requestedProjectId
		);
		return {
			...args,
			project_id: project.id,
			calendar_scope: 'project'
		};
	}

	if (!requestedProjectId) {
		const message = options?.allowTaskId
			? 'External calendar event access must include project_id or task_id'
			: 'External calendar access must include project_id';
		throw new ExternalToolGatewayError('FORBIDDEN', message);
	}

	const project = await assertCalendarProjectAccess(context, requestedProjectId, access);
	return {
		...args,
		project_id: project.id,
		calendar_scope: 'project'
	};
}

export async function listCalendarEvents(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'read');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.listCalendarEvents(toolArgs as any)
	);
}

export async function getCalendarEventDetails(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	if (args.onto_event_id !== undefined) {
		await assertCalendarEventAccess(context, args.onto_event_id, 'read');
		return runCalendarTool(context, args, (executor, toolArgs) =>
			executor.getCalendarEventDetails(toolArgs as any)
		);
	}

	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'read');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.getCalendarEventDetails(toolArgs as any)
	);
}

export async function createCalendarEvent(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write', {
		allowTaskId: true
	});
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.createCalendarEvent(toolArgs as any)
	);
}

export async function updateCalendarEvent(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	if (args.onto_event_id !== undefined) {
		await assertCalendarEventAccess(context, args.onto_event_id, 'write');
		return runCalendarTool(context, args, (executor, toolArgs) =>
			executor.updateCalendarEvent(toolArgs as any)
		);
	}

	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.updateCalendarEvent(toolArgs as any)
	);
}

export async function deleteCalendarEvent(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	if (args.onto_event_id !== undefined) {
		await assertCalendarEventAccess(context, args.onto_event_id, 'write');
		return runCalendarTool(context, args, (executor, toolArgs) =>
			executor.deleteCalendarEvent(toolArgs as any)
		);
	}

	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.deleteCalendarEvent(toolArgs as any)
	);
}

export async function getProjectCalendar(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'read');
	const result = await runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.getProjectCalendar(toolArgs as any)
	);
	return Object.keys(result).length === 1 &&
		Object.prototype.hasOwnProperty.call(result, 'result')
		? { calendar: result.result ?? null }
		: { calendar: result };
}

export async function setProjectCalendar(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.setProjectCalendar(toolArgs as any)
	);
}
