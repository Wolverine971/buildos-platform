-- supabase/migrations/20260102_increment_chat_session_metrics.sql
-- Add atomic metric increment function for chat_sessions

CREATE OR REPLACE FUNCTION increment_chat_session_metrics(
	p_session_id uuid,
	p_message_increment integer DEFAULT 0,
	p_token_increment integer DEFAULT 0,
	p_tool_increment integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE chat_sessions
	SET message_count = COALESCE(message_count, 0) + COALESCE(p_message_increment, 0),
		total_tokens_used = COALESCE(total_tokens_used, 0) + COALESCE(p_token_increment, 0),
		tool_call_count = COALESCE(tool_call_count, 0) + COALESCE(p_tool_increment, 0),
		updated_at = NOW()
	WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_chat_session_metrics(uuid, integer, integer, integer)
TO authenticated;

COMMENT ON FUNCTION increment_chat_session_metrics(uuid, integer, integer, integer) IS
'Atomically increment chat_sessions message_count, total_tokens_used, and tool_call_count to avoid race conditions.';
