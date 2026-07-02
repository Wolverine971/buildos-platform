-- supabase/migrations/20260702020000_admin_dashboard_comprehensive_analytics_rpc.sql
-- Collapse the main admin dashboard's raw activity scans into one Postgres
-- aggregate so the app server does not transfer and count full row sets.

CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_user
	ON public.chat_sessions(created_at DESC, user_id)
	WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_user
	ON public.chat_messages(created_at DESC, user_id)
	WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_action_created_changed_by
	ON public.onto_project_logs(action, created_at DESC, changed_by)
	WHERE changed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_created_changed_by
	ON public.onto_project_logs(created_at DESC, changed_by)
	WHERE changed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_tasks_created_by_created_active
	ON public.onto_tasks(created_at DESC, created_by)
	WHERE deleted_at IS NULL AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_tasks_due_by_active
	ON public.onto_tasks(due_at DESC, created_by)
	WHERE deleted_at IS NULL AND due_at IS NOT NULL AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at_desc
	ON public.error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved_created
	ON public.error_logs(created_at DESC)
	WHERE resolved IS DISTINCT FROM true;

CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved_critical_created
	ON public.error_logs(created_at DESC)
	WHERE resolved IS DISTINCT FROM true AND severity = 'critical';

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_comprehensive_analytics(
	start_ts timestamptz,
	end_ts timestamptz,
	last_24h_ts timestamptz
)
RETURNS TABLE (
	total_users bigint,
	total_beta_users bigint,
	new_users_last_24h bigint,
	new_beta_signups_last_24h bigint,
	agent_chat_sessions bigint,
	agent_chat_messages bigint,
	agent_chat_unique_users bigint,
	new_projects bigint,
	updated_projects bigint,
	project_unique_users bigint,
	calendar_connections bigint,
	leaderboards jsonb,
	top_active_users jsonb
)
LANGUAGE sql
STABLE
AS $function$
	WITH
	chat_sessions_window AS (
		SELECT id, user_id, created_at
		FROM public.chat_sessions
		WHERE created_at >= start_ts
			AND created_at <= end_ts
	),
	chat_messages_window AS (
		SELECT id, session_id, user_id, created_at
		FROM public.chat_messages
		WHERE created_at >= start_ts
			AND created_at <= end_ts
	),
	new_projects_window AS (
		SELECT id, created_by, created_at, updated_at
		FROM public.onto_projects
		WHERE created_at >= start_ts
			AND created_at <= end_ts
			AND deleted_at IS NULL
	),
	updated_projects_window AS (
		SELECT id, created_at, updated_at
		FROM public.onto_projects
		WHERE updated_at >= start_ts
			AND updated_at <= end_ts
			AND deleted_at IS NULL
	),
	project_update_logs_window AS (
		SELECT changed_by
		FROM public.onto_project_logs
		WHERE action = 'updated'
			AND created_at >= start_ts
			AND created_at <= end_ts
			AND changed_by IS NOT NULL
	),
	task_creators_window AS (
		SELECT created_by
		FROM public.onto_tasks
		WHERE created_at >= start_ts
			AND created_at <= end_ts
			AND deleted_at IS NULL
			AND created_by IS NOT NULL
	),
	scheduled_task_users_window AS (
		SELECT created_by
		FROM public.onto_tasks
		WHERE due_at IS NOT NULL
			AND due_at >= start_ts
			AND due_at <= end_ts
			AND deleted_at IS NULL
			AND created_by IS NOT NULL
	),
	activity AS (
		SELECT changed_by AS user_id, created_at
		FROM public.onto_project_logs
		WHERE created_at >= start_ts
			AND created_at <= end_ts
			AND changed_by IS NOT NULL
		UNION ALL
		SELECT user_id, created_at
		FROM public.ontology_daily_briefs
		WHERE generation_status = 'completed'
			AND created_at >= start_ts
			AND created_at <= end_ts
			AND user_id IS NOT NULL
		UNION ALL
		SELECT user_id, created_at
		FROM public.chat_sessions
		WHERE created_at >= start_ts
			AND created_at <= end_ts
			AND user_id IS NOT NULL
		UNION ALL
		SELECT user_id, created_at
		FROM public.chat_messages
		WHERE created_at >= start_ts
			AND created_at <= end_ts
			AND user_id IS NOT NULL
		UNION ALL
		SELECT user_id, created_at
		FROM public.agent_chat_sessions
		WHERE created_at >= start_ts
			AND created_at <= end_ts
			AND user_id IS NOT NULL
	),
	agent_chat_user_ids AS (
		SELECT user_id FROM chat_sessions_window WHERE user_id IS NOT NULL
		UNION
		SELECT user_id FROM chat_messages_window WHERE user_id IS NOT NULL
	),
	agent_chat_leaderboard AS (
		SELECT
			COALESCE(u.email, 'Unknown') AS email,
			COUNT(*)::bigint AS count
		FROM chat_sessions_window s
		LEFT JOIN public.users u ON u.id = s.user_id
		WHERE s.user_id IS NOT NULL
		GROUP BY s.user_id, u.email
		ORDER BY COUNT(*) DESC
		LIMIT 10
	),
	agent_message_leaderboard AS (
		SELECT
			COALESCE(u.email, 'Unknown') AS email,
			COUNT(*)::bigint AS count
		FROM chat_messages_window m
		LEFT JOIN public.users u ON u.id = m.user_id
		WHERE m.user_id IS NOT NULL
		GROUP BY m.user_id, u.email
		ORDER BY COUNT(*) DESC
		LIMIT 10
	),
	project_update_leaderboard AS (
		SELECT
			COALESCE(u.email, 'Unknown') AS email,
			COUNT(*)::bigint AS count
		FROM project_update_logs_window l
		LEFT JOIN public.users u ON u.id = l.changed_by
		GROUP BY l.changed_by, u.email
		ORDER BY COUNT(*) DESC
		LIMIT 10
	),
	task_created_leaderboard AS (
		SELECT
			COALESCE(a.email, u.email, a.name, 'Unknown') AS email,
			COUNT(*)::bigint AS count
		FROM task_creators_window t
		LEFT JOIN public.onto_actors a ON a.id = t.created_by
		LEFT JOIN public.users u ON u.id = a.user_id
		GROUP BY t.created_by, a.email, u.email, a.name
		ORDER BY COUNT(*) DESC
		LIMIT 10
	),
	task_scheduled_leaderboard AS (
		SELECT
			COALESCE(a.email, u.email, a.name, 'Unknown') AS email,
			COUNT(*)::bigint AS count
		FROM scheduled_task_users_window t
		LEFT JOIN public.onto_actors a ON a.id = t.created_by
		LEFT JOIN public.users u ON u.id = a.user_id
		GROUP BY t.created_by, a.email, u.email, a.name
		ORDER BY COUNT(*) DESC
		LIMIT 10
	),
	top_users AS (
		SELECT
			COALESCE(u.email, 'Unknown') AS email,
			MAX(a.created_at) AS last_activity,
			COUNT(*)::bigint AS activity_count
		FROM activity a
		LEFT JOIN public.users u ON u.id = a.user_id
		GROUP BY a.user_id, u.email
		ORDER BY COUNT(*) DESC, MAX(a.created_at) DESC
		LIMIT 10
	)
	SELECT
		(SELECT COUNT(*) FROM public.users)::bigint AS total_users,
		(
			SELECT COUNT(*)
			FROM public.beta_signups
			WHERE signup_status = 'approved'
		)::bigint AS total_beta_users,
		(
			SELECT COUNT(*)
			FROM public.users
			WHERE created_at >= last_24h_ts
		)::bigint AS new_users_last_24h,
		(
			SELECT COUNT(*)
			FROM public.beta_signups
			WHERE created_at >= last_24h_ts
		)::bigint AS new_beta_signups_last_24h,
		(SELECT COUNT(*) FROM chat_sessions_window)::bigint AS agent_chat_sessions,
		(SELECT COUNT(*) FROM chat_messages_window)::bigint AS agent_chat_messages,
		(SELECT COUNT(*) FROM agent_chat_user_ids)::bigint AS agent_chat_unique_users,
		(SELECT COUNT(*) FROM new_projects_window)::bigint AS new_projects,
		(
			SELECT COUNT(*)
			FROM updated_projects_window
			WHERE updated_at IS NOT NULL
				AND updated_at <> created_at
		)::bigint AS updated_projects,
		(
			SELECT COUNT(DISTINCT created_by)
			FROM new_projects_window
			WHERE created_by IS NOT NULL
		)::bigint AS project_unique_users,
		(
			SELECT COUNT(*)
			FROM public.user_calendar_tokens
			WHERE access_token IS NOT NULL
		)::bigint AS calendar_connections,
		jsonb_build_object(
			'agentChats',
				COALESCE((SELECT jsonb_agg(to_jsonb(agent_chat_leaderboard) ORDER BY agent_chat_leaderboard.count DESC) FROM agent_chat_leaderboard), '[]'::jsonb),
			'agentMessages',
				COALESCE((SELECT jsonb_agg(to_jsonb(agent_message_leaderboard) ORDER BY agent_message_leaderboard.count DESC) FROM agent_message_leaderboard), '[]'::jsonb),
			'projectUpdates',
				COALESCE((SELECT jsonb_agg(to_jsonb(project_update_leaderboard) ORDER BY project_update_leaderboard.count DESC) FROM project_update_leaderboard), '[]'::jsonb),
			'tasksCreated',
				COALESCE((SELECT jsonb_agg(to_jsonb(task_created_leaderboard) ORDER BY task_created_leaderboard.count DESC) FROM task_created_leaderboard), '[]'::jsonb),
			'tasksScheduled',
				COALESCE((SELECT jsonb_agg(to_jsonb(task_scheduled_leaderboard) ORDER BY task_scheduled_leaderboard.count DESC) FROM task_scheduled_leaderboard), '[]'::jsonb)
		) AS leaderboards,
		COALESCE((SELECT jsonb_agg(to_jsonb(top_users) ORDER BY top_users.activity_count DESC, top_users.last_activity DESC) FROM top_users), '[]'::jsonb)
			AS top_active_users;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_comprehensive_analytics(timestamptz, timestamptz, timestamptz)
	TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_comprehensive_analytics(timestamptz, timestamptz, timestamptz)
	TO service_role;
