-- supabase/migrations/20260826013205_add_cycle_misfire_skip_resolution.sql
-- Resolve a missed scheduled occurrence without queueing domain work. The
-- skipped Cycle Run preserves history while trigger advancement, claim release,
-- and the parent next-run projection remain atomic.

CREATE FUNCTION public.skip_claimed_cycle_trigger(
	p_trigger_id uuid,
	p_claim_token uuid,
	p_execution_input jsonb,
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
	v_cycle public.cycles%ROWTYPE;
	v_trigger public.cycle_triggers%ROWTYPE;
	v_run public.cycle_runs%ROWTYPE;
	v_occurrence_key text;
	v_idempotency_key text;
BEGIN
	PERFORM public.require_cycle_service_role();

	IF p_trigger_id IS NULL
		OR p_claim_token IS NULL
		OR p_next_trigger_at IS NULL
		OR p_triggered_at IS NULL
		OR jsonb_typeof(p_execution_input) <> 'object' THEN
		RAISE EXCEPTION 'cycle_trigger_skip_invalid' USING ERRCODE = '22023';
	END IF;

	SELECT trigger_row.cycle_id
	INTO v_cycle_id
	FROM public.cycle_triggers trigger_row
	WHERE trigger_row.id = p_trigger_id
		AND trigger_row.scheduler_claim_token = p_claim_token;

	IF v_cycle_id IS NULL THEN
		RAISE EXCEPTION 'cycle_trigger_claim_lost' USING ERRCODE = '55000';
	END IF;

	-- Keep the same Cycle -> Trigger lock order as normal claimed admission.
	SELECT * INTO v_cycle
	FROM public.cycles cycle_row
	WHERE cycle_row.id = v_cycle_id
		AND cycle_row.state = 'active'
		AND cycle_row.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_not_active' USING ERRCODE = '55000';
	END IF;
	IF v_cycle.policy->>'misfire' <> 'skip' THEN
		RAISE EXCEPTION 'cycle_misfire_policy_mismatch' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_trigger
	FROM public.cycle_triggers trigger_row
	WHERE trigger_row.id = p_trigger_id
		AND trigger_row.cycle_id = v_cycle.id
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
	v_idempotency_key := v_cycle.id::text || ':' || v_occurrence_key;

	INSERT INTO public.cycle_runs (
		cycle_id, cycle_version, user_id, project_id, kind,
		trigger, trigger_id, status, triggered_at, scheduled_for,
		occurrence_key, idempotency_key, definition_snapshot,
		trigger_snapshot, execution_input, delivery_intent,
		outcome, result, finished_at
	) VALUES (
		v_cycle.id, v_cycle.version, v_cycle.user_id, v_cycle.project_id, v_cycle.kind,
		'schedule', v_trigger.id, 'skipped', p_triggered_at, v_trigger.next_run_at,
		v_occurrence_key, v_idempotency_key,
		jsonb_build_object(
			'kind', v_cycle.kind,
			'version', v_cycle.version,
			'target', jsonb_build_object('type', v_cycle.target_type, 'project_id', v_cycle.project_id),
			'config', v_cycle.config,
			'policy', v_cycle.policy,
			'attention_policy', v_cycle.attention_policy
		),
		v_trigger.spec,
		p_execution_input,
		jsonb_build_object('mode', 'suppress', 'reason', 'misfire_policy_skip'),
		jsonb_build_object(
			'status', 'no_change',
			'attention_level', 'none',
			'summary', 'Skipped missed occurrence according to the Cycle misfire policy.',
			'artifact_refs', jsonb_build_array()
		),
		jsonb_build_object('skip_reason', 'misfire_policy'),
		now()
	)
	RETURNING * INTO v_run;

	UPDATE public.cycle_triggers
	SET last_fired_at = p_triggered_at,
		next_run_at = p_next_trigger_at,
		version = version + 1,
		scheduler_claim_token = NULL,
		scheduler_claim_expires_at = NULL,
		updated_at = now()
	WHERE id = v_trigger.id
		AND scheduler_claim_token = p_claim_token;

	UPDATE public.cycles cycle_row
	SET next_run_at = (
			SELECT min(trigger_row.next_run_at)
			FROM public.cycle_triggers trigger_row
			WHERE trigger_row.cycle_id = cycle_row.id
				AND trigger_row.state = 'active'
				AND trigger_row.next_run_at IS NOT NULL
		),
		updated_at = now()
	WHERE cycle_row.id = v_cycle.id;

	RETURN jsonb_build_object(
		'disposition', 'skipped_misfire',
		'cycle_run_id', v_run.id,
		'queue_job_record_id', NULL,
		'queue_job_id', NULL
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.skip_claimed_cycle_trigger(uuid, uuid, jsonb, timestamptz, timestamptz)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_claimed_cycle_trigger(uuid, uuid, jsonb, timestamptz, timestamptz)
	TO service_role;

COMMENT ON FUNCTION public.skip_claimed_cycle_trigger(uuid, uuid, jsonb, timestamptz, timestamptz) IS
	'Atomically records and advances a leased scheduled occurrence skipped by its Cycle misfire policy.';
