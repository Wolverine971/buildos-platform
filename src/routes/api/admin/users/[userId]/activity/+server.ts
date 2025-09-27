// src/routes/api/admin/users/[userId]/activity/+server.ts
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

		// Get projects with task and note counts
		const { data: projects } = await supabase
			.from('projects')
			.select(
				`
				*,
				tasks!inner(count),
				notes!inner(count)
			`
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Process projects to get counts
		const processedProjects = await Promise.all(
			(projects || []).map(async (project) => {
				// Get task counts
				const { count: taskCount } = await supabase
					.from('tasks')
					.select('*', { count: 'exact', head: true })
					.eq('project_id', project.id);

				const { count: completedTaskCount } = await supabase
					.from('tasks')
					.select('*', { count: 'exact', head: true })
					.eq('project_id', project.id)
					.eq('status', 'completed');

				// Get notes count
				const { count: notesCount } = await supabase
					.from('notes')
					.select('*', { count: 'exact', head: true })
					.eq('project_id', project.id);

				return {
					...project,
					task_count: taskCount || 0,
					completed_task_count: completedTaskCount || 0,
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

		// Get tasks
		const { data: tasks } = await supabase
			.from('tasks')
			.select('*, projects(name)')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		// Get notes
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

		// Build recent activity timeline
		const activities: any[] = [];

		// Add project activities
		processedProjects.forEach((project) => {
			activities.push({
				activity_type: 'project_created',
				created_at: project.created_at,
				object_name: project.name,
				project_name: project.name,
				details: project.description
			});
		});

		// Add task activities
		tasks?.forEach((task) => {
			activities.push({
				activity_type: task.status === 'completed' ? 'task_completed' : 'task_created',
				created_at: task.created_at,
				object_name: task.title,
				project_name: task.projects?.name,
				details: task.description
			});
		});

		// Add note activities
		notes?.forEach((note) => {
			activities.push({
				activity_type: 'note_created',
				created_at: note.created_at,
				object_name: note.title,
				project_name: note.projects?.name,
				details: note.content?.substring(0, 100)
			});
		});

		// Add brain dump activities
		brainDumps?.forEach((dump) => {
			activities.push({
				activity_type: 'brain_dump_created',
				created_at: dump.created_at,
				object_name: dump.title,
				details: dump.content?.substring(0, 100)
			});
		});

		// Add brief activities
		dailyBriefs?.forEach((brief) => {
			activities.push({
				activity_type: 'brief_generated',
				created_at: brief.created_at,
				object_name: `Daily Brief`,
				details: brief.content?.substring(0, 100)
			});
		});

		// Add scheduled brief activities
		scheduledBriefs?.forEach((scheduled) => {
			activities.push({
				activity_type: 'brief_scheduled',
				created_at: scheduled.created_at,
				object_name: scheduled.event_title,
				details: `Scheduled for ${scheduled.event_start}`
			});
		});

		// Sort activities by date
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
			recent_activity: activities.slice(0, 50), // Last 50 activities
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
