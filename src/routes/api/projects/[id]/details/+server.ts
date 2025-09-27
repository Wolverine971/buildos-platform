// src/routes/api/projects/[id]/details/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Get project with all related data in a single optimized query
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select(
				`
				*,
				tasks!project_id (
					id,
					title,
					description,
					status,
					priority,
					start_date,
					completed_at,
					created_at,
					updated_at,
					task_calendar_events (
						id,
						calendar_event_id,
						calendar_id,
						sync_status
					)
				),
				notes!project_id (
					id,
					title,
					content,
					created_at,
					updated_at
				),
				phases!project_id (
					id,
					name,
					description,
					start_date,
					end_date,
					status,
					order_index,
					phase_tasks (
						id,
						task_id,
						phase_id
					)
				)
			`
			)
			.eq('id', params.id)
			.eq('user_id', user.id)
			.single();

		if (projectError) {
			if (projectError.code === 'PGRST116') {
				return ApiResponse.notFound('Project');
			}
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		// Calculate statistics
		const tasks = project.tasks || [];
		const stats = {
			totalTasks: tasks.length,
			completedTasks: tasks.filter((t: any) => t.status === 'done').length,
			inProgressTasks: tasks.filter((t: any) => t.status === 'in_progress').length,
			pendingTasks: tasks.filter((t: any) => t.status === 'backlog').length,
			totalNotes: project.notes?.length || 0,
			totalPhases: project.phases?.length || 0,
			tasksOnCalendar: tasks.filter((t: any) =>
				t.task_calendar_events?.some((e: any) => e.sync_status === 'synced')
			).length
		};

		// Find next upcoming task
		const upcomingTasks = tasks
			.filter((t: any) => t.status !== 'done' && t.start_date)
			.sort(
				(a: any, b: any) =>
					new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
			);

		const nextTask =
			upcomingTasks.length > 0
				? {
						id: upcomingTasks[0].id,
						title: upcomingTasks[0].title,
						start_date: upcomingTasks[0].start_date,
						priority: upcomingTasks[0].priority
					}
				: null;

		return ApiResponse.success({
			project,
			tasks,
			phases: project.phases || [],
			notes: project.notes || [],
			stats,
			nextTask
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
