// apps/web/src/routes/api/onto/tasks/[id]/restore/+server.ts
/**
 * POST /api/onto/tasks/[id]/restore
 *
 * Reverses a soft-delete by clearing `deleted_at`. Requires write access on
 * the parent project. The standard PATCH endpoint filters `deleted_at IS NULL`
 * so it can't perform this operation; that's why this lives at its own route.
 *
 * Returns the restored task on success.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { logOntologyApiError } from '../../../shared/error-logging';
import {
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest,
	logUpdateAsync
} from '$lib/services/async-activity-logger';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const taskId = params.id;
	if (!taskId) return ApiResponse.badRequest('Task ID required');
	if (!isValidUUID(taskId)) return ApiResponse.badRequest('Invalid task ID');

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		try {
			await ensureActorId(supabase, user.id);
		} catch (error) {
			console.error('[Task Restore] Failed to resolve actor:', error);
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/tasks/${taskId}/restore`,
				method: 'POST',
				userId: user.id,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_restore_actor_resolve'
			});
			return ApiResponse.internalError(error, 'Failed to resolve user actor');
		}

		// Find the soft-deleted task and its project for the access check.
		const { data: task, error: fetchError } = await supabase
			.from('onto_tasks')
			.select('id, project_id, deleted_at, title, type_key, state_key, start_at, due_at')
			.eq('id', taskId)
			.not('deleted_at', 'is', null)
			.maybeSingle();

		if (fetchError) {
			console.error('[Task Restore] Fetch failed:', fetchError);
			await logOntologyApiError({
				supabase,
				error: fetchError,
				endpoint: `/api/onto/tasks/${taskId}/restore`,
				method: 'POST',
				userId: user.id,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_restore_fetch'
			});
			return ApiResponse.error('Failed to look up task', 500);
		}
		if (!task) {
			return ApiResponse.notFound('Archived task');
		}

		// Write access on the parent project
		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_member_access',
			{ p_project_id: task.project_id, p_required_access: 'write' }
		);
		if (accessError) {
			console.error('[Task Restore] Access check failed:', accessError);
			return ApiResponse.error('Failed to check project access', 500);
		}
		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const beforeData = {
			deleted_at: task.deleted_at,
			title: task.title,
			type_key: task.type_key,
			state_key: task.state_key,
			start_at: task.start_at,
			due_at: task.due_at
		};

		const { data: updated, error: updateError } = await supabase
			.from('onto_tasks')
			.update({
				deleted_at: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId)
			.select('*')
			.single();

		if (updateError || !updated) {
			console.error('[Task Restore] Update failed:', updateError);
			await logOntologyApiError({
				supabase,
				error: updateError || new Error('Update returned no row'),
				endpoint: `/api/onto/tasks/${taskId}/restore`,
				method: 'POST',
				userId: user.id,
				projectId: task.project_id,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_restore_update',
				tableName: 'onto_tasks'
			});
			return ApiResponse.error('Failed to restore task', 500);
		}

		const afterData = {
			deleted_at: null,
			title: updated.title,
			type_key: updated.type_key,
			state_key: updated.state_key,
			start_at: updated.start_at,
			due_at: updated.due_at
		};

		// Log as an `updated` activity so it appears alongside other restores in
		// the activity log. (No dedicated `restored` action exists in the enum.)
		logUpdateAsync(
			supabase,
			task.project_id,
			'task',
			taskId,
			beforeData,
			afterData,
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ task: updated });
	} catch (err) {
		console.error('[Task Restore] Unexpected error:', err);
		return ApiResponse.internalError(err, 'Failed to restore task');
	}
};
