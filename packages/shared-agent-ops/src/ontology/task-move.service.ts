// packages/shared-agent-ops/src/ontology/task-move.service.ts
import type { Database, JsonObject, ProjectLogChangeSource } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logUpdateAsync } from '../ops/async-activity-logger';

export type TaskMoveStatus = 'moved' | 'already_moved' | 'confirmation_required' | 'blocked';

export type TaskMoveProjectSummary = {
	id: string;
	name: string;
};

export type TaskMoveTask = Record<string, unknown> & {
	id: string;
	title?: string;
	project_id?: string;
};

export type TaskMoveResult = {
	status: TaskMoveStatus;
	requires_user_action: boolean;
	task: TaskMoveTask;
	task_before?: TaskMoveTask;
	source_project: TaskMoveProjectSummary;
	destination_project: TaskMoveProjectSummary;
	impact?: Record<string, unknown>;
	applied?: Record<string, unknown>;
	confirmation_token?: string;
	blocker?: string;
	message?: string;
};

export type PublicTaskMoveResult = Omit<TaskMoveResult, 'task' | 'task_before'> & {
	task: Record<string, unknown> & { id: string };
};

export type TaskMoveServiceErrorCode =
	| 'access_denied'
	| 'not_found'
	| 'source_project_mismatch'
	| 'destination_archived'
	| 'impact_changed'
	| 'invalid_arguments'
	| 'invalid_response'
	| 'database_error';

export class TaskMoveServiceError extends Error {
	constructor(
		public readonly code: TaskMoveServiceErrorCode,
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'TaskMoveServiceError';
	}
}

export type TaskMoveActivity = {
	changedBy: string;
	changeSource?: ProjectLogChangeSource;
	chatSessionId?: string;
	logUpdate?: typeof logUpdateAsync;
};

export type AtomicTaskMoveInput = {
	client: SupabaseClient<Database>;
	taskId: string;
	expectedSourceProjectId: string;
	destinationProjectId: string;
	confirmationToken?: string | null;
	caller: { kind: 'authenticated' } | { kind: 'worker'; userId: string };
	activity?: TaskMoveActivity;
};

const TASK_MOVE_STATUSES = new Set<TaskMoveStatus>([
	'moved',
	'already_moved',
	'confirmation_required',
	'blocked'
]);

/**
 * Execute the authoritative task-move transaction from either an authenticated
 * web request or the service-role worker bridge. The database function owns
 * impact preview, stale-token validation, dependent cleanup, and the move.
 */
export async function moveOntoTaskAtomic(input: AtomicTaskMoveInput): Promise<TaskMoveResult> {
	const rpcName =
		input.caller.kind === 'worker' ? 'onto_task_move_atomic_for_user' : 'onto_task_move_atomic';
	const rpcArguments = {
		...(input.caller.kind === 'worker' ? { p_user_id: input.caller.userId } : {}),
		p_task_id: input.taskId,
		p_expected_source_project_id: input.expectedSourceProjectId,
		p_destination_project_id: input.destinationProjectId,
		p_confirmation_token: input.confirmationToken ?? null
	};

	let response: { data: unknown; error: unknown };
	try {
		response = (await input.client.rpc(rpcName as never, rpcArguments as never)) as {
			data: unknown;
			error: unknown;
		};
	} catch (error) {
		throw new TaskMoveServiceError(
			'database_error',
			error instanceof Error ? error.message : 'Task move request failed',
			error
		);
	}

	if (response.error) throw mapTaskMoveRpcError(response.error);
	const result = validateTaskMoveResult(response.data, input);

	if (result.status === 'moved' && input.activity) {
		await logMovedTaskActivity(input.client, result, input.activity);
	}

	return result;
}

/** Strip the private before-snapshot and compact the task for model context. */
export function compactTaskMoveResultForToolContext(result: TaskMoveResult): PublicTaskMoveResult {
	const { task_before: _taskBefore, ...publicResult } = result;
	return {
		...publicResult,
		task: compactTaskForToolContext(result.task)
	};
}

/** Restore the signed legacy tool receipt around a validated move result. */
export function buildTaskMoveToolResult(result: TaskMoveResult | PublicTaskMoveResult): JsonObject {
	const { task_before: _taskBefore, ...resultWithoutPrivateSnapshot } = result as TaskMoveResult;
	const publicResult: PublicTaskMoveResult = {
		...resultWithoutPrivateSnapshot,
		task: compactTaskForToolContext(result.task)
	};
	const taskTitle =
		typeof publicResult.task.title === 'string' && publicResult.task.title.trim()
			? publicResult.task.title
			: publicResult.task.id;
	if (publicResult.status === 'moved' || publicResult.status === 'already_moved') {
		const destinationName = publicResult.destination_project.name;
		return {
			...publicResult,
			message:
				publicResult.status === 'already_moved'
					? `Task "${taskTitle}" is already in "${destinationName}"`
					: `Moved task "${taskTitle}" to "${destinationName}"`,
			context_shift: {
				new_context: 'project',
				entity_id: publicResult.destination_project.id,
				entity_name: destinationName,
				entity_type: 'project',
				message: `Focused the destination project "${destinationName}" after moving the task.`
			}
		} as JsonObject;
	}

	return {
		...publicResult,
		requires_user_action: true,
		message:
			publicResult.message ??
			'The task move needs user action before anything can be changed.'
	} as JsonObject;
}

