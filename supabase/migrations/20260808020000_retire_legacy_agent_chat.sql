-- supabase/migrations/20260808020000_retire_legacy_agent_chat.sql
-- Retire the pre-ontology agent-chat generation after a verified external archive.
-- Archive: legacy-agent-chat-2026-08-07T16-10-06-522Z
-- Package SHA-256: 9038d36050b3da72659828a4e7fa8bd0e0d1e4f844b7606f5aa0b556eb426c29

BEGIN;

-- Preserve the exact deployed retargeting/engagement contracts while moving
-- their activity source to current chat sessions.
DO $replace_legacy_activity_sources$
DECLARE
	function_name regprocedure;
	function_definition text;
BEGIN
	FOREACH function_name IN ARRAY ARRAY[
		to_regprocedure('public.freeze_retargeting_founder_pilot_cohort(text,text,integer,integer,numeric,integer,timestamptz,boolean)'),
		to_regprocedure('public.get_retargeting_founder_pilot_member_metrics(text,text,timestamptz)'),
		to_regprocedure('public.get_daily_active_users(date,date)'),
		to_regprocedure('public.get_user_engagement_metrics()')
	]
	LOOP
		IF function_name IS NULL THEN
			RAISE EXCEPTION 'required activity function is missing before legacy agent-chat retirement';
		END IF;

		SELECT pg_get_functiondef(function_name) INTO function_definition;
		function_definition := replace(
			replace(function_definition, 'public.agent_chat_sessions', 'public.chat_sessions'),
			'FROM agent_chat_sessions',
			'FROM chat_sessions'
		);
		function_definition := replace(
			function_definition,
			'''agent_chat_session''::text',
			'''chat_session''::text'
		);
		EXECUTE function_definition;
	END LOOP;
END;
$replace_legacy_activity_sources$;

DROP FUNCTION IF EXISTS public.get_admin_dashboard_comprehensive_analytics(
	timestamptz,
	timestamptz,
	timestamptz
);

