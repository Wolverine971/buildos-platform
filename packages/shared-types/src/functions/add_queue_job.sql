-- packages/shared-types/src/functions/add_queue_job.sql
-- Source: Supabase pg_get_functiondef after 20260801030600

CREATE OR REPLACE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamp with time zone DEFAULT now(), p_dedup_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
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
$function$
