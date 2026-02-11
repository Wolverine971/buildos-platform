// apps/web/src/routes/api/projects/[id]/stats/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

// Feature flag to toggle between old and new implementation
const USE_RPC_FUNCTION = true;

export const GET: RequestHandler = async ({ params, locals }) => {
	const { safeGetSession, supabase } = locals;
	const projectId = params.id;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		// Use new RPC function for optimized performance
		if (USE_RPC_FUNCTION) {
			const { data: rpcResult, error: rpcError } = await supabase.rpc(
				'get_project_statistics',
				{
					p_project_id: projectId,
					p_user_id: user.id
				}
			);

			if (rpcError) {
				console.error('Error calling stats RPC:', rpcError);
				// Fall back to original implementation
				return handleOriginalStats({ supabase, projectId, userId: user.id });
			}

			const rpcData = rpcResult as any;

			// Check for authorization error
			if (rpcData?.error === 'Unauthorized') {
				return ApiResponse.error('Unauthorized', 401);
			}

			// Return the optimized stats with additional breakdowns
			const stats = rpcData?.stats || {};

			// Ensure backward compatibility with expected format
			const formattedStats = {
				...stats,
				// Add any missing fields with defaults
				total: stats.total || 0,
				completed: stats.completed || 0,
				active: stats.active || 0,
				inProgress: stats.inProgress || 0,
				blocked: stats.blocked || 0,
				deleted: stats.deleted || 0,
				scheduled: stats.scheduled || 0,
				hasPhases: stats.hasPhases || false,
				completionRate: stats.completionRate || 0
			};

			return ApiResponse.success({
				stats: formattedStats,
				// Include additional breakdowns from RPC
				breakdowns: {
					byPriority: stats.byPriority || {},
					byStatus: stats.byStatus || {},
					byType: stats.byType || {}
				},
				phasesInfo: {
					count: stats.phasesCount || 0,
					averageTasksPerPhase: stats.averageTasksPerPhase || 0
				}
			});
		}

		// Fall back to original implementation
		return handleOriginalStats({ supabase, projectId, userId: user.id });
	} catch (error) {
		console.error('Error in stats API:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};

// Original implementation for fallback
async function handleOriginalStats({ supabase, projectId, userId }: any) {
	// Fetch tasks and phases data in parallel
	const [{ data: tasks, error: tasksError }, { count: phasesCount }] = await Promise.all([
		supabase
			.from('tasks')
			.select('id, status, priority, deleted_at, task_calendar_events(sync_status)')
			.eq('project_id', projectId)
			.eq('user_id', userId),
		supabase
			.from('phases')
			.select('*', { count: 'exact', head: true })
			.eq('project_id', projectId)
	]);

	if (tasksError) {
		console.error('Error fetching tasks for stats:', tasksError);
		return ApiResponse.error('Failed to fetch task statistics');
	}

	// Calculate statistics
	const allTasks = tasks || [];
	const activeTasks = allTasks.filter((t: any) => !t.deleted_at && t.status !== 'done');
	const doneTasks = allTasks.filter((t: any) => !t.deleted_at && t.status === 'done');
	const deletedTasks = allTasks.filter((t: any) => t.deleted_at);

	// Calculate scheduled tasks (have active calendar events)
	const scheduledTasks = allTasks.filter((task: any) => {
		if (task.status === 'done' || task.deleted_at) return false;
		const activeEvents =
			task.task_calendar_events?.filter(
				(event: any) => event.sync_status === 'synced' || event.sync_status === 'pending'
			) || [];
		return activeEvents.length > 0;
	});

	const stats = {
		total: activeTasks.length + doneTasks.length,
		completed: doneTasks.length,
		inProgress: activeTasks.filter((t: any) => t.status === 'in_progress').length,
		blocked: activeTasks.filter((t: any) => t.status === 'blocked').length,
		deleted: deletedTasks.length,
		active: activeTasks.length,
		scheduled: scheduledTasks.length,
		hasPhases: (phasesCount || 0) > 0,
		completionRate:
			activeTasks.length + doneTasks.length > 0
				? Math.round((doneTasks.length / (activeTasks.length + doneTasks.length)) * 100)
				: 0
	};

	return ApiResponse.success({ stats });
}