CREATE FUNCTION public.get_admin_dashboard_comprehensive_analytics(
	start_ts timestamptz,
	end_ts timestamptz,
	last_24h_ts timestamptz
)
RETURNS TABLE (
	total_users bigint,
	total_beta_users bigint,
	new_users_last_24h bigint,
	new_beta_signups_last_24h bigint,
	chat_sessions bigint,
	chat_messages bigint,
	chat_unique_users bigint,
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
	),
	chat_user_ids AS (
		SELECT user_id FROM chat_sessions_window WHERE user_id IS NOT NULL
		UNION
		SELECT user_id FROM chat_messages_window WHERE user_id IS NOT NULL
	),
	chat_leaderboard AS (
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
	message_leaderboard AS (
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
		(SELECT COUNT(*) FROM chat_sessions_window)::bigint AS chat_sessions,
		(SELECT COUNT(*) FROM chat_messages_window)::bigint AS chat_messages,
		(SELECT COUNT(*) FROM chat_user_ids)::bigint AS chat_unique_users,
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
				COALESCE((SELECT jsonb_agg(to_jsonb(chat_leaderboard) ORDER BY chat_leaderboard.count DESC) FROM chat_leaderboard), '[]'::jsonb),
			'agentMessages',
				COALESCE((SELECT jsonb_agg(to_jsonb(message_leaderboard) ORDER BY message_leaderboard.count DESC) FROM message_leaderboard), '[]'::jsonb),
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

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_comprehensive_analytics(
	timestamptz,
	timestamptz,
	timestamptz
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_agent_plan_step(uuid, integer, jsonb);

DO $retire_legacy_agent_chat$
DECLARE
	agents_count bigint;
	plans_count bigint;
	sessions_count bigint;
	messages_count bigint;
	executions_count bigint;
	unmapped_count bigint;
	conflict_count bigint;
BEGIN
	IF to_regclass('public.agents') IS NULL
		AND to_regclass('public.agent_plans') IS NULL
		AND to_regclass('public.agent_chat_sessions') IS NULL
		AND to_regclass('public.agent_chat_messages') IS NULL
		AND to_regclass('public.agent_executions') IS NULL THEN
		RETURN;
	END IF;

	IF to_regclass('public.agents') IS NULL
		OR to_regclass('public.agent_plans') IS NULL
		OR to_regclass('public.agent_chat_sessions') IS NULL
		OR to_regclass('public.agent_chat_messages') IS NULL
		OR to_regclass('public.agent_executions') IS NULL THEN
		RAISE EXCEPTION 'legacy agent-chat retirement found a partial table bundle';
	END IF;

	LOCK TABLE
		public.agent_chat_messages,
		public.agent_executions,
		public.agent_chat_sessions,
		public.agent_plans,
		public.agents
	IN ACCESS EXCLUSIVE MODE;

	SELECT COUNT(*) INTO agents_count FROM public.agents;
	SELECT COUNT(*) INTO plans_count FROM public.agent_plans;
	SELECT COUNT(*) INTO sessions_count FROM public.agent_chat_sessions;
	SELECT COUNT(*) INTO messages_count FROM public.agent_chat_messages;
	SELECT COUNT(*) INTO executions_count FROM public.agent_executions;

	IF agents_count <> 832
		OR plans_count <> 81
		OR sessions_count <> 164
		OR messages_count <> 535
		OR executions_count <> 94 THEN
		RAISE EXCEPTION
			'legacy agent-chat counts differ from archive (agents %, plans %, sessions %, messages %, executions %)',
			agents_count,
			plans_count,
			sessions_count,
			messages_count,
			executions_count;
	END IF;

	SELECT COUNT(*)
	INTO unmapped_count
	FROM public.llm_usage_logs usage
	LEFT JOIN public.agent_chat_sessions direct_session
		ON direct_session.id = usage.agent_session_id
	LEFT JOIN public.agent_plans direct_plan
		ON direct_plan.id = usage.agent_plan_id
	LEFT JOIN public.agent_executions execution
		ON execution.id = usage.agent_execution_id
	LEFT JOIN public.agent_chat_sessions execution_session
		ON execution_session.id = execution.agent_session_id
	LEFT JOIN public.agent_plans execution_plan
		ON execution_plan.id = execution.plan_id
	WHERE (
		usage.agent_session_id IS NOT NULL
		OR usage.agent_plan_id IS NOT NULL
		OR usage.agent_execution_id IS NOT NULL
	)
	AND COALESCE(
		usage.chat_session_id,
		direct_session.parent_session_id,
		direct_plan.session_id,
		execution_session.parent_session_id,
		execution_plan.session_id
	) IS NULL;

	IF unmapped_count > 0 THEN
		RAISE EXCEPTION '% llm_usage_logs rows have no current chat-session mapping', unmapped_count;
	END IF;

	SELECT COUNT(*)
	INTO conflict_count
	FROM public.llm_usage_logs usage
	LEFT JOIN public.agent_chat_sessions direct_session
		ON direct_session.id = usage.agent_session_id
	LEFT JOIN public.agent_plans direct_plan
		ON direct_plan.id = usage.agent_plan_id
	LEFT JOIN public.agent_executions execution
		ON execution.id = usage.agent_execution_id
	LEFT JOIN public.agent_chat_sessions execution_session
		ON execution_session.id = execution.agent_session_id
	LEFT JOIN public.agent_plans execution_plan
		ON execution_plan.id = execution.plan_id
	CROSS JOIN LATERAL (
		SELECT COUNT(DISTINCT candidate)::integer AS candidate_count
		FROM unnest(ARRAY[
			usage.chat_session_id,
			direct_session.parent_session_id,
			direct_plan.session_id,
			execution_session.parent_session_id,
			execution_plan.session_id
		]) candidate
		WHERE candidate IS NOT NULL
	) candidates
	WHERE candidates.candidate_count > 1;

	IF conflict_count > 0 THEN
		RAISE EXCEPTION '% llm_usage_logs rows have conflicting current chat-session mappings', conflict_count;
	END IF;

	UPDATE public.llm_usage_logs usage
	SET
		chat_session_id = COALESCE(
			usage.chat_session_id,
			(SELECT parent_session_id FROM public.agent_chat_sessions WHERE id = usage.agent_session_id),
			(SELECT session_id FROM public.agent_plans WHERE id = usage.agent_plan_id),
			(
				SELECT session.parent_session_id
				FROM public.agent_executions execution
				JOIN public.agent_chat_sessions session ON session.id = execution.agent_session_id
				WHERE execution.id = usage.agent_execution_id
			),
			(
				SELECT plan.session_id
				FROM public.agent_executions execution
				JOIN public.agent_plans plan ON plan.id = execution.plan_id
				WHERE execution.id = usage.agent_execution_id
			)
		),
		metadata = COALESCE(usage.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
			'legacy_agent_execution_id', usage.agent_execution_id,
			'legacy_agent_plan_id', usage.agent_plan_id,
			'legacy_agent_session_id', usage.agent_session_id
		))
	WHERE usage.agent_session_id IS NOT NULL
		OR usage.agent_plan_id IS NOT NULL
		OR usage.agent_execution_id IS NOT NULL;

	-- The live census has no populated legacy timing references. Keep the mapping
	-- generic so a late row still preserves its archived UUIDs and current session.
	SELECT COUNT(*)
	INTO unmapped_count
	FROM public.timing_metrics timing
	LEFT JOIN public.agent_chat_sessions legacy_session ON legacy_session.id = timing.session_id
	LEFT JOIN public.agent_plans legacy_plan ON legacy_plan.id = timing.agent_plan_id
	LEFT JOIN public.agents legacy_agent ON legacy_agent.id = timing.planner_agent_id
	WHERE (timing.session_id IS NOT NULL OR timing.agent_plan_id IS NOT NULL OR timing.planner_agent_id IS NOT NULL)
		AND COALESCE(
			legacy_session.parent_session_id,
			legacy_plan.session_id,
			legacy_agent.created_for_session
		) IS NULL;

	IF unmapped_count > 0 THEN
		RAISE EXCEPTION '% timing_metrics rows have no current chat-session mapping', unmapped_count;
	END IF;

	UPDATE public.timing_metrics timing
	SET
		session_id = COALESCE(
			(SELECT parent_session_id FROM public.agent_chat_sessions WHERE id = timing.session_id),
			(SELECT session_id FROM public.agent_plans WHERE id = timing.agent_plan_id),
			(SELECT created_for_session FROM public.agents WHERE id = timing.planner_agent_id)
		),
		metadata = COALESCE(timing.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
			'legacy_agent_session_id', timing.session_id,
			'legacy_agent_plan_id', timing.agent_plan_id,
			'legacy_planner_agent_id', timing.planner_agent_id
		))
	WHERE timing.session_id IS NOT NULL
		OR timing.agent_plan_id IS NOT NULL
		OR timing.planner_agent_id IS NOT NULL;

	ALTER TABLE public.llm_usage_logs
		DROP CONSTRAINT IF EXISTS llm_usage_logs_agent_execution_id_fkey,
		DROP CONSTRAINT IF EXISTS llm_usage_logs_agent_plan_id_fkey,
		DROP CONSTRAINT IF EXISTS llm_usage_logs_agent_session_id_fkey,
		DROP COLUMN IF EXISTS agent_execution_id,
		DROP COLUMN IF EXISTS agent_plan_id,
		DROP COLUMN IF EXISTS agent_session_id;

	ALTER TABLE public.timing_metrics
		DROP CONSTRAINT IF EXISTS timing_metrics_session_id_fkey,
		DROP CONSTRAINT IF EXISTS timing_metrics_agent_plan_id_fkey,
		DROP CONSTRAINT IF EXISTS timing_metrics_planner_agent_id_fkey,
		DROP COLUMN IF EXISTS agent_plan_id,
		DROP COLUMN IF EXISTS planner_agent_id;

	ALTER TABLE public.timing_metrics
		ADD CONSTRAINT timing_metrics_session_id_fkey
		FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE SET NULL;

	DROP TABLE public.agent_chat_messages;
	DROP TABLE public.agent_executions;
	DROP TABLE public.agent_chat_sessions;
	DROP TABLE public.agent_plans;
	DROP TABLE public.agents;
END;
$retire_legacy_agent_chat$;

DROP FUNCTION IF EXISTS public.increment_agent_session_message_count();
DROP FUNCTION IF EXISTS public.update_agent_plans_updated_at();

DROP TYPE IF EXISTS public.agent_permission;
DROP TYPE IF EXISTS public.agent_session_type;
DROP TYPE IF EXISTS public.agent_status;
DROP TYPE IF EXISTS public.agent_type;
DROP TYPE IF EXISTS public.execution_status;
DROP TYPE IF EXISTS public.message_role;
DROP TYPE IF EXISTS public.message_sender_type;
DROP TYPE IF EXISTS public.planning_strategy;

COMMENT ON COLUMN public.llm_usage_logs.metadata IS
	'Provider and attribution metadata. Retired agent generation UUIDs are retained under legacy_agent_* keys.';
COMMENT ON COLUMN public.timing_metrics.metadata IS
	'Timing breakdown metadata. Retired agent generation UUIDs are retained under legacy_agent_* keys.';
COMMENT ON COLUMN public.timing_metrics.session_id IS
	'Current chat_sessions identifier; legacy agent session identifiers were archived into metadata during retirement.';

COMMIT;
