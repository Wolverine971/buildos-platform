// apps/web/src/lib/server/task-archive.service.ts
import type { ProjectLogChangeSource } from '@buildos/shared-types';
import { logDeleteAsync } from '$lib/services/async-activity-logger';

type AnySupabase = any;

export type ArchiveTaskResult =
	| { ok: true; archivedAt: string }
	| { ok: false; status: 403 | 404 | 500; error: string };

/**
 * The board's canonical task archive, as DELETE /api/onto/tasks/[id] with
 * `{ archive: true }` writes it: `deleted_at` and `archived_at` are set together
 * (restore clears both, and the privacy purge skips the row because
 * `archived_at` is set), and the change is logged as a delete.
 *
 * Unlike that handler, this never touches the task's linked calendar events:
 * an archive proposed by Project Review must not delete events or sync Google
 * Calendar. It runs on the caller's user-scoped client and checks project write
 * access the way the handler does, so RLS and membership both apply.
 */
export async function archiveTaskCanonical(params: {
	supabase: AnySupabase;
	userId: string;
	/** The caller's actor, when already ensured for this request (skips one RPC). */
	actorId?: string | null;
	taskId: string;
	projectId: string;
	changeSource?: ProjectLogChangeSource;
	chatSessionId?: string | null;
}): Promise<ArchiveTaskResult> {
	const { supabase, userId, taskId, projectId } = params;

	// current_actor_* access checks need the caller's actor row to exist.
	if (!params.actorId) {
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});
		if (actorError || !actorId) {
			return {
				ok: false,
				status: 500,
				error: `Failed to resolve user actor${actorError?.message ? `: ${actorError.message}` : ''}`
			};
		}
	}

	const [taskResult, accessResult] = await Promise.all([
		supabase
			.from('onto_tasks')
			.select('id, project_id, title, type_key, state_key, start_at, due_at, deleted_at')
			.eq('id', taskId)
			.maybeSingle(),
		supabase.rpc('current_actor_has_project_member_access', {
			p_project_id: projectId,
			p_required_access: 'write'
		})
	]);
	if (taskResult.error) {
		return {
			ok: false,
			status: 500,
			error: `Failed to load task: ${taskResult.error.message}`
		};
	}
	const task = taskResult.data as Record<string, unknown> | null;
	if (!task || task.project_id !== projectId || task.deleted_at) {
		return { ok: false, status: 404, error: 'Task not found in this project.' };
	}
	if (accessResult.error) {
		return {
			ok: false,
			status: 500,
			error: `Failed to check project access: ${accessResult.error.message}`
		};
	}
	if (!accessResult.data) {
		return { ok: false, status: 403, error: 'You do not have write access to this project.' };
	}

	const now = new Date().toISOString();
	const { data: archived, error: updateError } = await supabase
		.from('onto_tasks')
		.update({ deleted_at: now, archived_at: now, updated_at: now })
		.eq('id', taskId)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.select('id')
		.maybeSingle();
	if (updateError) {
		return { ok: false, status: 500, error: `Failed to archive task: ${updateError.message}` };
	}
	if (!archived) {
		// Archived or deleted concurrently, or hidden from this user by RLS.
		return { ok: false, status: 404, error: 'Task not found in this project.' };
	}

	logDeleteAsync(
		supabase,
		projectId,
		'task',
		taskId,
		{
			title: task.title,
			type_key: task.type_key,
			state_key: task.state_key,
			start_at: task.start_at,
			due_at: task.due_at
		},
		userId,
		params.changeSource,
		params.chatSessionId ?? undefined
	);

	return { ok: true, archivedAt: now };
}
