-- supabase/migrations/20260826203546_atomic_cycle_trigger_replacement.sql
-- Atomically replaces the full live trigger set for one Cycle under the same
-- owner and expected-version contract used by the definition commands.
--
-- Existing triggers are tombstoned instead of deleted so already-admitted Runs
-- retain their historical trigger reference. The Cycle row is locked first,
-- matching coordinator admission lock order; a concurrent claim therefore
-- either admits against the old definition before this transaction or loses
-- its cleared/tombstoned claim after this transaction.

CREATE FUNCTION public.replace_cycle_triggers_impl(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer,
	p_triggers jsonb
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle public.cycles%ROWTYPE;
	v_trigger jsonb;
	v_trigger_state text;
	v_trigger_next_run_at timestamptz;
	v_actor_id uuid;
BEGIN
	IF p_user_id IS NULL
		OR p_cycle_id IS NULL
		OR p_expected_version IS NULL
		OR p_expected_version < 1
		OR p_triggers IS NULL
		OR jsonb_typeof(p_triggers) <> 'array'
		OR jsonb_array_length(p_triggers) = 0 THEN
		RAISE EXCEPTION 'cycle_trigger_replace_invalid' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_cycle
	FROM public.cycles cycle_row
	WHERE cycle_row.id = p_cycle_id
		AND cycle_row.user_id = p_user_id
		AND cycle_row.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
	END IF;
	IF v_cycle.version <> p_expected_version THEN
		RAISE EXCEPTION 'cycle_version_conflict'
			USING ERRCODE = 'P0001',
			DETAIL = format('expected_version=%s current_version=%s', p_expected_version, v_cycle.version);
	END IF;

	IF v_cycle.project_id IS NOT NULL AND v_cycle.state = 'active' THEN
		v_actor_id := public.ensure_actor_for_user(p_user_id);
		IF NOT public.actor_has_project_member_access(v_actor_id, v_cycle.project_id, 'write') THEN
			RAISE EXCEPTION 'cycle_project_access_denied' USING ERRCODE = '42501';
		END IF;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_triggers) AS trigger(value)
		WHERE NOT COALESCE(public.cycle_trigger_input_is_valid(trigger.value), false)
	) OR EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_triggers) AS trigger(value)
		GROUP BY trigger.value - 'state' - 'next_run_at'
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'cycle_trigger_invalid' USING ERRCODE = '22023';
	END IF;

	UPDATE public.cycle_triggers trigger_row
	SET state = 'deleted',
		next_run_at = NULL,
		deleted_at = now(),
		version = trigger_row.version + 1,
		scheduler_claim_token = NULL,
		scheduler_claim_expires_at = NULL,
		updated_at = now()
	WHERE trigger_row.cycle_id = p_cycle_id
		AND trigger_row.deleted_at IS NULL;

	FOR v_trigger IN
		SELECT trigger.value
		FROM jsonb_array_elements(p_triggers) AS trigger(value)
	LOOP
		v_trigger_state := COALESCE(v_trigger->>'state', 'active');
		v_trigger_next_run_at := CASE
			WHEN NOT (v_trigger ? 'next_run_at') OR v_trigger->'next_run_at' = 'null'::jsonb THEN NULL
			ELSE (v_trigger->>'next_run_at')::timestamptz
		END;

		INSERT INTO public.cycle_triggers (
			cycle_id,
			trigger_type,
			spec,
			state,
			next_run_at
		) VALUES (
			p_cycle_id,
			v_trigger->>'type',
			v_trigger - 'state' - 'next_run_at',
			v_trigger_state,
			v_trigger_next_run_at
		);
	END LOOP;

	UPDATE public.cycles cycle_row
	SET next_run_at = (
			SELECT min(trigger_row.next_run_at)
			FROM public.cycle_triggers trigger_row
			WHERE trigger_row.cycle_id = cycle_row.id
				AND trigger_row.state = 'active'
				AND trigger_row.deleted_at IS NULL
				AND trigger_row.next_run_at IS NOT NULL
		),
		version = cycle_row.version + 1,
		updated_at = now()
	WHERE cycle_row.id = p_cycle_id
	RETURNING * INTO v_cycle;

	RETURN v_cycle;
END;
$function$;

CREATE FUNCTION public.replace_cycle_triggers(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer,
	p_triggers jsonb
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.replace_cycle_triggers_impl(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		p_triggers
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_cycle_triggers_impl(uuid, uuid, integer, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_cycle_triggers(uuid, uuid, integer, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_cycle_triggers(uuid, uuid, integer, jsonb)
	TO service_role;

COMMENT ON FUNCTION public.replace_cycle_triggers_impl(uuid, uuid, integer, jsonb) IS
	'Internal atomic Cycle trigger-set replacement under owner and Cycle-version guards.';
COMMENT ON FUNCTION public.replace_cycle_triggers(uuid, uuid, integer, jsonb) IS
	'Privileged atomic Cycle trigger-set replacement. Service role only.';
