-- Cycles v0 command surface
--
-- Keep mutation authority behind narrow, atomic RPCs. Client-facing servers
-- derive p_user_id from the authenticated session; direct table mutation stays
-- unavailable to authenticated clients.

CREATE OR REPLACE FUNCTION public.cycle_definition_payload_is_valid(
	p_kind text,
	p_target_type text,
	p_project_id uuid,
	p_config jsonb,
	p_policy jsonb,
	p_attention_policy text,
	p_state text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF p_kind IS NULL
		OR p_target_type IS NULL
		OR p_config IS NULL
		OR p_policy IS NULL
		OR p_attention_policy IS NULL
		OR p_state IS NULL
		OR p_kind NOT IN ('daily_brief', 'project_audit', 'project_review', 'task_review')
		OR jsonb_typeof(p_config) <> 'object'
		OR jsonb_typeof(p_policy) <> 'object'
		OR p_attention_policy NOT IN ('silent', 'exceptions', 'always')
		OR p_state NOT IN ('active', 'paused')
		OR (
			(p_target_type = 'user' AND p_project_id IS NOT NULL)
			OR (p_target_type = 'project' AND p_project_id IS NULL)
			OR p_target_type NOT IN ('user', 'project')
		)
		OR (p_kind = 'daily_brief' AND p_target_type <> 'user')
		OR (p_kind IN ('project_audit', 'project_review') AND p_target_type <> 'project')
		OR COALESCE(p_policy->>'overlap', '') NOT IN ('skip', 'allow')
		OR COALESCE(p_policy->>'misfire', '') NOT IN ('skip', 'run_once')
		OR jsonb_typeof(p_policy->'max_attempts') <> 'number'
		OR COALESCE(p_policy->>'max_attempts', '') !~ '^[0-9]+$'
		OR (p_policy->>'max_attempts')::integer NOT BETWEEN 1 AND 10
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(p_policy) AS policy_key(key)
			WHERE policy_key.key NOT IN ('overlap', 'misfire', 'max_attempts')
		) THEN
		RETURN false;
	END IF;

	IF p_kind = 'project_audit' THEN
		RETURN COALESCE(p_config->>'depth', '') IN ('standard', 'deep')
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_object_keys(p_config) AS config_key(key)
				WHERE config_key.key <> 'depth'
			);
	END IF;

	RETURN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_config));
END;
$function$;

