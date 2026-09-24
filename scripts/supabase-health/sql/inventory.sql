-- scripts/supabase-health/sql/inventory.sql
SELECT 'publications' AS section, to_jsonb(t) AS data FROM pg_publication_tables t
UNION ALL SELECT 'replication_slots', to_jsonb(t) FROM (
 SELECT slot_name, slot_type, active, wal_status, pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn) AS retained_wal_bytes
 FROM pg_replication_slots
) t
UNION ALL SELECT 'columns', to_jsonb(t) FROM (
 SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN
 ('chat_turn_runs','chat_turn_stream_state','chat_turn_events','chat_prompt_snapshots','cron_logs','llm_usage_logs','queue_jobs')
) t
UNION ALL SELECT 'triggers', to_jsonb(t) FROM (
 SELECT c.relname, g.tgname, p.proname FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
 JOIN pg_proc p ON p.oid=g.tgfoid WHERE NOT g.tgisinternal AND c.relname IN
 ('chat_turn_runs','chat_turn_stream_state','chat_prompt_snapshots','queue_jobs')
) t
UNION ALL SELECT 'migrations', to_jsonb(t) FROM (
 SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 25
) t
UNION ALL SELECT 'read_only', jsonb_build_object('transaction_read_only',current_setting('transaction_read_only'));