function validateTaskMoveResult(data: unknown, input: AtomicTaskMoveInput): TaskMoveResult {
	if (!isRecord(data) || !TASK_MOVE_STATUSES.has(data.status as TaskMoveStatus)) {
		throw invalidResponse('Task move returned an invalid status');
	}
	if (typeof data.requires_user_action !== 'boolean') {
		throw invalidResponse('Task move returned no user-action classification');
	}
	if (!isTask(data.task) || data.task.id !== input.taskId) {
		throw invalidResponse('Task move returned a mismatched task');
	}
	if (
		!isProjectSummary(data.source_project) ||
		data.source_project.id !== input.expectedSourceProjectId ||
		!isProjectSummary(data.destination_project) ||
		data.destination_project.id !== input.destinationProjectId
	) {
		throw invalidResponse('Task move returned mismatched project identities');
	}

	const result = data as TaskMoveResult;
	if (result.status === 'moved') {
		if (
			result.requires_user_action ||
			result.task.project_id !== input.destinationProjectId ||
			!isTask(result.task_before) ||
			result.task_before.id !== input.taskId ||
			result.task_before.project_id !== input.expectedSourceProjectId ||
			!isRecord(result.impact) ||
			!isRecord(result.applied)
		) {
			throw invalidResponse('Task move returned an invalid moved receipt');
		}
	} else if (result.status === 'already_moved') {
		if (result.requires_user_action || result.task.project_id !== input.destinationProjectId) {
			throw invalidResponse('Task move returned an invalid replay receipt');
		}
	} else if (result.status === 'confirmation_required') {
		if (
			!result.requires_user_action ||
			result.task.project_id !== input.expectedSourceProjectId ||
			typeof result.confirmation_token !== 'string' ||
			result.confirmation_token.length === 0 ||
			result.confirmation_token.length > 128 ||
			!isRecord(result.impact)
		) {
			throw invalidResponse('Task move returned an invalid confirmation preview');
		}
	} else if (
		!result.requires_user_action ||
		result.task.project_id !== input.expectedSourceProjectId ||
		typeof result.blocker !== 'string' ||
		result.blocker.length === 0 ||
		typeof result.message !== 'string' ||
		result.message.length === 0 ||
		!isRecord(result.impact)
	) {
		throw invalidResponse('Task move returned an invalid blocked receipt');
	}

	return result;
}

async function logMovedTaskActivity(
	client: SupabaseClient<Database>,
	result: TaskMoveResult,
	activity: TaskMoveActivity
): Promise<void> {
	const logger = activity.logUpdate ?? logUpdateAsync;
	const before = {
		...(result.task_before ?? result.task),
		project_id: result.source_project.id,
		moved_to_project_id: result.destination_project.id
	};
	const after = {
		...result.task,
		project_id: result.destination_project.id,
		moved_from_project_id: result.source_project.id
	};
	await Promise.all([
		logger(
			client,
			result.source_project.id,
			'task',
			result.task.id,
			before,
			after,
			activity.changedBy,
			activity.changeSource,
			activity.chatSessionId
		),
		logger(
			client,
			result.destination_project.id,
			'task',
			result.task.id,
			before,
			after,
			activity.changedBy,
			activity.changeSource,
			activity.chatSessionId
		)
	]);
}

function compactTaskForToolContext(task: TaskMoveTask): Record<string, unknown> & { id: string } {
	const compact: Record<string, unknown> & { id: string } = { id: task.id };
	for (const key of [
		'title',
		'project_id',
		'type_key',
		'state_key',
		'start_at',
		'due_at',
		'updated_at'
	] as const) {
		if (task[key] !== undefined) compact[key] = task[key];
	}
	return compact;
}

function mapTaskMoveRpcError(error: unknown): TaskMoveServiceError {
	const detail = rpcErrorMessage(error);
	if (detail.includes('task_move_access_denied')) {
		return new TaskMoveServiceError(
			'access_denied',
			'Write access to both the source and destination projects is required',
			error
		);
	}
	if (
		detail.includes('task_move_task_not_found') ||
		detail.includes('task_move_project_not_found')
	) {
		return new TaskMoveServiceError('not_found', 'Task or project not found', error);
	}
	if (detail.includes('task_move_source_project_mismatch')) {
		return new TaskMoveServiceError(
			'source_project_mismatch',
			'The task is no longer in the expected source project',
			error
		);
	}
	if (detail.includes('task_move_destination_archived')) {
		return new TaskMoveServiceError(
			'destination_archived',
			'The destination project is archived. Restore it or choose an active project.',
			error
		);
	}
	if (detail.includes('task_move_impact_changed')) {
		return new TaskMoveServiceError(
			'impact_changed',
			'The task relationships or assignees changed during the move. Review the latest impact and try again.',
			error
		);
	}
	if (
		detail.includes('task_move_same_project') ||
		detail.includes('task_move_invalid_arguments')
	) {
		return new TaskMoveServiceError(
			'invalid_arguments',
			'Source and destination must be different valid projects',
			error
		);
	}
	return new TaskMoveServiceError('database_error', detail || 'Task move failed', error);
}

function rpcErrorMessage(error: unknown): string {
	if (!isRecord(error)) return '';
	return [error.message, error.details, error.hint]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
}

function invalidResponse(message: string): TaskMoveServiceError {
	return new TaskMoveServiceError('invalid_response', message);
}

function isTask(value: unknown): value is TaskMoveTask {
	return isRecord(value) && typeof value.id === 'string';
}

function isProjectSummary(value: unknown): value is TaskMoveProjectSummary {
	return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
