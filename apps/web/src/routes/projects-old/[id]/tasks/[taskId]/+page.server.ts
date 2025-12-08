// apps/web/src/routes/projects-old/[id]/tasks/[taskId]/+page.server.ts
// https://claude.ai/chat/bb4907d4-80f4-414f-ac8b-0af5ff37ecbe
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({
	params,
	locals: { supabase, safeGetSession },
	depends
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userId = user.id;
	const projectId = params.id;
	const taskId = params.taskId;

	// Check if the ID parameter is actually a slug (backwards compatibility)
	// UUIDs have a specific format, slugs typically don't contain only hex characters and dashes in UUID pattern
	const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		projectId
	);

	if (!isUuid) {
		// Try to find the project by slug and redirect to the correct URL
		const { data: projectBySlug, error: slugError } = await supabase
			.from('projects')
			.select('id')
			.eq('slug', projectId)
			.eq('user_id', userId)
			.single();

		if (!slugError && projectBySlug) {
			// Redirect to the correct ID-based URL
			throw redirect(301, `/projects/${projectBySlug.id}/tasks/${taskId}`);
		}
		// If we can't find by slug, continue and let it fail naturally with 404
	}

	// Define granular dependencies
	depends(`projects:${projectId}`);
	depends(`task:${taskId}`);
	depends(`projects:${projectId}:tasks`);
	depends(`projects:${projectId}:context`);
	depends(`projects:${projectId}:calendar`);

	try {
		// Load project data
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select(
				'id, name, description, status, tags, slug, start_date, end_date, created_at, updated_at, user_id, context, executive_summary'
			)
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (projectError || !project) {
			throw error(404, 'Project not found');
		}

		// Load the specific task with calendar events
		const { data: task, error: taskError } = await supabase
			.from('tasks')
			.select(
				`
				id, title, description, details, status, priority, task_type, start_date,
				duration_minutes, recurrence_pattern, recurrence_ends,
				deleted_at, created_at, updated_at, completed_at, task_steps,
				task_calendar_events(
					id, calendar_event_id, calendar_id, event_start, event_end,
					event_link, event_title, sync_status, sync_error, last_synced_at
				)
			`
			)
			.eq('id', taskId)
			.eq('project_id', project.id)
			.single();

		if (taskError || !task) {
			throw error(404, 'Task not found');
		}

		// Load other tasks in the project for context
		const { data: otherTasks, error: otherTasksError } = await supabase
			.from('tasks')
			.select('id, title, status, priority, start_date, dependencies')
			.eq('project_id', project.id)
			.neq('id', taskId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.limit(10);

		if (otherTasksError) {
			console.error('Error fetching other tasks:', otherTasksError);
		}

		// Load calendar status
		const googleCalendarService = new GoogleOAuthService(supabase);
		const calendarStatus = await googleCalendarService.getCalendarStatus(user.id);

		// Load dependencies (tasks that this task depends on)
		let dependencyTasks = [];
		if (task.dependencies && task.dependencies.length > 0) {
			const { data: deps } = await supabase
				.from('tasks')
				.select('id, title, status, priority')
				.in('id', task.dependencies);
			dependencyTasks = deps || [];
		}

		// Load dependent tasks (tasks that depend on this task)
		const { data: dependentTasks } = await supabase
			.from('tasks')
			.select('id, title, status, priority')
			.contains('dependencies', [taskId]);

		return {
			// Core data
			project,
			task,
			otherTasks: otherTasks || [],
			dependencyTasks,
			dependentTasks: dependentTasks || [],

			// Calendar data
			calendarStatus,

			// User data
			user: {
				id: userId
			},

			// Metadata
			__meta: {
				loadedAt: new Date().toISOString(),
				calendarConnected: calendarStatus?.isConnected ?? false
			}
		};
	} catch (err) {
		console.error('Error in task page server load:', err);
		throw error(500, 'Failed to load task data');
	}
};
