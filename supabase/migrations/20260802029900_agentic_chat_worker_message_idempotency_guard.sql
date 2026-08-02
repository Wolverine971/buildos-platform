-- supabase/migrations/20260802029900_agentic_chat_worker_message_idempotency_guard.sql
-- Agentic Chat Worker migration, Phase 2B Slice 4 precondition: reserve the
-- deterministic worker chat-message idempotency namespace.
--
-- Authenticated users retain direct chat_messages inserts for sessions they
-- own. Worker admission/finalization use predictable chat-turn:<uuid>:user and
-- chat-turn:<uuid>:assistant keys, so those exact keys must be service-owned
-- before the asynchronous execution path exists. Legacy turn:<client-id>:...
-- keys and ordinary authenticated messages remain unchanged.

DO $block$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_messages messages
		WHERE messages.metadata->>'idempotency_key'
			~ '^chat-turn:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(user|assistant)$'
			AND NOT EXISTS (
				SELECT 1
				FROM public.chat_turn_runs turns
				WHERE turns.session_id = messages.session_id
					AND turns.user_id = messages.user_id
					AND messages.metadata->>'idempotency_key' IN (
						'chat-turn:' || turns.id::text || ':user',
						'chat-turn:' || turns.id::text || ':assistant'
					)
					AND (
						(messages.metadata->>'idempotency_key'
							= 'chat-turn:' || turns.id::text || ':user'
							AND turns.user_message_id = messages.id
							AND messages.role = 'user')
						OR
						(messages.metadata->>'idempotency_key'
							= 'chat-turn:' || turns.id::text || ':assistant'
							AND turns.assistant_message_id = messages.id
							AND messages.role = 'assistant')
					)
			)
	) THEN
		RAISE EXCEPTION
			'agentic_chat_message_idempotency_preflight_failed: unowned reserved key exists';
	END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_message_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_request_claims text;
	v_old_key text;
	v_new_key text;
	v_reserved_pattern constant text :=
		'^chat-turn:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(user|assistant)$';
BEGIN
	v_new_key := NEW.metadata->>'idempotency_key';
	IF TG_OP = 'UPDATE' THEN
		v_old_key := OLD.metadata->>'idempotency_key';
	END IF;

	IF COALESCE(v_new_key ~ v_reserved_pattern, false)
		OR COALESCE(v_old_key ~ v_reserved_pattern, false) THEN
		-- Preserve the signed request role through SECURITY DEFINER wrappers.
		v_request_claims := NULLIF(current_setting('request.jwt.claims', true), '');
		v_request_role := COALESCE(
			NULLIF(v_request_claims::jsonb->>'role', ''),
			current_user
		);
		IF v_request_role NOT IN ('service_role', 'postgres', 'supabase_admin')
			AND NOT (
				v_request_claims IS NULL
				AND EXISTS (
					SELECT 1
					FROM pg_roles roles
					WHERE roles.rolname = current_user
						AND roles.rolsuper
				)
			) THEN
			RAISE EXCEPTION 'agentic_chat_message_idempotency_key_reserved'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_message_idempotency_key()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_chat_messages_agentic_chat_idempotency
BEFORE INSERT OR UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_message_idempotency_key();

COMMENT ON FUNCTION public.validate_agentic_chat_message_idempotency_key() IS
	'Reserves exact chat-turn:<uuid>:user/assistant message idempotency keys for trusted worker admission/finalization writes without changing legacy message keys.';