CREATE OR REPLACE FUNCTION public.cycle_trigger_input_is_valid(p_trigger jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_type text;
	v_state text;
	v_schedule jsonb;
	v_schedule_type text;
	v_next_run_at timestamptz;
	v_anchor_at timestamptz;
	v_element_count integer;
	v_distinct_count integer;
BEGIN
	IF jsonb_typeof(p_trigger) <> 'object' THEN
		RETURN false;
	END IF;

	v_type := p_trigger->>'type';
	v_state := COALESCE(p_trigger->>'state', 'active');
	IF v_type IS NULL
		OR v_type NOT IN ('schedule', 'event', 'threshold', 'relative')
		OR v_state NOT IN ('active', 'paused') THEN
		RETURN false;
	END IF;

	IF p_trigger ? 'next_run_at' AND p_trigger->'next_run_at' <> 'null'::jsonb THEN
		IF jsonb_typeof(p_trigger->'next_run_at') <> 'string' THEN
			RETURN false;
		END IF;
		BEGIN
			v_next_run_at := (p_trigger->>'next_run_at')::timestamptz;
		EXCEPTION WHEN OTHERS THEN
			RETURN false;
		END;
	END IF;

	IF v_state = 'paused' AND v_next_run_at IS NOT NULL THEN
		RETURN false;
	END IF;

	IF v_type = 'schedule' THEN
		IF EXISTS (
			SELECT 1 FROM jsonb_object_keys(p_trigger) AS trigger_key(key)
			WHERE trigger_key.key NOT IN ('type', 'schedule', 'state', 'next_run_at')
		) THEN
			RETURN false;
		END IF;

		v_schedule := p_trigger->'schedule';
		v_schedule_type := v_schedule->>'type';
		IF jsonb_typeof(v_schedule) <> 'object'
			OR v_schedule_type NOT IN ('daily', 'weekly', 'interval')
			OR (v_state = 'active' AND v_next_run_at IS NULL) THEN
			RETURN false;
		END IF;

		IF v_schedule_type IN ('daily', 'weekly') THEN
			IF COALESCE(v_schedule->>'time_of_day', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$'
				OR NOT EXISTS (
					SELECT 1 FROM pg_catalog.pg_timezone_names
					WHERE name = v_schedule->>'timezone'
				) THEN
				RETURN false;
			END IF;
		END IF;

		IF v_schedule_type = 'daily' THEN
			RETURN NOT EXISTS (
				SELECT 1 FROM jsonb_object_keys(v_schedule) AS schedule_key(key)
				WHERE schedule_key.key NOT IN ('type', 'time_of_day', 'timezone')
			);
		END IF;

		IF v_schedule_type = 'weekly' THEN
			IF jsonb_typeof(v_schedule->'days_of_week') <> 'array'
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(v_schedule->'days_of_week') AS weekday(value)
					WHERE jsonb_typeof(weekday.value) <> 'number'
						OR weekday.value::text !~ '^[0-6]$'
				) THEN
				RETURN false;
			END IF;

			SELECT count(*), count(DISTINCT weekday.value)
			INTO v_element_count, v_distinct_count
			FROM jsonb_array_elements(v_schedule->'days_of_week') AS weekday(value);

			RETURN v_element_count > 0
				AND v_element_count = v_distinct_count
				AND NOT EXISTS (
					SELECT 1 FROM jsonb_object_keys(v_schedule) AS schedule_key(key)
					WHERE schedule_key.key NOT IN ('type', 'days_of_week', 'time_of_day', 'timezone')
				);
		END IF;

		IF jsonb_typeof(v_schedule->'every_minutes') <> 'number'
			OR COALESCE(v_schedule->>'every_minutes', '') !~ '^[0-9]+$'
			OR (v_schedule->>'every_minutes')::integer < 5
			OR jsonb_typeof(v_schedule->'anchor_at') <> 'string' THEN
			RETURN false;
		END IF;
		BEGIN
			v_anchor_at := (v_schedule->>'anchor_at')::timestamptz;
		EXCEPTION WHEN OTHERS THEN
			RETURN false;
		END;
		RETURN v_anchor_at IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM jsonb_object_keys(v_schedule) AS schedule_key(key)
				WHERE schedule_key.key NOT IN ('type', 'every_minutes', 'anchor_at')
			);
	END IF;

	IF v_type IN ('event', 'threshold') AND v_next_run_at IS NOT NULL THEN
		RETURN false;
	END IF;

	IF v_type = 'event' THEN
		IF EXISTS (
			SELECT 1 FROM jsonb_object_keys(p_trigger) AS trigger_key(key)
			WHERE trigger_key.key NOT IN ('type', 'event_types', 'debounce_minutes', 'state', 'next_run_at')
		) OR jsonb_typeof(p_trigger->'event_types') <> 'array'
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(p_trigger->'event_types') AS event_type(value)
				WHERE jsonb_typeof(event_type.value) <> 'string'
					OR btrim(event_type.value #>> '{}') = ''
			) THEN
			RETURN false;
		END IF;

		SELECT count(*), count(DISTINCT btrim(event_type.value))
		INTO v_element_count, v_distinct_count
		FROM jsonb_array_elements_text(p_trigger->'event_types') AS event_type(value);

		RETURN v_element_count > 0
			AND v_element_count = v_distinct_count
			AND (
				NOT (p_trigger ? 'debounce_minutes')
				OR (
					jsonb_typeof(p_trigger->'debounce_minutes') = 'number'
					AND p_trigger->>'debounce_minutes' ~ '^[0-9]+$'
				)
			);
	END IF;

	IF v_type = 'threshold' THEN
		RETURN NOT EXISTS (
				SELECT 1 FROM jsonb_object_keys(p_trigger) AS trigger_key(key)
				WHERE trigger_key.key NOT IN (
					'type', 'metric', 'operator', 'value', 'evaluation_window_minutes', 'state', 'next_run_at'
				)
			)
			AND btrim(COALESCE(p_trigger->>'metric', '')) <> ''
			AND p_trigger->>'operator' IN ('gte', 'lte')
			AND jsonb_typeof(p_trigger->'value') = 'number'
			AND (
				NOT (p_trigger ? 'evaluation_window_minutes')
				OR (
					jsonb_typeof(p_trigger->'evaluation_window_minutes') = 'number'
					AND p_trigger->>'evaluation_window_minutes' ~ '^[0-9]+$'
					AND (p_trigger->>'evaluation_window_minutes')::integer >= 5
				)
			);
	END IF;

	RETURN COALESCE(NOT EXISTS (
			SELECT 1 FROM jsonb_object_keys(p_trigger) AS trigger_key(key)
			WHERE trigger_key.key NOT IN ('type', 'relative_to', 'offset_minutes', 'state', 'next_run_at')
		)
		AND p_trigger->>'relative_to' IN ('calendar_event', 'milestone', 'deadline')
		AND jsonb_typeof(p_trigger->'offset_minutes') = 'number'
		AND p_trigger->>'offset_minutes' ~ '^-?[0-9]+$', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_cycle(
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
DECLARE
	v_cycle public.cycles%ROWTYPE;
	v_trigger jsonb;
	v_trigger_state text;
	v_trigger_next_run_at timestamptz;
	v_constraint_name text;
	v_actor_id uuid;
	v_request_fingerprint text;
	v_intent_triggers jsonb;
BEGIN
	IF p_user_id IS NULL
		OR btrim(COALESCE(p_request_id, '')) = ''
		OR char_length(btrim(COALESCE(p_label, ''))) NOT BETWEEN 1 AND 100
		OR p_triggers IS NULL
		OR jsonb_typeof(p_triggers) <> 'array'
		OR jsonb_array_length(p_triggers) = 0
		OR NOT COALESCE(public.cycle_definition_payload_is_valid(
			p_kind, p_target_type, p_project_id, p_config, p_policy, p_attention_policy, p_state
		), false) THEN
		RAISE EXCEPTION 'cycle_create_invalid' USING ERRCODE = '22023';
	END IF;

	SELECT COALESCE(jsonb_agg(normalized.trigger ORDER BY normalized.trigger::text), '[]'::jsonb)
	INTO v_intent_triggers
	FROM (
		SELECT
			(trigger.value - 'next_run_at' - 'state')
				|| jsonb_build_object('state', COALESCE(trigger.value->>'state', 'active')) AS trigger
		FROM jsonb_array_elements(p_triggers) AS trigger(value)
	) AS normalized;

	v_request_fingerprint := encode(
		sha256(convert_to(
			jsonb_build_object(
				'label', btrim(p_label),
				'kind', p_kind,
				'target_type', p_target_type,
				'project_id', p_project_id,
				'config', p_config,
				'triggers', v_intent_triggers,
				'policy', p_policy,
				'attention_policy', p_attention_policy,
				'state', p_state
			)::text,
			'UTF8'
		)),
		'hex'
	);

	SELECT * INTO v_cycle
	FROM public.cycles
	WHERE user_id = p_user_id
		AND create_request_id = btrim(p_request_id);
	IF FOUND THEN
		IF v_cycle.create_request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
			RAISE EXCEPTION 'cycle_create_request_conflict' USING ERRCODE = '22023';
		END IF;
		RETURN v_cycle;
	END IF;

	IF p_project_id IS NOT NULL THEN
		v_actor_id := public.ensure_actor_for_user(p_user_id);
		IF NOT public.actor_has_project_member_access(v_actor_id, p_project_id, 'write') THEN
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

	BEGIN
		INSERT INTO public.cycles (
			user_id, create_request_id, create_request_fingerprint,
			label, kind, target_type, project_id,
			config, policy, attention_policy, state
		) VALUES (
			p_user_id, btrim(p_request_id), v_request_fingerprint,
			btrim(p_label), p_kind, p_target_type, p_project_id,
			p_config, p_policy, p_attention_policy, p_state
		)
		RETURNING * INTO v_cycle;
	EXCEPTION WHEN unique_violation THEN
		GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
		SELECT * INTO v_cycle
		FROM public.cycles
		WHERE user_id = p_user_id
			AND create_request_id = btrim(p_request_id);
		IF FOUND THEN
			IF v_cycle.create_request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
				RAISE EXCEPTION 'cycle_create_request_conflict' USING ERRCODE = '22023';
			END IF;
			RETURN v_cycle;
		END IF;
		IF v_constraint_name = 'cycles_one_live_kind_target_idx' THEN
			RAISE EXCEPTION 'cycle_already_exists_for_target' USING ERRCODE = '23505';
		END IF;
		RAISE;
	END;

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
			cycle_id, trigger_type, spec, state, next_run_at
		) VALUES (
			v_cycle.id,
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
				AND trigger_row.next_run_at IS NOT NULL
		),
		updated_at = now()
	WHERE cycle_row.id = v_cycle.id
	RETURNING * INTO v_cycle;

	RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_cycle(
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
DECLARE
	v_cycle public.cycles%ROWTYPE;
	v_label text;
	v_target_type text;
	v_project_id uuid;
	v_config jsonb;
	v_policy jsonb;
	v_attention_policy text;
	v_state text;
	v_actor_id uuid;
BEGIN
	IF p_user_id IS NULL
		OR p_cycle_id IS NULL
		OR p_expected_version IS NULL
		OR p_expected_version < 1
		OR p_patch IS NULL
		OR jsonb_typeof(p_patch) <> 'object'
		OR NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch))
		OR EXISTS (
			SELECT 1 FROM jsonb_object_keys(p_patch) AS patch_key(key)
			WHERE patch_key.key NOT IN ('label', 'target', 'config', 'policy', 'attention_policy', 'state')
		) THEN
		RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_cycle
	FROM public.cycles
	WHERE id = p_cycle_id
		AND user_id = p_user_id
		AND deleted_at IS NULL
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
	END IF;
	IF v_cycle.version <> p_expected_version THEN
		RAISE EXCEPTION 'cycle_version_conflict'
			USING ERRCODE = 'P0001',
			DETAIL = format('expected_version=%s current_version=%s', p_expected_version, v_cycle.version);
	END IF;

	v_label := v_cycle.label;
	v_target_type := v_cycle.target_type;
	v_project_id := v_cycle.project_id;
	v_config := v_cycle.config;
	v_policy := v_cycle.policy;
	v_attention_policy := v_cycle.attention_policy;
	v_state := v_cycle.state;

	IF p_patch ? 'label' THEN
		IF jsonb_typeof(p_patch->'label') <> 'string' THEN
			RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
		END IF;
		v_label := btrim(p_patch->>'label');
	END IF;
	IF p_patch ? 'target' THEN
		IF jsonb_typeof(p_patch->'target') <> 'object'
			OR EXISTS (
				SELECT 1 FROM jsonb_object_keys(p_patch->'target') AS target_key(key)
				WHERE target_key.key NOT IN ('type', 'project_id')
			) THEN
			RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
		END IF;
		v_target_type := p_patch->'target'->>'type';
		BEGIN
			v_project_id := CASE
				WHEN p_patch->'target'->'project_id' IS NULL
					OR p_patch->'target'->'project_id' = 'null'::jsonb THEN NULL
				ELSE (p_patch->'target'->>'project_id')::uuid
			END;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
		END;
	END IF;
	IF p_patch ? 'config' THEN
		v_config := p_patch->'config';
	END IF;
	IF p_patch ? 'policy' THEN
		v_policy := p_patch->'policy';
	END IF;
	IF p_patch ? 'attention_policy' THEN
		IF jsonb_typeof(p_patch->'attention_policy') <> 'string' THEN
			RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
		END IF;
		v_attention_policy := p_patch->>'attention_policy';
	END IF;
	IF p_patch ? 'state' THEN
		IF jsonb_typeof(p_patch->'state') <> 'string' THEN
			RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
		END IF;
		v_state := p_patch->>'state';
	END IF;

	IF char_length(v_label) NOT BETWEEN 1 AND 100
		OR NOT COALESCE(public.cycle_definition_payload_is_valid(
			v_cycle.kind, v_target_type, v_project_id, v_config, v_policy, v_attention_policy, v_state
		), false) THEN
		RAISE EXCEPTION 'cycle_update_invalid' USING ERRCODE = '22023';
	END IF;

	IF v_project_id IS NOT NULL
		AND (v_state = 'active' OR v_project_id IS DISTINCT FROM v_cycle.project_id) THEN
		v_actor_id := public.ensure_actor_for_user(p_user_id);
		IF NOT public.actor_has_project_member_access(v_actor_id, v_project_id, 'write') THEN
			RAISE EXCEPTION 'cycle_project_access_denied' USING ERRCODE = '42501';
		END IF;
	END IF;

	UPDATE public.cycles
	SET label = v_label,
		target_type = v_target_type,
		project_id = v_project_id,
		config = v_config,
		policy = v_policy,
		attention_policy = v_attention_policy,
		state = v_state,
		version = version + 1,
		updated_at = now()
	WHERE id = p_cycle_id
	RETURNING * INTO v_cycle;

	RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pause_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle public.cycles%ROWTYPE;
