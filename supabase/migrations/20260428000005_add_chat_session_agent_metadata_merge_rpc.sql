-- supabase/migrations/20260428000005_add_chat_session_agent_metadata_merge_rpc.sql
-- Add an atomic RPC for shallow-merging chat_sessions.agent_metadata patches.

CREATE OR REPLACE FUNCTION public.merge_chat_session_agent_metadata(
	p_session_id uuid,
	p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public'
AS $function$
	UPDATE chat_sessions
	SET
		agent_metadata = COALESCE(agent_metadata, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
		updated_at = NOW()
	WHERE id = p_session_id
	RETURNING agent_metadata;
$function$;

GRANT EXECUTE ON FUNCTION public.merge_chat_session_agent_metadata(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_chat_session_agent_metadata(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.merge_chat_session_agent_metadata(uuid, jsonb) IS
'Atomically shallow-merge a JSONB patch into chat_sessions.agent_metadata and return the updated document.';
