-- packages/shared-types/src/functions/increment_chat_session_metrics.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.increment_chat_session_metrics(p_session_id uuid, p_message_increment integer DEFAULT 0, p_token_increment integer DEFAULT 0, p_tool_increment integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
	UPDATE chat_sessions
	SET message_count = COALESCE(message_count, 0) + COALESCE(p_message_increment, 0),
		total_tokens_used = COALESCE(total_tokens_used, 0) + COALESCE(p_token_increment, 0),
		tool_call_count = COALESCE(tool_call_count, 0) + COALESCE(p_tool_increment, 0),
		updated_at = NOW()
	WHERE id = p_session_id;
END;
$function$
