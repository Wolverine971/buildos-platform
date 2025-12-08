// apps/web/src/routes/projects-old/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import type {
	CalendarStatus,
	ProcessedPhase,
	TaskStats,
	TaskWithCalendarEvents
} from '$lib/types/project-page.types';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';

export const load: PageServerLoad = async ({
	params,
	locals: { supabase, safeGetSession },
	url,
	depends
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userId = user.id;
	let projectId = params.id;

	// Check if the parameter might be a slug instead of an ID
	// UUIDs have a specific format, if it doesn't match, treat it as a slug
	const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		projectId
	);

	if (!isUUID) {
		// Try to find the project by slug
		const { data: projectBySlug, error: slugError } = await supabase
			.from('projects')
			.select('id')
			.eq('slug', projectId)
			.eq('user_id', userId)
			.single();

		if (projectBySlug && !slugError) {
			// Redirect to the new ID-based URL, preserving query params
			const redirectUrl = `/projects/${projectBySlug.id}${url.search}`;
			throw redirect(307, redirectUrl);
		}
		// If no project found by slug, continue with normal 404 handling
	}
	const activeTab = url.searchParams.get('tab') || 'overview';

	// Define minimal dependencies
	depends(`projects:${projectId}`);

	try {
		// Only fetch minimal project data needed for initial render
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('*')
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (projectError || !project) {
			throw error(404, 'Project not found');
		}

		// Fetch project calendar if it exists (use maybeSingle to handle no results gracefully)
		const { data: projectCalendar, error: calendarError } = await supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', project.id)
			.maybeSingle();

		// Check if this is the user's first project (lightweight query)
		const { count: projectCount } = await supabase
			.from('projects')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId);

		const isFirstProject = projectCount ? projectCount <= 1 : false;

		return {
			// Minimal project data for immediate render
			project,
			// Stream non-critical data for progressive hydration
			tasks: fetchProjectTasks(supabase, project.id, userId),
			phases: fetchProjectPhases(supabase, project.id, userId),
			notes: fetchProjectNotes(supabase, project.id, userId),
			stats: fetchProjectStats(supabase, project.id, userId),
			calendarStatus: fetchCalendarStatus(supabase, userId),
			projectCalendar: projectCalendar || null,
			user: {
				id: userId
			},
			isFirstProject,
			activeTab
		};
	} catch (err) {
		throw error(500, 'Failed to load project data');
	}
};

