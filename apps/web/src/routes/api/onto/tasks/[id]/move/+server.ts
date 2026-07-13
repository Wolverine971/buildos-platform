// apps/web/src/routes/api/onto/tasks/[id]/move/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { jsonObjectSchema, parseJsonRequest } from '$lib/utils/request-validation';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest,
	logUpdateAsync
} from '$lib/services/async-activity-logger';
import { queueProjectLoopBurstAsync } from '$lib/server/project-loop-burst.service';
import { captureServerEvent } from '$lib/server/posthog';

type ProjectSummary = {
	id: string;
	name: string;
};

type TaskMoveResult = {
	status: 'moved' | 'already_moved' | 'confirmation_required' | 'blocked';
	requires_user_action: boolean;
	task: Record<string, unknown> & { id: string; title?: string; project_id?: string };
	task_before?: Record<string, unknown> & { id: string; title?: string; project_id?: string };
	source_project: ProjectSummary;
	destination_project: ProjectSummary;
	impact?: Record<string, unknown>;
	applied?: Record<string, unknown>;
	confirmation_token?: string;
	blocker?: string;
	message?: string;
};

const TASK_MOVE_STATUSES = new Set<TaskMoveResult['status']>([
	'moved',
	'already_moved',
	'confirmation_required',
	'blocked'
]);

function compactTaskForToolContext(task: TaskMoveResult['task']): Record<string, unknown> {
	const compact: Record<string, unknown> = { id: task.id };
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

function rpcErrorMessage(error: unknown): string {
	if (!error || typeof error !== 'object') return '';
	const candidate = error as { message?: unknown; details?: unknown; hint?: unknown };
	return [candidate.message, candidate.details, candidate.hint]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
}

/**
 * POST /api/onto/tasks/[id]/move
 *
 * Purpose-built cross-project transfer. Generic task PATCH remains scoped to a
 * single project; this endpoint delegates all authorization, impact preview,
 * stale-confirmation, and dependent-row changes to one atomic database RPC.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const parsed = await parseJsonRequest(request, jsonObjectSchema);
	if (!parsed.ok) return parsed.response;

	const body = parsed.data as Record<string, unknown>;
	const expectedSourceProjectId = body.expected_source_project_id;
	const destinationProjectId = body.destination_project_id;
	const confirmationToken = body.confirmation_token;

	if (!isValidUUID(params.id)) {
		return ApiResponse.badRequest('task id must be a valid UUID');
	}
	if (typeof expectedSourceProjectId !== 'string' || !isValidUUID(expectedSourceProjectId)) {
		return ApiResponse.badRequest('expected_source_project_id must be a valid UUID');
	}
	if (typeof destinationProjectId !== 'string' || !isValidUUID(destinationProjectId)) {
		return ApiResponse.badRequest('destination_project_id must be a valid UUID');
	}
	if (
		confirmationToken !== undefined &&
		(typeof confirmationToken !== 'string' || confirmationToken.length > 128)
	) {
		return ApiResponse.badRequest(
			'confirmation_token must be a string of at most 128 characters'
		);
	}

	const { data, error } = await locals.supabase.rpc(
		'onto_task_move_atomic' as never,
		{
			p_task_id: params.id,
			p_expected_source_project_id: expectedSourceProjectId,
			p_destination_project_id: destinationProjectId,
			p_confirmation_token: confirmationToken ?? null
		} as never
	);

	if (error) {
		const message = rpcErrorMessage(error);
		if (message.includes('task_move_access_denied')) {
			return ApiResponse.forbidden(
				'Write access to both the source and destination projects is required'
			);
		}
		if (
			message.includes('task_move_task_not_found') ||
			message.includes('task_move_project_not_found')
		) {
			return ApiResponse.notFound('Task or project');
		}
		if (message.includes('task_move_source_project_mismatch')) {
			return ApiResponse.conflict('The task is no longer in the expected source project');
		}
		if (message.includes('task_move_destination_archived')) {
			return ApiResponse.conflict(
				'The destination project is archived. Restore it or choose an active project.'
			);
		}
		if (message.includes('task_move_impact_changed')) {
			return ApiResponse.conflict(
				'The task relationships or assignees changed during the move. Review the latest impact and try again.'
			);
		}
		if (
			message.includes('task_move_same_project') ||
			message.includes('task_move_invalid_arguments')
		) {
			return ApiResponse.badRequest(
				'Source and destination must be different valid projects'
			);
		}

		console.error('[Task Move] Atomic move failed:', error);
		return ApiResponse.databaseError(error);
	}

	const result = data as unknown as TaskMoveResult;
	if (
		!result ||
		typeof result !== 'object' ||
		typeof result.status !== 'string' ||
		!TASK_MOVE_STATUSES.has(result.status) ||
		typeof result.requires_user_action !== 'boolean' ||
		!result.task ||
		typeof result.task !== 'object' ||
		Array.isArray(result.task) ||
		typeof result.task.id !== 'string' ||
		!result.source_project ||
		typeof result.source_project.id !== 'string' ||
		!result.destination_project ||
		typeof result.destination_project.id !== 'string'
	) {
		return ApiResponse.internalError(new Error('Invalid task move RPC response'));
	}

	// task_before exists only so activity history can record a truthful diff. Do
	// not send the duplicate task snapshot back through the agent/tool context.
	const { task_before: taskBefore, ...resultWithoutPrivateTaskSnapshot } = result;
	const publicResult = {
		...resultWithoutPrivateTaskSnapshot,
		task: compactTaskForToolContext(result.task)
	};

	if (result.status === 'moved') {
		const changeSource = getChangeSourceFromRequest(request);
		const chatSessionId = getChatSessionIdFromRequest(request);
		const before = {
			...(taskBefore ?? result.task),
			project_id: result.source_project.id,
			moved_to_project_id: result.destination_project.id
		};
		const after = {
			...result.task,
			project_id: result.destination_project.id,
			moved_from_project_id: result.source_project.id
		};

		await Promise.all([
			logUpdateAsync(
				locals.supabase,
				result.source_project.id,
				'task',
				params.id,
				before,
				after,
				session.user.id,
				changeSource,
				chatSessionId
			),
			logUpdateAsync(
				locals.supabase,
				result.destination_project.id,
				'task',
				params.id,
				before,
				after,
				session.user.id,
				changeSource,
				chatSessionId
			),
			captureServerEvent(session.user.id, 'task_moved', {
				task_id: params.id,
				source_project_id: result.source_project.id,
				destination_project_id: result.destination_project.id,
				change_source: changeSource
			})
		]);

		for (const projectId of [result.source_project.id, result.destination_project.id]) {
			queueProjectLoopBurstAsync({
				projectId,
				userId: session.user.id,
				source: 'task_move',
				entityType: 'task',
				entityId: params.id,
				action: 'updated'
			});
		}
	}

	return ApiResponse.success(publicResult);
};
