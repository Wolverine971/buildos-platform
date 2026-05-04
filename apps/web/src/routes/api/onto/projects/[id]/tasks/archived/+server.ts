// apps/web/src/routes/api/onto/projects/[id]/tasks/archived/+server.ts
/**
 * GET /api/onto/projects/[id]/tasks/archived
 *
 * Returns soft-deleted (archived) tasks for the project, newest first.
 * The standard project loader filters these out, so the v2 kanban's
 * "Archived" column fetches them on demand.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { validatePaginationCustom } from '$lib/utils/api-helpers';
import { attachAssigneesToTasks, fetchTaskAssigneesMap } from '$lib/server/task-assignment.service';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) return ApiResponse.badRequest('Project ID required');
		if (!isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');

		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 50, maxLimit: 200 }
		);

		const supabase = locals.supabase;

		// RLS will already gate the query, but check explicitly so we can
		// return a friendlier 403 instead of an empty list.
		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{ p_project_id: projectId, p_required_access: 'read' }
		);
		if (accessError) {
			console.error('[Archived Tasks API] access check failed:', accessError);
			return ApiResponse.error('Failed to check project access', 500);
		}
		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		const {
			data: rows,
			error: rowsError,
			count
		} = await supabase
			.from('onto_tasks')
			.select('*', { count: 'exact' })
			.eq('project_id', projectId)
			.not('deleted_at', 'is', null)
			.order('deleted_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (rowsError) {
			console.error('[Archived Tasks API] fetch failed:', rowsError);
			return ApiResponse.error('Failed to fetch archived tasks', 500);
		}

		const tasks = (rows ?? []) as Array<{ id: string } & Record<string, unknown>>;
		const taskIds = tasks.map((t) => t.id);
		const assigneeMap = taskIds.length
			? await fetchTaskAssigneesMap({ supabase, taskIds })
			: new Map();

		const enriched = attachAssigneesToTasks(tasks, assigneeMap);
		const total = count ?? 0;
		const hasMore = offset + enriched.length < total;

		return ApiResponse.success({
			tasks: enriched,
			total,
			hasMore
		});
	} catch (err) {
		console.error('[Archived Tasks API] unexpected error:', err);
		return ApiResponse.internalError(err, 'Failed to load archived tasks');
	}
};
