// apps/web/src/routes/api/tasks/[id]/braindumps/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/tasks/:id/braindumps
 *
 * Fetches all braindumps associated with a task via brain_dump_links table.
 * Returns enriched braindump data including title, content, status, timestamps.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { supabase, safeGetSession } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const { id: taskId } = params;

	try {
		// Query brain_dump_links joined with brain_dumps
		// Note: Supabase/PostgREST uses 'new_name:old_name' syntax for aliasing
		const { data: braindumpLinks, error: err } = await supabase
			.from('brain_dump_links')
			.select(
				`
				brain_dump_id,
				linked_at:created_at,
				brain_dumps!inner (
					id,
					title,
					content,
					ai_summary,
					status,
					created_at,
					updated_at
				)
			`
			)
			.eq('task_id', taskId)
			.eq('brain_dumps.user_id', user.id)
			.order('created_at', { ascending: false });

		if (err) {
			console.error('Error fetching task braindumps:', err);
			return ApiResponse.internalError(err, 'Failed to fetch braindumps');
		}

		// Transform the data - flatten the nested structure
		const braindumps = (braindumpLinks || []).map((link: any) => ({
			...link.brain_dumps,
			linked_at: link.linked_at
		}));

		return ApiResponse.success({
			braindumps,
			count: braindumps.length
		});
	} catch (err: any) {
		console.error('Error in braindumps endpoint:', err);
		return ApiResponse.internalError(err, err.message || 'Internal server error');
	}
};
