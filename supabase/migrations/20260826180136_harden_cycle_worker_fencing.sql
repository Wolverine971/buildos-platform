-- supabase/migrations/20260826180136_harden_cycle_worker_fencing.sql
-- A Cycle Run is domain state for a generic queue row. Both sides must agree
-- on ownership before a worker may write a terminal result. Without this
-- queue-side fence, a processor that outlives its timeout can complete its Run
-- after fail_queue_job has already cleared the queue token and scheduled a
-- retry.

CREATE OR REPLACE FUNCTION public.complete_cycle_run_impl(
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
DECLARE
	v_cycle_id uuid;
	v_queue_id uuid;
BEGIN
	IF jsonb_typeof(p_outcome) <> 'object'
		OR p_outcome->>'status' NOT IN ('no_change', 'artifact_created', 'attention_required')
		OR p_outcome->>'attention_level' NOT IN ('none', 'minor', 'decision', 'urgent')
		OR jsonb_typeof(p_outcome->'summary') <> 'string'
		OR btrim(COALESCE(p_outcome->>'summary', '')) = ''
		OR jsonb_typeof(p_outcome->'artifact_refs') <> 'array'
		OR NOT (
			(p_outcome->>'status' = 'no_change' AND p_outcome->>'attention_level' = 'none')
			OR (
				p_outcome->>'status' = 'artifact_created'
				AND p_outcome->>'attention_level' IN ('none', 'minor')
			)
			OR (
				p_outcome->>'status' = 'attention_required'
				AND p_outcome->>'attention_level' IN ('decision', 'urgent')
			)
		) THEN
		RAISE EXCEPTION 'cycle_run_outcome_invalid' USING ERRCODE = '22023';
	END IF;

	-- Lock queue ownership before the Run, matching claim_cycle_run_impl's lock
	-- order. The subquery only discovers the immutable queue foreign key.
	SELECT queue_row.id INTO v_queue_id
	FROM public.queue_jobs queue_row
	WHERE queue_row.id = (
			SELECT run_row.queue_job_record_id
			FROM public.cycle_runs run_row
			WHERE run_row.id = p_cycle_run_id
		)
		AND queue_row.job_type = 'run_cycle'::public.queue_type
		AND queue_row.status = 'processing'::public.queue_status
		AND queue_row.processing_token = p_processing_token
	FOR UPDATE;

	IF v_queue_id IS NULL THEN
		-- Preserve harmless idempotency for a result that already committed. A
		-- stale worker still cannot change the committed terminal result.
		RETURN EXISTS (
			SELECT 1
			FROM public.cycle_runs run_row
			WHERE run_row.id = p_cycle_run_id
				AND run_row.status = 'completed'
		);
	END IF;

	UPDATE public.cycle_runs
	SET status = 'completed',
		outcome = p_outcome,
		result = p_result,
		processing_token = NULL,
		finished_at = now(),
		updated_at = now()
	WHERE id = p_cycle_run_id
		AND queue_job_record_id = v_queue_id
		AND status = 'running'
		AND processing_token = p_processing_token
	RETURNING cycle_id INTO v_cycle_id;

	IF v_cycle_id IS NULL THEN
		RETURN EXISTS (
			SELECT 1
			FROM public.cycle_runs run_row
			WHERE run_row.id = p_cycle_run_id
				AND run_row.status = 'completed'
		);
	END IF;

	UPDATE public.cycles
	SET last_run_at = now(),
		last_run_id = p_cycle_run_id,
		last_error = NULL,
		updated_at = now()
	WHERE id = v_cycle_id;

	RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_cycle_run_impl(
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
DECLARE
	v_cycle_id uuid;
	v_queue_id uuid;
BEGIN
	SELECT queue_row.id INTO v_queue_id
	FROM public.queue_jobs queue_row
	WHERE queue_row.id = (
			SELECT run_row.queue_job_record_id
			FROM public.cycle_runs run_row
			WHERE run_row.id = p_cycle_run_id
		)
		AND queue_row.job_type = 'run_cycle'::public.queue_type
		AND queue_row.status = 'processing'::public.queue_status
		AND queue_row.processing_token = p_processing_token
	FOR UPDATE;

	IF v_queue_id IS NULL THEN
		RETURN false;
	END IF;

	UPDATE public.cycle_runs
	SET status = CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END,
		outcome = CASE WHEN p_terminal THEN jsonb_build_object(
			'status', 'failed',
			'attention_level', 'none',
			'summary', left(COALESCE(p_error_message, 'Cycle run failed.'), 500),
			'artifact_refs', jsonb_build_array()
		) ELSE NULL END,
		error_code = p_error_code,
		error_message = left(COALESCE(p_error_message, 'Unknown cycle error'), 4000),
		processing_token = NULL,
		finished_at = CASE WHEN p_terminal THEN now() ELSE NULL END,
		updated_at = now()
	WHERE id = p_cycle_run_id
		AND queue_job_record_id = v_queue_id
		AND status = 'running'
		AND processing_token = p_processing_token
	RETURNING cycle_id INTO v_cycle_id;

	IF v_cycle_id IS NULL THEN
		RETURN false;
	END IF;

	UPDATE public.cycles
	SET last_error = left(COALESCE(p_error_message, 'Unknown cycle error'), 4000),
		updated_at = now()
	WHERE id = v_cycle_id;

	RETURN true;
END;
$function$;

-- Generic stalled recovery owns queue transport. When it consumes the final
-- retry of a run_cycle row it must also terminalize the linked Cycle Run in the
-- same statement, otherwise overlap=skip sees an active Run forever.
CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(
	p_stall_timeout text DEFAULT '5 minutes'::text,
	p_include_job_types text[] DEFAULT NULL::text[],
	p_exclude_job_types text[] DEFAULT ARRAY['agentic_chat_turn']::text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_reset_count integer;
BEGIN
	WITH stalled_jobs AS MATERIALIZED (
		SELECT
			jobs.id,
			COALESCE(jobs.attempts, 0) AS current_attempts,
			COALESCE(jobs.max_attempts, 3) AS allowed_attempts
		FROM public.queue_jobs jobs
		WHERE jobs.status = 'processing'
			AND jobs.job_type::text <> 'agentic_chat_turn'
			AND (
				p_include_job_types IS NULL
				OR jobs.job_type::text = ANY(p_include_job_types)
			)
			AND NOT (
				jobs.job_type::text = ANY(
					COALESCE(p_exclude_job_types, ARRAY[]::text[])
				)
			)
			AND GREATEST(
				COALESCE(jobs.started_at, 'epoch'::timestamptz),
				COALESCE(jobs.updated_at, 'epoch'::timestamptz)
			) < now() - p_stall_timeout::interval
		FOR UPDATE SKIP LOCKED
	),
	updated_jobs AS (
		UPDATE public.queue_jobs jobs
		SET
			status = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN 'pending'::public.queue_status
				ELSE 'failed'::public.queue_status
			END,
			attempts = stalled_jobs.current_attempts + 1,
			processing_token = NULL,
			started_at = NULL,
			scheduled_for = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN
					now()
						+ (LEAST(POWER(2, stalled_jobs.current_attempts), 16) || ' minutes')::interval
						+ (random() * interval '60 seconds')
				ELSE jobs.scheduled_for
			END,
			completed_at = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN jobs.completed_at
				ELSE now()
			END,
			error_message = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN COALESCE(jobs.error_message, 'Job stalled and was requeued')
				ELSE 'Job stalled and exceeded max attempts'
			END,
			updated_at = now()
		FROM stalled_jobs
		WHERE jobs.id = stalled_jobs.id
		RETURNING jobs.id, jobs.status
	),
	reconciled_cycle_runs AS (
		UPDATE public.cycle_runs run_row
		SET status = 'failed',
			outcome = jsonb_build_object(
				'status', 'failed',
				'attention_level', 'none',
				'summary', 'Cycle worker stalled and exhausted its retry policy.',
				'artifact_refs', jsonb_build_array()
			),
			error_code = 'cycle_queue_stalled_terminal',
			error_message = 'Cycle worker stalled and exhausted its retry policy.',
			processing_token = NULL,
			finished_at = now(),
			updated_at = now()
		FROM updated_jobs
		WHERE updated_jobs.status = 'failed'::public.queue_status
			AND run_row.queue_job_record_id = updated_jobs.id
			AND run_row.status IN ('queued', 'running')
		RETURNING run_row.cycle_id
	),
	updated_cycles AS (
		UPDATE public.cycles cycle_row
		SET last_error = 'Cycle worker stalled and exhausted its retry policy.',
			updated_at = now()
		WHERE cycle_row.id IN (SELECT cycle_id FROM reconciled_cycle_runs)
		RETURNING cycle_row.id
	)
	SELECT count(*) INTO v_reset_count FROM updated_jobs;

	IF v_reset_count > 0 THEN
		RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
	END IF;

	RETURN v_reset_count;
END;
$function$;

COMMENT ON FUNCTION public.complete_cycle_run_impl(uuid, uuid, jsonb, jsonb) IS
	'Internal Cycle completion CAS. Requires the linked queue row to remain processing under the same token.';
COMMENT ON FUNCTION public.fail_cycle_run_impl(uuid, uuid, text, text, boolean) IS
	'Internal Cycle failure CAS. Requires the linked queue row to remain processing under the same token.';
COMMENT ON FUNCTION public.reset_stalled_jobs(text, text[], text[]) IS
	'Server-only generic stalled recovery scoped to consumer job types; terminal run_cycle rows reconcile their Cycle Runs atomically.';

-- The legacy three-argument resume command cannot calculate timezone-aware
-- schedule projections. Keep it only as a fail-closed compatibility path: it
-- may resume when every time-based trigger is already safely in the future,
-- but it must never activate stale catch-up work accidentally.
CREATE OR REPLACE FUNCTION public.resume_cycle_impl(
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
	IF EXISTS (
		SELECT 1
		FROM public.cycle_triggers trigger_row
		WHERE trigger_row.cycle_id = p_cycle_id
			AND trigger_row.state = 'active'
			AND trigger_row.trigger_type IN ('schedule', 'relative')
			AND (
				trigger_row.next_run_at IS NULL
				OR trigger_row.next_run_at <= now()
			)
	) THEN
		RAISE EXCEPTION 'cycle_trigger_projection_stale' USING ERRCODE = '55000';
	END IF;

	RETURN public.update_cycle_impl(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		jsonb_build_object('state', 'active')
	);
END;
$function$;

-- Application services calculate DST-safe schedule occurrences. This command
-- validates that the supplied set exactly covers every active time trigger,
-- installs those projections, and activates the Cycle under one Cycle-row lock.
CREATE OR REPLACE FUNCTION public.resume_cycle_with_projections_impl(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer,
	p_trigger_projections jsonb
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle public.cycles%ROWTYPE;
	v_projection_count integer;
BEGIN
	IF jsonb_typeof(p_trigger_projections) <> 'array' THEN
		RAISE EXCEPTION 'cycle_trigger_projection_invalid' USING ERRCODE = '22023';
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

	BEGIN
		WITH projections AS MATERIALIZED (
			SELECT
				(projection.value->>'trigger_id')::uuid AS trigger_id,
				(projection.value->>'next_run_at')::timestamptz AS next_run_at
			FROM jsonb_array_elements(p_trigger_projections) projection(value)
			WHERE jsonb_typeof(projection.value) = 'object'
				AND projection.value ? 'trigger_id'
				AND projection.value ? 'next_run_at'
		)
		SELECT count(*) INTO v_projection_count FROM projections;
	EXCEPTION
		WHEN invalid_text_representation OR datetime_field_overflow THEN
			RAISE EXCEPTION 'cycle_trigger_projection_invalid' USING ERRCODE = '22023';
	END;

	IF v_projection_count <> jsonb_array_length(p_trigger_projections)
		OR EXISTS (
			SELECT 1
			FROM (
				SELECT (projection.value->>'trigger_id')::uuid AS trigger_id
				FROM jsonb_array_elements(p_trigger_projections) projection(value)
			) supplied
			GROUP BY supplied.trigger_id
			HAVING count(*) > 1
		)
		OR v_projection_count <> (
			SELECT count(*)
			FROM public.cycle_triggers trigger_row
			WHERE trigger_row.cycle_id = p_cycle_id
				AND trigger_row.state = 'active'
				AND trigger_row.trigger_type IN ('schedule', 'relative')
		)
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(p_trigger_projections) projection(value)
			LEFT JOIN public.cycle_triggers trigger_row
				ON trigger_row.id = (projection.value->>'trigger_id')::uuid
				AND trigger_row.cycle_id = p_cycle_id
				AND trigger_row.state = 'active'
				AND trigger_row.trigger_type IN ('schedule', 'relative')
			WHERE trigger_row.id IS NULL
				OR (projection.value->>'next_run_at')::timestamptz <= now()
		) THEN
		RAISE EXCEPTION 'cycle_trigger_projection_invalid' USING ERRCODE = '22023';
	END IF;

	UPDATE public.cycle_triggers trigger_row
	SET next_run_at = projection.next_run_at,
		version = version + 1,
		scheduler_claim_token = NULL,
		scheduler_claim_expires_at = NULL,
		updated_at = now()
	FROM (
		SELECT
			(projection.value->>'trigger_id')::uuid AS trigger_id,
			(projection.value->>'next_run_at')::timestamptz AS next_run_at
		FROM jsonb_array_elements(p_trigger_projections) projection(value)
	) projection
	WHERE trigger_row.id = projection.trigger_id
		AND trigger_row.cycle_id = p_cycle_id;

	v_cycle := public.update_cycle_impl(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		jsonb_build_object('state', 'active')
	);

	UPDATE public.cycles cycle_row
	SET next_run_at = (
			SELECT min(trigger_row.next_run_at)
			FROM public.cycle_triggers trigger_row
			WHERE trigger_row.cycle_id = cycle_row.id
				AND trigger_row.state = 'active'
				AND trigger_row.next_run_at IS NOT NULL
		),
		updated_at = now()
	WHERE cycle_row.id = p_cycle_id
	RETURNING * INTO v_cycle;

	RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resume_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_expected_version integer,
	p_trigger_projections jsonb
)
RETURNS public.cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	PERFORM public.require_cycle_service_role();
	RETURN public.resume_cycle_with_projections_impl(
		p_user_id,
		p_cycle_id,
		p_expected_version,
		p_trigger_projections
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.resume_cycle_with_projections_impl(uuid, uuid, integer, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resume_cycle(uuid, uuid, integer, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_cycle(uuid, uuid, integer, jsonb)
	TO service_role;

COMMENT ON FUNCTION public.resume_cycle_impl(uuid, uuid, integer) IS
	'Compatibility resume path; rejects activation when any time-trigger projection is stale.';
COMMENT ON FUNCTION public.resume_cycle(uuid, uuid, integer, jsonb) IS
	'Privileged atomic Cycle activation with a complete set of fresh time-trigger projections.';