BEGIN
	v_cycle := public.update_cycle(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		jsonb_build_object('state', 'paused')
	);
	RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resume_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle public.cycles%ROWTYPE;
BEGIN
	v_cycle := public.update_cycle(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		jsonb_build_object('state', 'active')
	);
	RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle public.cycles%ROWTYPE;
BEGIN
	IF p_user_id IS NULL OR p_cycle_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
		RAISE EXCEPTION 'cycle_delete_invalid' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_cycle
	FROM public.cycles
	WHERE id = p_cycle_id
		AND user_id = p_user_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
	END IF;
	IF v_cycle.state = 'deleted' THEN
		RETURN v_cycle;
	END IF;
	IF v_cycle.version <> p_expected_version THEN
		RAISE EXCEPTION 'cycle_version_conflict'
			USING ERRCODE = 'P0001',
			DETAIL = format('expected_version=%s current_version=%s', p_expected_version, v_cycle.version);
	END IF;

	UPDATE public.queue_jobs queue_row
	SET status = 'cancelled',
		processed_at = COALESCE(queue_row.processed_at, now()),
		completed_at = COALESCE(queue_row.completed_at, now()),
		updated_at = now()
	FROM public.cycle_runs run
	WHERE run.cycle_id = p_cycle_id
		AND run.status = 'queued'
		AND queue_row.id = run.queue_job_record_id
		AND queue_row.status IN ('pending', 'retrying');

	UPDATE public.cycle_runs
	SET status = 'cancelled',
		processing_token = NULL,
		finished_at = now(),
		updated_at = now()
	WHERE cycle_id = p_cycle_id
		AND status = 'queued';

	UPDATE public.cycle_triggers
	SET state = 'deleted',
		next_run_at = NULL,
		deleted_at = now(),
		version = version + 1,
		updated_at = now()
	WHERE cycle_id = p_cycle_id
		AND deleted_at IS NULL;

	UPDATE public.cycles
	SET state = 'deleted',
		next_run_at = NULL,
		deleted_at = now(),
		version = version + 1,
		updated_at = now()
	WHERE id = p_cycle_id
	RETURNING * INTO v_cycle;

	RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admit_manual_cycle_run(
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
DECLARE
	v_cycle public.cycles%ROWTYPE;
BEGIN
	IF p_user_id IS NULL OR p_cycle_id IS NULL OR btrim(COALESCE(p_request_id, '')) = '' THEN
		RAISE EXCEPTION 'manual_cycle_run_invalid' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_cycle
	FROM public.cycles
	WHERE id = p_cycle_id
		AND user_id = p_user_id
		AND deleted_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
	END IF;

	RETURN public.admit_cycle_run(
		p_cycle_id,
		'manual',
		'manual:' || btrim(p_request_id),
		p_execution_input,
		p_delivery_intent,
		NULL,
		now(),
		NULL,
		NULL
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.cycle_definition_payload_is_valid(text, text, uuid, jsonb, jsonb, text, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cycle_trigger_input_is_valid(jsonb)
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

COMMENT ON FUNCTION public.create_cycle(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb, text, text) IS
	'Atomically creates one Cycle definition and its initial materialized triggers. Service role only.';
COMMENT ON FUNCTION public.update_cycle(uuid, uuid, integer, jsonb) IS
	'Updates a Cycle definition under an owner and expected-version compare-and-swap guard. Service role only.';
COMMENT ON FUNCTION public.delete_cycle(uuid, uuid, integer) IS
	'Tombstones a Cycle and its triggers and cancels admitted work that has not started. Service role only.';
COMMENT ON FUNCTION public.admit_manual_cycle_run(uuid, uuid, text, jsonb, jsonb) IS
	'Owner-scoped, idempotent manual Cycle Run admission. Service role only.';
