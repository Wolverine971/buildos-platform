-- supabase/migrations/20260826011409_cycle_due_trigger_coordinator.sql
-- Lease due Cycle triggers in short, non-blocking transactions. Application
-- code materializes kind-specific execution input after the claim, then uses a
-- second atomic command to admit the immutable Run and advance the schedule.

ALTER TABLE public.cycle_triggers
	ADD COLUMN scheduler_claim_token uuid,
	ADD COLUMN scheduler_claim_expires_at timestamptz;

ALTER TABLE public.cycle_triggers
	ADD CONSTRAINT cycle_triggers_scheduler_claim_shape CHECK (
		(scheduler_claim_token IS NULL AND scheduler_claim_expires_at IS NULL)
		OR (scheduler_claim_token IS NOT NULL AND scheduler_claim_expires_at IS NOT NULL)
	);

CREATE FUNCTION public.claim_due_cycle_triggers(
	p_claim_token uuid,
	p_due_through timestamptz DEFAULT now(),
	p_limit integer DEFAULT 25,
	p_lease_seconds integer DEFAULT 120,
	p_kinds text[] DEFAULT ARRAY['daily_brief']::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_claims jsonb;
BEGIN
	PERFORM public.require_cycle_service_role();

	IF p_claim_token IS NULL
		OR p_due_through IS NULL
		OR p_limit < 1 OR p_limit > 100
		OR p_lease_seconds < 30 OR p_lease_seconds > 900
		OR COALESCE(cardinality(p_kinds), 0) = 0
		OR NOT p_kinds <@ ARRAY[
			'daily_brief', 'project_audit', 'project_review', 'task_review'
		]::text[] THEN
		RAISE EXCEPTION 'cycle_trigger_claim_invalid' USING ERRCODE = '22023';
	END IF;

	WITH due AS (
		SELECT
			trigger_row.id,
			trigger_row.cycle_id,
			trigger_row.next_run_at AS scheduled_for,
			trigger_row.spec,
			cycle_row.user_id,
			cycle_row.kind,
			cycle_row.policy
		FROM public.cycle_triggers trigger_row
		JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
		WHERE trigger_row.trigger_type = 'schedule'
			AND trigger_row.state = 'active'
			AND trigger_row.deleted_at IS NULL
			AND trigger_row.next_run_at IS NOT NULL
			AND trigger_row.next_run_at <= p_due_through
			AND (
				trigger_row.scheduler_claim_expires_at IS NULL
				OR trigger_row.scheduler_claim_expires_at <= now()
			)
			AND cycle_row.state = 'active'
			AND cycle_row.deleted_at IS NULL
			AND cycle_row.kind = ANY(p_kinds)
		ORDER BY trigger_row.next_run_at, trigger_row.id
		FOR UPDATE OF trigger_row SKIP LOCKED
		LIMIT p_limit
	), claimed AS (
		UPDATE public.cycle_triggers trigger_row
		SET scheduler_claim_token = p_claim_token,
			scheduler_claim_expires_at = now() + make_interval(secs => p_lease_seconds)
		FROM due
		WHERE trigger_row.id = due.id
		RETURNING
			trigger_row.id AS trigger_id,
			due.cycle_id,
			due.user_id,
			due.kind,
			due.policy,
			due.scheduled_for,
			due.spec,
			trigger_row.scheduler_claim_token AS claim_token,
			trigger_row.scheduler_claim_expires_at AS claim_expires_at
	)
	SELECT COALESCE(
		jsonb_agg(
			jsonb_build_object(
				'trigger_id', claimed.trigger_id,
				'cycle_id', claimed.cycle_id,
				'user_id', claimed.user_id,
				'kind', claimed.kind,
				'policy', claimed.policy,
				'scheduled_for', claimed.scheduled_for,
				'spec', claimed.spec,
				'claim_token', claimed.claim_token,
				'claim_expires_at', claimed.claim_expires_at
			)
			ORDER BY claimed.scheduled_for, claimed.trigger_id
		),
		'[]'::jsonb
	)
	INTO v_claims
	FROM claimed;

	RETURN v_claims;
END;
$function$;

CREATE FUNCTION public.admit_claimed_cycle_trigger(
	p_trigger_id uuid,
	p_claim_token uuid,
	p_execution_input jsonb,
	p_delivery_intent jsonb,
	p_next_trigger_at timestamptz,
	p_triggered_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle_id uuid;
	v_trigger public.cycle_triggers%ROWTYPE;
	v_occurrence_key text;
	v_result jsonb;
BEGIN
	PERFORM public.require_cycle_service_role();

	IF p_trigger_id IS NULL OR p_claim_token IS NULL OR p_next_trigger_at IS NULL THEN
		RAISE EXCEPTION 'cycle_trigger_admission_invalid' USING ERRCODE = '22023';
	END IF;

	-- Match the lock order used by admit_cycle_run: Cycle first, Trigger second.
	SELECT trigger_row.cycle_id
	INTO v_cycle_id
	FROM public.cycle_triggers trigger_row
	WHERE trigger_row.id = p_trigger_id
		AND trigger_row.scheduler_claim_token = p_claim_token;

	IF v_cycle_id IS NULL THEN
		RAISE EXCEPTION 'cycle_trigger_claim_lost' USING ERRCODE = '55000';
	END IF;

	PERFORM 1
	FROM public.cycles cycle_row
	WHERE cycle_row.id = v_cycle_id
	FOR UPDATE;

	SELECT * INTO v_trigger
	FROM public.cycle_triggers trigger_row
	WHERE trigger_row.id = p_trigger_id
		AND trigger_row.cycle_id = v_cycle_id
		AND trigger_row.trigger_type = 'schedule'
		AND trigger_row.state = 'active'
		AND trigger_row.next_run_at IS NOT NULL
		AND trigger_row.scheduler_claim_token = p_claim_token
		AND trigger_row.scheduler_claim_expires_at > now()
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_trigger_claim_lost' USING ERRCODE = '55000';
	END IF;
	IF p_next_trigger_at <= v_trigger.next_run_at THEN
		RAISE EXCEPTION 'cycle_next_trigger_invalid' USING ERRCODE = '22023';
	END IF;

	v_occurrence_key := format(
		'scheduled:%s:%s',
		v_trigger.id,
		to_char(
			v_trigger.next_run_at AT TIME ZONE 'UTC',
			'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
		)
	);

	v_result := public.admit_cycle_run(
		v_trigger.cycle_id,
		'schedule',
		v_occurrence_key,
		p_execution_input,
		p_delivery_intent,
		v_trigger.id,
		p_triggered_at,
		v_trigger.next_run_at,
		p_next_trigger_at
	);

	UPDATE public.cycle_triggers
	SET scheduler_claim_token = NULL,
		scheduler_claim_expires_at = NULL
	WHERE id = v_trigger.id
		AND scheduler_claim_token = p_claim_token;

	RETURN v_result;
END;
$function$;

CREATE FUNCTION public.release_cycle_trigger_claim(
	p_trigger_id uuid,
	p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_released boolean;
BEGIN
	PERFORM public.require_cycle_service_role();

	UPDATE public.cycle_triggers
	SET scheduler_claim_token = NULL,
		scheduler_claim_expires_at = NULL
	WHERE id = p_trigger_id
		AND scheduler_claim_token = p_claim_token
	RETURNING true INTO v_released;

	RETURN COALESCE(v_released, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_due_cycle_triggers(uuid, timestamptz, integer, integer, text[])
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admit_claimed_cycle_trigger(uuid, uuid, jsonb, jsonb, timestamptz, timestamptz)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_cycle_trigger_claim(uuid, uuid)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_due_cycle_triggers(uuid, timestamptz, integer, integer, text[])
	TO service_role;
GRANT EXECUTE ON FUNCTION public.admit_claimed_cycle_trigger(uuid, uuid, jsonb, jsonb, timestamptz, timestamptz)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cycle_trigger_claim(uuid, uuid)
	TO service_role;

COMMENT ON FUNCTION public.claim_due_cycle_triggers(uuid, timestamptz, integer, integer, text[]) IS
	'Atomically leases due Cycle schedule triggers with SKIP LOCKED for parallel coordinators.';
COMMENT ON FUNCTION public.admit_claimed_cycle_trigger(uuid, uuid, jsonb, jsonb, timestamptz, timestamptz) IS
	'Validates a scheduler lease, admits one immutable Cycle Run, and advances the trigger atomically.';
