-- packages/shared-types/src/functions/add_queue_job.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamp with time zone DEFAULT now(), p_dedup_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
  DECLARE
    v_job_id UUID;
    v_queue_job_id TEXT;
    v_attempt INTEGER := 0;
  BEGIN
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
        p_metadata,
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
  $function$
