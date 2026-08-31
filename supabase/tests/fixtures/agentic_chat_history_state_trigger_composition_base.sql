-- supabase/tests/fixtures/agentic_chat_history_state_trigger_composition_base.sql
-- Minimal post-20260830213000 schema for the prepared-history trigger
-- composition contract.

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.chat_messages (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	role text NOT NULL,
	content text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agentic_chat_prepared_prompts (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	history_cutoff_at timestamptz,
	history_for_model jsonb NOT NULL DEFAULT '[]'::jsonb,
	history_strategy text,
	history_compressed boolean,
	raw_history_count integer,
	history_for_model_count integer,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_turn_runs (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	history_strategy text,
	history_compressed boolean,
	raw_history_count integer,
	history_for_model_count integer
);

CREATE TABLE public.chat_turn_input_artifacts (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id),
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	source_prepared_prompt_id uuid,
	history_source text NOT NULL,
	history jsonb NOT NULL,
	prepared jsonb NOT NULL
);

CREATE FUNCTION public.agentic_chat_frozen_attachments_v1_are_valid(
	p_attachments jsonb,
	p_require_resolution boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_typeof(p_attachments) = 'array'
$$;

CREATE FUNCTION public.agentic_chat_normalize_frozen_attachment_v1(
	p_attachment jsonb,
	p_display_order bigint,
	p_include_resolution boolean
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT p_attachment || jsonb_build_object('display_order', p_display_order)
$$;

-- Reproduce the lease-only body installed by migration 20260830213000.
CREATE FUNCTION public.validate_agentic_chat_prepared_history_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_history_cutoff_at timestamptz;
BEGIN
	IF NEW.history_source <> 'prepared_prompt' THEN
		RETURN NEW;
	END IF;

	SELECT COALESCE(prepared.history_cutoff_at, prepared.created_at)
	INTO v_history_cutoff_at
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
			AND message.created_at > v_history_cutoff_at
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_prepared_history_stale';
	END IF;

	RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chat_turn_input_artifacts_prepared_history_currency
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.validate_agentic_chat_prepared_history_currency();

