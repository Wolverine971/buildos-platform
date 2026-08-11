// apps/web/src/routes/api/onto/tasks/[id]/move/+server.ts
import type { RequestHandler } from './$types';
import {
	TaskMoveServiceError,
	compactTaskMoveResultForToolContext,
	moveOntoTaskAtomic
} from '@buildos/shared-agent-ops/ontology/task-move.service';
import { ApiResponse } from '$lib/utils/api-response';
import { jsonObjectSchema, parseJsonRequest } from '$lib/utils/request-validation';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest,
	logUpdateAsync
} from '$lib/services/async-activity-logger';
import {
	queueProjectLoopBurstAsync,
	shouldSkipProjectLoopBurst
} from '$lib/server/project-loop-burst.service';
import { captureServerEvent } from '$lib/server/posthog';

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

	const changeSource = getChangeSourceFromRequest(request);
	const chatSessionId = getChatSessionIdFromRequest(request);
	let result: Awaited<ReturnType<typeof moveOntoTaskAtomic>>;
	try {
		result = await moveOntoTaskAtomic({
			client: locals.supabase,
			taskId: params.id,
			expectedSourceProjectId,
			destinationProjectId,
			confirmationToken: confirmationToken ?? null,
			caller: { kind: 'authenticated' },
			activity: {
				changedBy: session.user.id,
				changeSource,
				chatSessionId,
				logUpdate: logUpdateAsync
			}
		});
	} catch (error) {
		if (!(error instanceof TaskMoveServiceError)) {
			console.error('[Task Move] Atomic move failed:', error);
			return ApiResponse.databaseError(error);
		}
		switch (error.code) {
			case 'access_denied':
				return ApiResponse.forbidden(error.message);
			case 'not_found':
				return ApiResponse.notFound('Task or project');
			case 'source_project_mismatch':
			case 'destination_archived':
			case 'impact_changed':
				return ApiResponse.conflict(error.message);
			case 'invalid_arguments':
				return ApiResponse.badRequest(error.message);
			case 'invalid_response':
				return ApiResponse.internalError(error);
			case 'database_error':
			default:
				console.error('[Task Move] Atomic move failed:', error.cause ?? error);
				return ApiResponse.databaseError(error.cause ?? error);
		}
	}

	const publicResult = compactTaskMoveResultForToolContext(result);

	if (result.status === 'moved') {
		await captureServerEvent(session.user.id, 'task_moved', {
			task_id: params.id,
			source_project_id: result.source_project.id,
			destination_project_id: result.destination_project.id,
			change_source: changeSource
		});

		if (!shouldSkipProjectLoopBurst(request)) {
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
	}

	return ApiResponse.success(publicResult);
};
