// apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const { userId } = params;

	try {
		// Get basic user info
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('*')
			.eq('id', userId)
			.single();

		if (userError) throw userError;

		// Get user context
		const { data: userContext } = await supabase
			.from('user_context')
			.select('*')
			.eq('user_id', userId)
			.single();

		// Get projects
		const { data: projects } = await supabase
			.from('projects')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Process projects to get counts using optimized queries
		const processedProjects = await Promise.all(
			(projects || []).map(async (project) => {
				// Get all task stats in one query (not separate queries for count and completed)
				const { data: taskStats } = await supabase
					.from('tasks')
					.select('id, status, completed_at', { count: 'exact' })
					.eq('project_id', project.id);

				const taskCount = taskStats?.length || 0;
				const completedTaskCount = taskStats?.filter((t) => t.status === 'done').length || 0;

				// Get notes count in one query
				const { count: notesCount } = await supabase
					.from('notes')
					.select('*', { count: 'exact', head: true })
					.eq('project_id', project.id);

				return {
					...project,
					task_count: taskCount,
					completed_task_count: completedTaskCount,
					notes_count: notesCount || 0
				};
			})
		);

		// Get brain dumps
		const { data: brainDumps } = await supabase
			.from('brain_dumps')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Get daily briefs
		const { data: dailyBriefs } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Get tasks with project names and completion info
		const { data: tasks } = await supabase
			.from('tasks')
			.select('*, projects(name), completed_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Get notes with project names
		const { data: notes } = await supabase
			.from('notes')
			.select('*, projects(name)')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Get scheduled briefs (task calendar events)
		const { data: scheduledBriefs } = await supabase
			.from('task_calendar_events')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Build recent activity timeline with proper timestamps
		const activities: any[] = [];

		// Add project activities
		processedProjects.forEach((project) => {
			activities.push({
				activity_type: 'project_created',
				created_at: project.created_at,
				object_name: project.name,
				project_name: project.name,
				details: project.description || 'No description',
				icon_color: 'purple'
			});
		});

		// Add task activities - use completed_at for task_completed, not created_at
		tasks?.forEach((task) => {
			const isCompleted = task.status === 'done';
			const timestamp = isCompleted && task.completed_at ? task.completed_at : task.created_at;

			activities.push({
				activity_type: isCompleted ? 'task_completed' : 'task_created',
				created_at: timestamp,
				object_name: task.title,
				project_name: task.projects?.name || 'Unassigned',
				details: task.description || 'No description',
				status: task.status,
				icon_color: isCompleted ? 'green' : 'orange'
			});
		});

		// Add note activities
		notes?.forEach((note) => {
			activities.push({
				activity_type: 'note_created',
				created_at: note.created_at,
				object_name: note.title || 'Untitled Note',
				project_name: note.projects?.name || 'Unassigned',
				details: note.content ? note.content.substring(0, 150) : 'No content',
				icon_color: 'emerald'
			});
		});

		// Add brain dump activities
		brainDumps?.forEach((dump) => {
			activities.push({
				activity_type: 'brain_dump_created',
				created_at: dump.created_at,
				object_name: dump.title || 'Brain Dump',
				details: dump.content ? dump.content.substring(0, 150) : 'No content',
				icon_color: 'indigo'
			});
		});

		// Add brief activities
		dailyBriefs?.forEach((brief) => {
			activities.push({
				activity_type: 'brief_generated',
				created_at: brief.created_at,
				object_name: 'Daily Brief',
				details: brief.brief_date ? `Generated for ${brief.brief_date}` : 'Daily brief',
				icon_color: 'blue'
			});
		});

		// Add scheduled brief activities
		scheduledBriefs?.forEach((scheduled) => {
			activities.push({
				activity_type: 'brief_scheduled',
				created_at: scheduled.created_at,
				object_name: scheduled.event_title || 'Scheduled Brief',
				details: scheduled.event_start
					? `Scheduled for ${new Date(scheduled.event_start).toLocaleDateString()}`
					: 'Scheduled brief',
				event_start: scheduled.event_start,
				icon_color: 'teal'
			});
		});

		// Sort activities by date (most recent first)
		activities.sort(
			(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		// Calculate activity stats
		const activityStats = {
			total_projects: processedProjects.length,
			total_tasks: tasks?.length || 0,
			completed_tasks: tasks?.filter((t) => t.status === 'completed').length || 0,
			total_notes: notes?.length || 0,
			total_briefs: dailyBriefs?.length || 0,
			total_brain_dumps: brainDumps?.length || 0,
			scheduled_briefs: scheduledBriefs?.length || 0
		};

		// Return comprehensive user data
		return ApiResponse.success({
			...userData,
			user_context: userContext,
			projects: processedProjects,
			brain_dumps: brainDumps || [],
			recent_activity: activities.slice(0, 50), // Last 50 activities sorted by date
			activity_stats: activityStats,
			tasks: tasks || [],
			notes: notes || [],
			daily_briefs: dailyBriefs || [],
			scheduled_briefs: scheduledBriefs || []
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch user activity');
	}
};
