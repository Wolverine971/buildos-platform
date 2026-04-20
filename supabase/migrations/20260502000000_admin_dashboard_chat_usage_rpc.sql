-- supabase/migrations/20260502000000_admin_dashboard_chat_usage_rpc.sql
-- Move /admin chat usage summary work into Postgres so the dashboard does not
-- transfer tens of thousands of raw analytics rows just to compute counts.

CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at_desc
	ON public.chat_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_message_at_desc
	ON public.chat_sessions(last_message_at DESC)
	WHERE last_message_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at_desc
	ON public.chat_messages(created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_chat_usage(
	start_ts timestamptz,
	end_ts timestamptz
)
RETURNS TABLE (
	total_sessions bigint,
	total_messages bigint,
	total_tokens numeric,
	unique_users bigint,
	avg_messages_per_session numeric,
	avg_tokens_per_session numeric,
	planner_sessions bigint,
	executor_sessions bigint,
	tool_sessions bigint,
	failed_sessions bigint,
	failure_rate numeric
)
LANGUAGE sql
STABLE
AS $function$
	WITH sessions AS (
		SELECT
			id,
			user_id,
			status,
			COALESCE(tool_call_count, 0) AS tool_call_count
		FROM public.chat_sessions
		WHERE (created_at >= start_ts OR last_message_at >= start_ts)
			AND created_at <= end_ts
	),
	messages AS (
		SELECT
			session_id,
			user_id,
			COALESCE(total_tokens, 0) AS total_tokens,
			error_message
		FROM public.chat_messages
		WHERE created_at >= start_ts
			AND created_at <= end_ts
	),
	usage_logs AS (
		SELECT
			chat_session_id,
			user_id,
			COALESCE(total_tokens, 0) AS total_tokens,
			status,
			error_message,
			LOWER(COALESCE(operation_type, '')) AS operation_type
		FROM public.llm_usage_logs
		WHERE chat_session_id IS NOT NULL
			AND created_at >= start_ts
			AND created_at <= end_ts
	),
	tool_executions AS (
		SELECT
			session_id,
			success
		FROM public.chat_tool_executions
		WHERE created_at >= start_ts
			AND created_at <= end_ts
	),
	session_ids AS (
		SELECT id AS session_id FROM sessions WHERE id IS NOT NULL
		UNION
		SELECT session_id FROM messages WHERE session_id IS NOT NULL
		UNION
		SELECT chat_session_id AS session_id FROM usage_logs WHERE chat_session_id IS NOT NULL
		UNION
		SELECT session_id FROM tool_executions WHERE session_id IS NOT NULL
	),
	user_ids AS (
		SELECT user_id FROM sessions WHERE user_id IS NOT NULL
		UNION
		SELECT user_id FROM messages WHERE user_id IS NOT NULL
		UNION
		SELECT user_id FROM usage_logs WHERE user_id IS NOT NULL
	),
	planner_session_ids AS (
		SELECT chat_session_id AS session_id
		FROM usage_logs
		WHERE chat_session_id IS NOT NULL
			AND (
				operation_type LIKE '%planner%'
				OR operation_type LIKE 'plan\_%' ESCAPE '\'
			)
	),
	executor_session_ids AS (
		SELECT id AS session_id FROM sessions WHERE tool_call_count > 0
		UNION
		SELECT chat_session_id AS session_id
		FROM usage_logs
		WHERE chat_session_id IS NOT NULL
			AND (
				operation_type LIKE '%executor%'
				OR operation_type LIKE '%tool%'
				OR operation_type LIKE '%gateway%'
			)
		UNION
		SELECT session_id FROM tool_executions WHERE session_id IS NOT NULL
	),
	tool_session_ids AS (
		SELECT id AS session_id FROM sessions WHERE tool_call_count > 0
		UNION
		SELECT session_id FROM tool_executions WHERE session_id IS NOT NULL
	),
	failed_session_ids AS (
		SELECT id AS session_id
		FROM sessions
		WHERE LOWER(COALESCE(status, '')) IN ('failed', 'error')
		UNION
		SELECT session_id FROM messages WHERE session_id IS NOT NULL AND error_message IS NOT NULL
		UNION
		SELECT chat_session_id AS session_id
		FROM usage_logs
		WHERE chat_session_id IS NOT NULL
			AND (
				error_message IS NOT NULL
				OR (status IS NOT NULL AND status <> 'success')
			)
		UNION
		SELECT session_id FROM tool_executions WHERE session_id IS NOT NULL AND success IS FALSE
	),
	token_totals AS (
		SELECT
			COALESCE((SELECT SUM(total_tokens) FROM usage_logs), 0)::numeric AS usage_token_total,
			COALESCE((SELECT SUM(total_tokens) FROM messages), 0)::numeric AS message_token_total
	),
	counts AS (
		SELECT
			(SELECT COUNT(*) FROM session_ids)::bigint AS total_sessions,
			(SELECT COUNT(*) FROM messages)::bigint AS total_messages,
			CASE
				WHEN token_totals.usage_token_total > 0 THEN token_totals.usage_token_total
				ELSE token_totals.message_token_total
			END AS total_tokens,
			(SELECT COUNT(*) FROM user_ids)::bigint AS unique_users,
			(SELECT COUNT(*) FROM planner_session_ids)::bigint AS planner_sessions,
			(SELECT COUNT(*) FROM executor_session_ids)::bigint AS executor_sessions,
			(SELECT COUNT(*) FROM tool_session_ids)::bigint AS tool_sessions,
			(SELECT COUNT(*) FROM failed_session_ids)::bigint AS failed_sessions
		FROM token_totals
	)
	SELECT
		counts.total_sessions,
		counts.total_messages,
		counts.total_tokens,
		counts.unique_users,
		CASE
			WHEN counts.total_sessions > 0
				THEN ROUND((counts.total_messages::numeric / counts.total_sessions::numeric), 2)
			ELSE 0
		END AS avg_messages_per_session,
		CASE
			WHEN counts.total_sessions > 0
				THEN ROUND((counts.total_tokens / counts.total_sessions::numeric), 2)
			ELSE 0
		END AS avg_tokens_per_session,
		counts.planner_sessions,
		counts.executor_sessions,
		counts.tool_sessions,
		counts.failed_sessions,
		CASE
			WHEN counts.total_sessions > 0
				THEN (counts.failed_sessions::numeric / counts.total_sessions::numeric) * 100
			ELSE 0
		END AS failure_rate
	FROM counts;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_chat_usage(timestamptz, timestamptz)
	TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_chat_usage(timestamptz, timestamptz)
	TO service_role;