async function fetchProjectTasks(
	supabase: any,
	projectId: string,
	userId: string
): Promise<TaskWithCalendarEvents[]> {
	try {
		const { data: tasks, error } = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events(
					id,
					calendar_event_id,
					calendar_id,
					event_start,
					event_end,
					event_link,
					event_title,
					sync_status,
					sync_error,
					last_synced_at
				),
				phase_tasks(
					id,
					phase_id,
					suggested_start_date,
					phases(
						id,
						name,
						start_date,
						end_date
					)
				)
			`
			)
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.limit(500);

		if (error) {
			throw error;
		}

		return tasks ?? [];
	} catch (err) {
		console.error('Failed to stream project tasks', err);
		throw new Error('Failed to load tasks');
	}
}

async function fetchProjectNotes(supabase: any, projectId: string, userId: string): Promise<any[]> {
	try {
		const { data: notes, error } = await supabase
			.from('notes')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(50);

		if (error) {
			throw error;
		}

		return notes ?? [];
	} catch (err) {
		console.error('Failed to stream project notes', err);
		throw new Error('Failed to load notes');
	}
}

async function fetchProjectPhases(
	supabase: any,
	projectId: string,
	userId: string
): Promise<ProcessedPhase[]> {
	try {
		const { data: rpcResult, error: rpcError } = await supabase.rpc(
			'get_project_phases_hierarchy',
			{
				p_project_id: projectId,
				p_user_id: userId
			}
		);

		if (rpcError) {
			console.error('Error fetching phases via RPC', rpcError);
			return fetchProjectPhasesFallback(supabase, projectId);
		}

		if (rpcResult?.error === 'Unauthorized') {
			throw new Error('Unauthorized');
		}

		const phases = rpcResult?.phases || [];

		return phases.map((phase: any) => ({
			...phase,
			tasks: (phase.tasks || []).map((task: any) => ({
				...task,
				task_calendar_events: task.calendar_events || []
			}))
		}));
	} catch (err) {
		console.error('Failed to stream project phases', err);
		throw new Error('Failed to load phases');
	}
}

async function fetchProjectPhasesFallback(
	supabase: any,
	projectId: string
): Promise<ProcessedPhase[]> {
	const { data: phasesWithTasks, error: fetchError } = await supabase
		.from('phases')
		.select(
			`
			*,
			phase_tasks (
				task_id,
				suggested_start_date,
				assignment_reason,
				tasks (
					id,
					title,
					description,
					status,
					priority,
					task_type,
					start_date,
					deleted_at,
					created_at,
					updated_at,
					details,
					project_id,
					completed_at,
					task_calendar_events(
						id,
						calendar_event_id,
						calendar_id,
						event_start,
						event_end,
						event_link,
						sync_status,
						organizer_email,
						organizer_display_name,
						organizer_self,
						attendees
					)
				)
			)
		`
		)
		.eq('project_id', projectId)
		.order('order', { ascending: true });

	if (fetchError) {
		console.error('Fallback phase fetch failed', fetchError);
		throw new Error('Failed to load phases');
	}

	return (phasesWithTasks || []).map((phase: any) => {
		const tasks =
			phase.phase_tasks?.map((relation: any) => ({
				...relation.tasks,
				suggested_start_date: relation.suggested_start_date,
				assignment_reason: relation.assignment_reason
			})) ?? [];

		return {
			...phase,
			tasks,
			task_count: tasks.length,
			completed_tasks: tasks.filter((task: any) => task.status === 'done' && !task.deleted_at)
				.length
		};
	});
}

async function fetchProjectStats(
	supabase: any,
	projectId: string,
	userId: string
): Promise<TaskStats> {
	try {
		const { data: rpcResult, error: rpcError } = await supabase.rpc('get_project_statistics', {
			p_project_id: projectId,
			p_user_id: userId
		});

		if (rpcError) {
			console.error('Error fetching stats via RPC', rpcError);
			return fetchProjectStatsFallback(supabase, projectId, userId);
		}

		if (rpcResult?.error === 'Unauthorized') {
			throw new Error('Unauthorized');
		}

		const stats = rpcResult?.stats || {};

		return {
			total: stats.total || 0,
			completed: stats.completed || 0,
			inProgress: stats.inProgress || 0,
			blocked: stats.blocked || 0,
			deleted: stats.deleted || 0,
			active: stats.active || 0,
			backlog: stats.backlog || 0,
			scheduled: stats.scheduled || 0
		};
	} catch (err) {
		console.error('Failed to stream project stats', err);
		throw new Error('Failed to load stats');
	}
}

async function fetchProjectStatsFallback(
	supabase: any,
	projectId: string,
	userId: string
): Promise<TaskStats> {
	const { data: tasks, error: tasksError } = await supabase
		.from('tasks')
		.select('id, status, deleted_at, task_calendar_events(sync_status)')
		.eq('project_id', projectId)
		.eq('user_id', userId);

	if (tasksError) {
		console.error('Fallback stats fetch failed', tasksError);
		throw new Error('Failed to load stats');
	}

	const allTasks = tasks || [];
	const activeTasks = allTasks.filter((t: any) => !t.deleted_at && t.status !== 'done');
	const doneTasks = allTasks.filter((t: any) => !t.deleted_at && t.status === 'done');
	const deletedTasks = allTasks.filter((t: any) => t.deleted_at);

	const scheduledTasks = activeTasks.filter((task: any) => {
		const events =
			task.task_calendar_events?.filter(
				(event: any) => event.sync_status === 'synced' || event.sync_status === 'pending'
			) || [];
		return events.length > 0;
	});

	const backlogTasks = activeTasks.filter((task: any) => {
		const events =
			task.task_calendar_events?.filter(
				(event: any) => event.sync_status === 'synced' || event.sync_status === 'pending'
			) || [];
		return events.length === 0;
	});

	return {
		total: activeTasks.length + doneTasks.length,
		completed: doneTasks.length,
		inProgress: activeTasks.filter((t: any) => t.status === 'in_progress').length,
		blocked: activeTasks.filter((t: any) => t.status === 'blocked').length,
		deleted: deletedTasks.length,
		active: activeTasks.length,
		backlog: backlogTasks.length,
		scheduled: scheduledTasks.length
	};
}

async function fetchCalendarStatus(supabase: any, userId: string): Promise<CalendarStatus> {
	try {
		const service = new GoogleOAuthService(supabase);
		return await service.getCalendarStatus(userId);
	} catch (err) {
		console.error('Failed to stream calendar status', err);
		throw new Error('Failed to load calendar status');
	}
}
