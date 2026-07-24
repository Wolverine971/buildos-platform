-- supabase/migrations/20260724010000_queue_correlation_ids.sql
-- Guarantee one trace key for every new generic queue job. Application
-- producers originate correlationId when possible; this function is the
-- fallback for direct SQL/RPC producers and older call sites.

CREATE OR REPLACE FUNCTION public.add_queue_job(
  p_user_id uuid,
  p_job_type text,
  p_metadata jsonb,
  p_priority integer DEFAULT 10,
  p_scheduled_for timestamp with time zone DEFAULT now(),
  p_dedup_key text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_job_id UUID;
  v_queue_job_id TEXT;
  v_attempt INTEGER := 0;
  v_correlation_id TEXT;
  v_metadata JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) = 'object' THEN
    v_correlation_id := NULLIF(BTRIM(p_metadata->>'correlationId'), '');
    IF v_correlation_id IS NULL OR v_correlation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
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

    INSERT INTO queue_jobs (
      user_id, job_type, metadata, priority,
      scheduled_for, dedup_key, status, queue_job_id
    ) VALUES (
      p_user_id,
      p_job_type::queue_type,
      v_metadata,
      p_priority,
      p_scheduled_for,
      p_dedup_key,
      'pending'::queue_status,
      v_queue_job_id
    )
    ON CONFLICT (dedup_key)
    WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
    DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NOT NULL THEN
      RETURN v_job_id;
    END IF;

    IF p_dedup_key IS NOT NULL THEN
      SELECT id INTO v_job_id
      FROM queue_jobs
      WHERE dedup_key = p_dedup_key
        AND status IN ('pending', 'processing')
      ORDER BY created_at ASC
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

COMMENT ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text) IS
'Atomically creates or resolves a deduplicated queue job and guarantees metadata.correlationId for end-to-end tracing.';
