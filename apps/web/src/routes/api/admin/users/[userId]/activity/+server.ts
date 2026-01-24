// apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts
//
// Admin endpoint: Retrieve comprehensive user activity data
//
// PERFORMANCE NOTE (2026-01-03):
// This endpoint batches ontology reads to avoid N+1 queries.
// Pattern: Fetch onto_projects once, then load onto_tasks/onto_documents/logs in bulk.

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

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});

		if (actorError || !actorId) {
			throw actorError || new Error('Failed to resolve actor');
		}

		// Get ontology projects: include owned and shared membership
		const { data: memberRows, error: memberError } = await supabase
			.from('onto_project_members')
			.select('project_id')
			.eq('actor_id', actorId)
			.is('removed_at', null);
		if (memberError) throw memberError;

		const { data: ownedProjects, error: ownedProjectsError } = await supabase
			.from('onto_projects')
			.select('*')
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });
		if (ownedProjectsError) throw ownedProjectsError;

		const ownedIds = new Set((ownedProjects || []).map((project) => project.id));
		const sharedProjectIds = (memberRows || [])
			.map((row) => row.project_id)
			.filter((id): id is string => Boolean(id) && !ownedIds.has(id));

		const { data: sharedProjects, error: sharedProjectsError } =
			sharedProjectIds.length > 0
				? await supabase
						.from('onto_projects')
						.select('*')
						.in('id', sharedProjectIds)
						.is('deleted_at', null)
						.order('created_at', { ascending: false })
				: { data: [], error: null };
		if (sharedProjectsError) throw sharedProjectsError;

		const projects = [...(ownedProjects || []), ...(sharedProjects || [])].sort(
			(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		const projectIds = projects.map((project) => project.id);

		const [
			tasksResult,
			documentsResult,
			dailyBriefsResult,
			projectLogsResult,
			scheduledBriefsResult,
			agentSessionsResult
		] = await Promise.all([
			projectIds.length
				? supabase
						.from('onto_tasks')
						.select('*')
						.in('project_id', projectIds)
						.is('deleted_at', null)
						.order('created_at', { ascending: false })
				: Promise.resolve({ data: [] }),
			projectIds.length
				? supabase
						.from('onto_documents')
						.select('*')
						.in('project_id', projectIds)
						.is('deleted_at', null)
						.order('created_at', { ascending: false })
				: Promise.resolve({ data: [] }),
			supabase
				.from('ontology_daily_briefs')
				.select('*')
				.eq('actor_id', actorId)
				.order('created_at', { ascending: false }),
			projectIds.length
				? supabase
						.from('onto_project_logs')
						.select(
							'project_id, entity_type, action, before_data, after_data, created_at'
						)
						.in('project_id', projectIds)
						.order('created_at', { ascending: false })
						.limit(200)
				: Promise.resolve({ data: [] }),
			supabase
				.from('task_calendar_events')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			supabase
				.from('agent_chat_sessions')
				.select('id, status, session_type, message_count, created_at')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
		]);

		const tasks = tasksResult.data || [];
		const documents = documentsResult.data || [];
		const dailyBriefs = dailyBriefsResult.data || [];
		const projectLogs = projectLogsResult.data || [];
		const scheduledBriefs = scheduledBriefsResult.data || [];
		const agentSessions = agentSessionsResult.data || [];

		// Aggregate task counts by project_id
		const taskCountsByProject: Record<string, { total: number; completed: number }> = {};
		(tasks || []).forEach((task) => {
			if (task.project_id) {
				if (!taskCountsByProject[task.project_id]) {
					taskCountsByProject[task.project_id] = { total: 0, completed: 0 };
				}
				taskCountsByProject[task.project_id].total++;
				if (task.state_key === 'done') {
					taskCountsByProject[task.project_id].completed++;
				}
			}
		});

		// Aggregate document counts by project_id
		const documentsCountsByProject: Record<string, number> = {};
		(documents || []).forEach((document) => {
			if (document.project_id) {
				documentsCountsByProject[document.project_id] =
					(documentsCountsByProject[document.project_id] || 0) + 1;
			}
		});

		// Build processed projects with aggregated stats
		const processedProjects = (projects || []).map((project) => ({
			...project,
			task_count: taskCountsByProject[project.id]?.total || 0,
			completed_task_count: taskCountsByProject[project.id]?.completed || 0,
			notes_count: documentsCountsByProject[project.id] || 0,
			status: project.state_key
		}));

		const projectNameById = new Map(
			(processedProjects || []).map((project) => [project.id, project.name])
		);

		const activities: any[] = [];

		projectLogs.forEach((log) => {
			const data = log.after_data || log.before_data || {};
			const objectName =
				(data as any).title || (data as any).name || (data as any).rel || 'Untitled';
			activities.push({
				entity_type: log.entity_type,
				action: log.action,
				created_at: log.created_at,
				object_name: objectName,
				project_name: projectNameById.get(log.project_id) || 'Unassigned',
				details: (data as any).description || null
			});
		});

		dailyBriefs.forEach((brief) => {
			activities.push({
				entity_type: 'brief',
				action: 'generated',
				created_at: brief.created_at,
				object_name: 'Daily Brief',
				details: brief.brief_date ? `Generated for ${brief.brief_date}` : 'Daily brief'
			});
		});

		scheduledBriefs.forEach((scheduled) => {
			activities.push({
				entity_type: 'calendar',
				action: 'scheduled',
				created_at: scheduled.created_at,
				object_name: scheduled.event_title || 'Scheduled Brief',
				details: scheduled.event_start
					? `Scheduled for ${new Date(scheduled.event_start).toLocaleDateString()}`
					: 'Scheduled brief'
			});
		});

		agentSessions.forEach((session) => {
			activities.push({
				entity_type: 'agentic_session',
				action: session.status || 'started',
				created_at: session.created_at,
				object_name: session.session_type || 'Agentic Chat',
				details: `${session.message_count || 0} messages`
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
			completed_tasks: tasks?.filter((t) => t.state_key === 'done').length || 0,
			total_notes: documents?.length || 0,
			total_briefs: dailyBriefs?.length || 0,
			scheduled_briefs: scheduledBriefs?.length || 0,
			total_agentic_sessions: agentSessions?.length || 0,
			total_agentic_messages:
				agentSessions?.reduce((sum, s) => sum + (s.message_count || 0), 0) || 0
		};

		// Return comprehensive user data
		return ApiResponse.success({
			...userData,
			user_context: userContext,
			projects: processedProjects,
			recent_activity: activities.slice(0, 50), // Last 50 activities sorted by date
			activity_stats: activityStats,
			tasks: tasks || [],
			notes: documents || [],
			daily_briefs: dailyBriefs || [],
			scheduled_briefs: scheduledBriefs || [],
			agentic_sessions: agentSessions || []
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch user activity');
	}
};
