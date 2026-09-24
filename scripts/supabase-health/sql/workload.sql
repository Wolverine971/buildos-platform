-- scripts/supabase-health/sql/workload.sql
-- Bounded metadata-only samples. Percentiles here include model/tool work, not just DB time.
WITH recent_turns AS (
 SELECT status, created_at, started_at, finished_at, execution_mode, last_event_sequence
 FROM public.chat_turn_runs ORDER BY created_at DESC LIMIT 1000
), recent_crons AS (
 SELECT job_name,status,executed_at FROM public.cron_logs ORDER BY executed_at DESC LIMIT 1000
)
SELECT 'turns_last_24h_bounded_1000' AS section,to_jsonb(t) AS data FROM (
 SELECT execution_mode,status,count(*) AS turns,min(created_at) AS oldest,max(created_at) AS newest,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at-started_at)) AS p50_seconds,
 percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at-started_at)) AS p95_seconds,
 percentile_cont(0.5) WITHIN GROUP (ORDER BY last_event_sequence) AS p50_durable_events,
 percentile_cont(0.95) WITHIN GROUP (ORDER BY last_event_sequence) AS p95_durable_events
 FROM recent_turns WHERE created_at>now()-interval '24 hours' GROUP BY 1,2
) t
UNION ALL SELECT 'recent_cron_runs_bounded_1000',to_jsonb(t) FROM (
 SELECT job_name,status,count(*) AS runs,min(executed_at) AS oldest,max(executed_at) AS latest
 FROM recent_crons GROUP BY 1,2
) t
UNION ALL SELECT 'realtime_subscriptions',to_jsonb(t) FROM (
 SELECT entity::regclass::text AS entity,count(*) AS subscriptions FROM realtime.subscription GROUP BY 1
) t
UNION ALL SELECT 'compressed_columns',to_jsonb(t) FROM (
 SELECT c.relname,a.attname,a.attcompression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0
 AND NOT a.attisdropped AND a.attstorage IN ('x','e')
 AND c.relname IN ('chat_prompt_snapshots','chat_turn_input_artifacts','chat_turn_stream_state')
) t;
