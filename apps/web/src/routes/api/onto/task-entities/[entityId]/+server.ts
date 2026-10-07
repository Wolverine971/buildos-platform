// apps/web/src/routes/api/onto/task-entities/[entityId]/+server.ts
/**
 * PATCH /api/onto/task-entities/[entityId]  {status: 'confirmed' | 'dismissed' | 'suggested'}
 *
 * Confirm (the chip stays through every later re-read), dismiss (re-reads never bring it
 * back), or restore a suggestion. RLS allows it for members who can edit the task's project.
 */
import type { RequestHandler } from './$types';
import type { TaskEntityStatus } from '@buildos/shared-agent-ops/task-entities';
import { ApiResponse } from '$lib/utils/api-response';
import {
	TASK_ENTITY_STATUSES,
	setTaskEntityStatus
} from '$lib/server/task-entities/task-entity-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID.test(params.entityId)) return ApiResponse.badRequest('Invalid entity id');

	const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
	const status = body?.status;
	if (typeof status !== 'string' || !TASK_ENTITY_STATUSES.includes(status as TaskEntityStatus)) {
		return ApiResponse.badRequest('status must be confirmed, dismissed or suggested');
	}

	try {
		const entity = await setTaskEntityStatus(
			locals.supabase,
			params.entityId,
			status as TaskEntityStatus
		);
		if (!entity) return ApiResponse.notFound('Task entity');
		return ApiResponse.success({ entity });
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not update task entity');
	}
};
