-- supabase/migrations/20260826010526_harden_cycle_service_role_wrappers.sql
-- Forward-only hardening for Cycle SECURITY DEFINER RPCs that were already
-- deployed in migrations 20260825211343 and 20260825211344.
--
-- Keep the deployed implementations intact under private implementation names
-- and put a claim-checking wrapper at every original RPC signature. This avoids
-- rewriting large, proven function bodies while ensuring a future accidental
-- EXECUTE grant cannot turn p_user_id into an owner-impersonation path.

CREATE OR REPLACE FUNCTION public.require_cycle_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
	v_claims jsonb;
	v_claimed_role text;
BEGIN
	BEGIN
		v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION 'cycle_service_role_required' USING ERRCODE = '42501';
	END;

	v_claimed_role := COALESCE(
		v_claims->>'role',
		NULLIF(current_setting('request.jwt.claim.role', true), '')
	);

	IF v_claimed_role = 'service_role' THEN
		RETURN;
	END IF;

	-- Direct migration/owner sessions do not carry PostgREST claims. In a
	-- SECURITY DEFINER call through PostgREST, session_user is the authenticator
	-- while current_user is the function owner, so they differ.
	IF v_claimed_role IS NULL AND session_user = current_user THEN
		RETURN;
	END IF;

	RAISE EXCEPTION 'cycle_service_role_required' USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION public.admit_cycle_run(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)
	RENAME TO admit_cycle_run_impl;
ALTER FUNCTION public.claim_cycle_run(uuid, uuid, uuid)
	RENAME TO claim_cycle_run_impl;
ALTER FUNCTION public.complete_cycle_run(uuid, uuid, jsonb, jsonb)
	RENAME TO complete_cycle_run_impl;
ALTER FUNCTION public.fail_cycle_run(uuid, uuid, text, text, boolean)
	RENAME TO fail_cycle_run_impl;
ALTER FUNCTION public.create_cycle(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text)
	RENAME TO create_cycle_impl;
ALTER FUNCTION public.update_cycle(uuid, uuid, integer, jsonb)
	RENAME TO update_cycle_impl;
ALTER FUNCTION public.pause_cycle(uuid, uuid, integer)
	RENAME TO pause_cycle_impl;
ALTER FUNCTION public.resume_cycle(uuid, uuid, integer)
	RENAME TO resume_cycle_impl;
ALTER FUNCTION public.delete_cycle(uuid, uuid, integer)
	RENAME TO delete_cycle_impl;
ALTER FUNCTION public.admit_manual_cycle_run(uuid, uuid, text, jsonb, jsonb)
	RENAME TO admit_manual_cycle_run_impl;

CREATE FUNCTION public.admit_cycle_run(
	p_cycle_id uuid,
	p_trigger text,
	p_occurrence_key text,
	p_execution_input jsonb,
	p_delivery_intent jsonb,
	p_trigger_id uuid DEFAULT NULL,
	p_triggered_at timestamptz DEFAULT now(),
	p_scheduled_for timestamptz DEFAULT NULL,
	p_next_trigger_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.admit_cycle_run_impl(
		p_cycle_id,
		p_trigger,
		p_occurrence_key,
		p_execution_input,
		p_delivery_intent,
		p_trigger_id,
		p_triggered_at,
		p_scheduled_for,
		p_next_trigger_at
	);
END;
$function$;

CREATE FUNCTION public.claim_cycle_run(
	p_cycle_run_id uuid,
	p_queue_job_record_id uuid,
	p_processing_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.claim_cycle_run_impl(
		p_cycle_run_id,
		p_queue_job_record_id,
		p_processing_token
	);
END;
$function$;

CREATE FUNCTION public.complete_cycle_run(
	p_cycle_run_id uuid,
	p_processing_token uuid,
	p_outcome jsonb,
	p_result jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.complete_cycle_run_impl(
		p_cycle_run_id,
		p_processing_token,
		p_outcome,
		p_result
	);
END;
$function$;

CREATE FUNCTION public.fail_cycle_run(
	p_cycle_run_id uuid,
	p_processing_token uuid,
	p_error_code text,
	p_error_message text,
	p_terminal boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.fail_cycle_run_impl(
		p_cycle_run_id,
		p_processing_token,
		p_error_code,
		p_error_message,
		p_terminal
	);
END;
$function$;

CREATE FUNCTION public.create_cycle(
	p_user_id uuid,
	p_request_id text,
	p_label text,
	p_kind text,
	p_target_type text,
	p_project_id uuid,
	p_config jsonb,
	p_triggers jsonb,
	p_policy jsonb DEFAULT '{"overlap":"skip","misfire":"run_once","max_attempts":3}'::jsonb,
	p_attention_policy text DEFAULT 'exceptions',
	p_state text DEFAULT 'active'
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.create_cycle_impl(
		p_user_id,
		p_request_id,
		p_label,
		p_kind,
		p_target_type,
		p_project_id,
		p_config,
		p_triggers,
		p_policy,
		p_attention_policy,
		p_state
	);
END;
$function$;

CREATE FUNCTION public.update_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer,
	p_patch jsonb
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.update_cycle_impl(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		p_patch
	);
END;
$function$;

CREATE FUNCTION public.pause_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.pause_cycle_impl(p_user_id, p_cycle_id, p_expected_version);
END;
$function$;

CREATE FUNCTION public.resume_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.resume_cycle_impl(p_user_id, p_cycle_id, p_expected_version);
END;
$function$;

CREATE FUNCTION public.delete_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.delete_cycle_impl(p_user_id, p_cycle_id, p_expected_version);
END;
$function$;

CREATE FUNCTION public.admit_manual_cycle_run(
	p_user_id uuid,
	p_cycle_id uuid,
	p_request_id text,
	p_execution_input jsonb,
	p_delivery_intent jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.admit_manual_cycle_run_impl(
		p_user_id,
		p_cycle_id,
		p_request_id,
		p_execution_input,
		p_delivery_intent
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.require_cycle_service_role()
	FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admit_cycle_run_impl(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_cycle_run_impl(uuid, uuid, uuid)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_cycle_run_impl(uuid, uuid, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_cycle_run_impl(uuid, uuid, text, text, boolean)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_cycle_impl(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_cycle_impl(uuid, uuid, integer, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pause_cycle_impl(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resume_cycle_impl(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_cycle_impl(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admit_manual_cycle_run_impl(uuid, uuid, text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admit_cycle_run(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_cycle_run(uuid, uuid, uuid)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_cycle_run(uuid, uuid, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_cycle_run(uuid, uuid, text, text, boolean)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_cycle(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_cycle(uuid, uuid, integer, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pause_cycle(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resume_cycle(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_cycle(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admit_manual_cycle_run(uuid, uuid, text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admit_cycle_run(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_cycle_run(uuid, uuid, uuid)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_cycle_run(uuid, uuid, jsonb, jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_cycle_run(uuid, uuid, text, text, boolean)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.create_cycle(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.update_cycle(uuid, uuid, integer, jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.pause_cycle(uuid, uuid, integer)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_cycle(uuid, uuid, integer)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_cycle(uuid, uuid, integer)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.admit_manual_cycle_run(uuid, uuid, text, jsonb, jsonb)
	TO service_role;

COMMENT ON FUNCTION public.require_cycle_service_role() IS
	'Defense-in-depth assertion for privileged Cycle RPC wrappers.';
COMMENT ON FUNCTION public.admit_cycle_run(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz) IS
	'Privileged wrapper for atomic Cycle occurrence admission.';
COMMENT ON FUNCTION public.create_cycle(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text) IS
	'Privileged wrapper for idempotent Cycle definition creation.';
