-- supabase/migrations/20260801030600_agentic_chat_worker_queue_function_lockdown.sql
-- Agentic Chat Worker migration, Phase 2A Slice 5: queue-function lockdown.
--
-- This package closes the generic queue admission/recovery paths before any
-- agentic-chat worker routing exists:
--   1. queue_jobs INSERT remains server-only.
--   2. add_queue_job is explicitly executable only by service_role and rejects
--      agentic_chat_turn when the trusted request role is not service_role.
--   3. reset_stalled_jobs is explicitly executable only by service_role, accepts
--      consumer-owned include/exclude sets, and always leaves agentic_chat_turn
--      rows to the future chat-specific recovery routine.
--
-- Deploy this migration before deploying a worker that sends the new
-- reset_stalled_jobs arguments. Worker routing for agentic_chat_turn remains
-- disabled; this migration creates no admission path or queue consumer.
--
-- Rollback while worker routing remains disabled:
--   1. Restore add_queue_job from 20260724010000_queue_correlation_ids.sql.
--   2. Drop reset_stalled_jobs(text, text[], text[]) and restore the one-argument
--      definition from 20260723010000_queue_stalled_backoff_and_inapp_dedup.sql.
--   3. Restore only the prior function grants that are still intentionally used.

REVOKE INSERT ON TABLE public.queue_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.add_queue_job(
	p_user_id uuid,
	p_job_type text,
	p_metadata jsonb,
	p_priority integer DEFAULT 10,
	p_scheduled_for timestamptz DEFAULT now(),
	p_dedup_key text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_job_id uuid;
	v_queue_job_id text;
	v_attempt integer := 0;
	v_correlation_id text;
	v_metadata jsonb;
	v_request_role text;
BEGIN
	-- SECURITY DEFINER callers change current_user to the function owner. The
	-- signed PostgREST claim preserves the original trusted request role so a
	-- user-callable definer wrapper cannot smuggle an agentic-chat queue row.
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF p_job_type = 'agentic_chat_turn' AND v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_queue_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) = 'object' THEN
		v_correlation_id := NULLIF(BTRIM(p_metadata->>'correlationId'), '');
		IF v_correlation_id IS NULL
			OR v_correlation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
			v_correlation_id := gen_random_uuid()::text;
		END IF;
		v_metadata := COALESCE(p_metadata, '{}'::jsonb)
			|| jsonb_build_object('correlationId', v_correlation_id);
	ELSE
		v_correlation_id := gen_random_uuid()::text;
		v_metadata := jsonb_build_object(
			'payload', p_metadata,
			'correlationId', v_correlation_id
		);
	END IF;

	LOOP
		v_attempt := v_attempt + 1;
		v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;
		v_job_id := NULL;

		INSERT INTO public.queue_jobs (
			user_id,
			job_type,
			metadata,
			priority,
			scheduled_for,
			dedup_key,
			status,
			queue_job_id
		) VALUES (
			p_user_id,
			p_job_type::public.queue_type,
			v_metadata,
			p_priority,
			p_scheduled_for,
			p_dedup_key,
			'pending'::public.queue_status,
			v_queue_job_id
		)
		ON CONFLICT (dedup_key)
		WHERE dedup_key IS NOT NULL
			AND status IN ('pending', 'processing')
		DO NOTHING
		RETURNING id INTO v_job_id;

		IF v_job_id IS NOT NULL THEN
			RETURN v_job_id;
		END IF;

		IF p_dedup_key IS NOT NULL THEN
			SELECT jobs.id
			INTO v_job_id
			FROM public.queue_jobs jobs
			WHERE jobs.dedup_key = p_dedup_key
				AND jobs.status IN ('pending', 'processing')
			ORDER BY jobs.created_at ASC
			LIMIT 1;

			IF v_job_id IS NOT NULL THEN
				RETURN v_job_id;
			END IF;
		END IF;

		IF v_attempt >= 2 THEN
			RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;
		END IF;
	END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	TO service_role;

DROP FUNCTION public.reset_stalled_jobs(text);

CREATE FUNCTION public.reset_stalled_jobs(
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
	WITH stalled_jobs AS (
		SELECT
			jobs.id,
			COALESCE(jobs.attempts, 0) AS current_attempts,
			COALESCE(jobs.max_attempts, 3) AS allowed_attempts
		FROM public.queue_jobs jobs
		WHERE jobs.status = 'processing'
			-- Generic recovery must never replay an agentic chat turn. The later
			-- chat-specific routine owns its generation/effect-aware recovery.
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
		RETURNING jobs.id
	)
	SELECT count(*) INTO v_reset_count FROM updated_jobs;

	IF v_reset_count > 0 THEN
		RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
	END IF;

	RETURN v_reset_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_stalled_jobs(text, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_stalled_jobs(text, text[], text[])
	FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stalled_jobs(text, text[], text[])
	TO service_role;

COMMENT ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text) IS
	'Server-only generic queue admission. agentic_chat_turn additionally requires a trusted service_role request claim.';
COMMENT ON FUNCTION public.reset_stalled_jobs(text, text[], text[]) IS
	'Server-only generic stalled recovery scoped to a consumer job-type set; agentic_chat_turn is always excluded.';
