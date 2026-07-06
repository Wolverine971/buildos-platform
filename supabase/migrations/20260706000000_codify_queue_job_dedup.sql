-- supabase/migrations/20260706000000_codify_queue_job_dedup.sql
-- Codify the production queue dedup primitive for fresh/shadow databases.
-- Existing production databases may already have an equivalent partial unique
-- index under a different name, so detect the predicate instead of relying only
-- on CREATE INDEX IF NOT EXISTS.

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_index i
		JOIN pg_class idx ON idx.oid = i.indexrelid
		JOIN pg_class tbl ON tbl.oid = i.indrelid
		JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
		WHERE ns.nspname = 'public'
			AND tbl.relname = 'queue_jobs'
			AND i.indisunique
			AND pg_get_indexdef(i.indexrelid) ILIKE '%dedup_key%'
			AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%dedup_key IS NOT NULL%'
			AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%pending%'
			AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%processing%'
	) THEN
		CREATE UNIQUE INDEX queue_jobs_dedup_key_active_idx
			ON public.queue_jobs (dedup_key)
			WHERE dedup_key IS NOT NULL
				AND status IN ('pending', 'processing');
	END IF;
END $$;

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
	v_job_id uuid;
	v_queue_job_id text;
	v_attempt integer := 0;
BEGIN
	LOOP
		v_attempt := v_attempt + 1;
		v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;
		v_job_id := NULL;

		INSERT INTO queue_jobs (
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
			p_job_type::queue_type,
			p_metadata,
			p_priority,
			p_scheduled_for,
			p_dedup_key,
			'pending'::queue_status,
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
