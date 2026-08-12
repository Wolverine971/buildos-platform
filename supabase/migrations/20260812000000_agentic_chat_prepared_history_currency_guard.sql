-- Agentic Chat Worker Phase 4 P3: prepared-history currency guard.
--
-- Prepared prompts snapshot history while the user is composing. A message can
-- land after that snapshot but before admission; accepting the prepared copy
-- would silently omit it from the immutable worker input. The application
-- prefers admission-window history in that case. This trigger repeats the
-- rule at the artifact insert boundary, after the admission advisory lock, so
-- an inspection/admission race fails closed instead of freezing stale history.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_prepared_history_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_prepared_created_at timestamptz;
BEGIN
	IF NEW.history_source <> 'prepared_prompt' THEN
		RETURN NEW;
	END IF;

	IF NEW.source_prepared_prompt_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_input_prepared_history_lineage_missing';
	END IF;

	SELECT prepared.created_at
	INTO v_prepared_created_at
	FROM public.agentic_chat_prepared_prompts AS prepared
	WHERE prepared.id = NEW.source_prepared_prompt_id
		AND prepared.session_id = NEW.session_id
		AND prepared.user_id = NEW.user_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_input_prepared_history_scope_mismatch';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.chat_messages AS message
		WHERE message.session_id = NEW.session_id
			AND message.user_id = NEW.user_id
			AND message.created_at > v_prepared_created_at
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_prepared_history_stale';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_prepared_history_currency()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_prepared_history_currency
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_prepared_history_currency
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.validate_agentic_chat_prepared_history_currency();

COMMENT ON FUNCTION public.validate_agentic_chat_prepared_history_currency() IS
	'Fails prepared-prompt artifact insertion when a newer persisted session message would be omitted from frozen history.';

COMMIT;
