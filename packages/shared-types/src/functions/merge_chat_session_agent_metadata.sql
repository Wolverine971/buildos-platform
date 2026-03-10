-- packages/shared-types/src/functions/merge_chat_session_agent_metadata.sql
-- Source of truth for the chat session agent metadata merge RPC.

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
