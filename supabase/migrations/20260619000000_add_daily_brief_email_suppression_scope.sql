-- supabase/migrations/20260619000000_add_daily_brief_email_suppression_scope.sql
--
-- Daily brief emails are recurring product lifecycle nudges, but users should
-- be able to turn them off without suppressing unrelated lifecycle emails such
-- as onboarding or account activation messages.

BEGIN;

ALTER TABLE public.email_suppressions
	DROP CONSTRAINT IF EXISTS email_suppressions_scope_check;

ALTER TABLE public.email_suppressions
	ADD CONSTRAINT email_suppressions_scope_check
	CHECK (scope IN ('lifecycle', 'marketing', 'daily_brief', 'all'));

COMMENT ON COLUMN public.email_suppressions.scope IS
	'lifecycle | marketing | daily_brief | all. daily_brief is scoped to recurring BuildOS brief emails only.';

CREATE OR REPLACE FUNCTION public.upsert_email_suppression(
	p_email TEXT,
	p_scope TEXT,
	p_reason TEXT,
	p_source TEXT,
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_email TEXT;
	v_existing_id UUID;
	v_existing_scope TEXT;
	v_existing_metadata JSONB;
	v_new_scope TEXT;
BEGIN
	IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
		RAISE EXCEPTION 'email must not be empty';
	END IF;

	v_email := lower(trim(p_email));

	IF p_scope NOT IN ('lifecycle', 'marketing', 'daily_brief', 'all') THEN
		RAISE EXCEPTION 'scope must be lifecycle, marketing, daily_brief, or all; got %', p_scope;
	END IF;

	IF p_reason NOT IN ('unsubscribe', 'hard_bounce', 'manual', 'complaint') THEN
		RAISE EXCEPTION 'reason must be unsubscribe, hard_bounce, manual, or complaint; got %', p_reason;
	END IF;

	IF p_source NOT IN ('email_link', 'admin', 'provider_webhook', 'list_header') THEN
		RAISE EXCEPTION 'source must be email_link, admin, provider_webhook, or list_header; got %', p_source;
	END IF;

	SELECT id, scope, metadata
	  INTO v_existing_id, v_existing_scope, v_existing_metadata
	  FROM public.email_suppressions
	 WHERE email = v_email;

	IF v_existing_id IS NULL THEN
		INSERT INTO public.email_suppressions (email, scope, reason, source, metadata)
		VALUES (v_email, p_scope, p_reason, p_source, COALESCE(p_metadata, '{}'::jsonb))
		RETURNING id INTO v_existing_id;

		RETURN v_existing_id;
	END IF;

	v_new_scope := CASE
		WHEN v_existing_scope = 'all' THEN 'all'
		WHEN p_scope = 'all' THEN 'all'
		WHEN v_existing_scope = p_scope THEN v_existing_scope
		ELSE 'all'
	END;

	UPDATE public.email_suppressions
	   SET scope = v_new_scope,
	       reason = p_reason,
	       source = p_source,
	       metadata = COALESCE(v_existing_metadata, '{}'::jsonb)
	                || COALESCE(p_metadata, '{}'::jsonb),
	       updated_at = NOW()
	 WHERE id = v_existing_id;

	RETURN v_existing_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_email_suppression IS
	'Idempotent suppression write. Normalizes email, validates enums, escalates scope on conflict, merges metadata. Supports daily_brief scoped opt-outs.';

CREATE OR REPLACE FUNCTION public.is_email_suppressed(
	p_email TEXT,
	p_scope TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
	SELECT EXISTS (
		SELECT 1
		  FROM public.email_suppressions
		 WHERE email = lower(trim(p_email))
		   AND (scope = p_scope OR scope = 'all')
	);
$$;

COMMENT ON FUNCTION public.is_email_suppressed IS
	'Returns TRUE if the email is suppressed for the given scope. Checks scope = p_scope OR scope=''all''.';

COMMIT;
