-- scripts/supabase-health/sql/overview.sql
SELECT 'database' AS section, to_jsonb(s) AS data FROM (
 SELECT current_database() AS database, pg_database_size(current_database()) AS bytes,
 pg_postmaster_start_time() AS started_at, now() AS observed_at,
 current_setting('transaction_read_only') AS transaction_read_only,
 (SELECT to_jsonb(d) FROM pg_stat_database d WHERE datname=current_database()) AS stats,
 (SELECT to_jsonb(i) FROM extensions.pg_stat_statements_info i) AS statements_info
) s
UNION ALL SELECT 'settings', to_jsonb(s) FROM (
 SELECT name, setting, unit, source FROM pg_settings WHERE name IN
 ('shared_buffers','effective_cache_size','work_mem','maintenance_work_mem','max_connections',
 'statement_timeout','lock_timeout','idle_in_transaction_session_timeout','default_toast_compression',
 'autovacuum','autovacuum_vacuum_scale_factor','autovacuum_analyze_scale_factor',
 'autovacuum_vacuum_threshold','autovacuum_max_workers','autovacuum_work_mem',
 'track_io_timing','log_lock_waits','deadlock_timeout','log_min_duration_statement','pg_stat_statements.track',
 'max_wal_size','checkpoint_timeout','jit')
) s
UNION ALL SELECT 'role_settings', to_jsonb(s) FROM (
 SELECT r.rolname, x.setconfig FROM pg_db_role_setting x JOIN pg_roles r ON r.oid=x.setrole
) s
UNION ALL SELECT 'connections', to_jsonb(s) FROM (
 SELECT usename, application_name, backend_type, state, wait_event_type, wait_event,
 count(*) AS connections, max(extract(epoch FROM now()-xact_start)) AS oldest_transaction_seconds
 FROM pg_stat_activity GROUP BY 1,2,3,4,5,6
) s
UNION ALL SELECT 'extensions', to_jsonb(s) FROM (SELECT extname, extversion FROM pg_extension) s
UNION ALL SELECT 'lock_waits', to_jsonb(s) FROM (
 SELECT pid, usename, wait_event_type, wait_event, extract(epoch FROM now()-query_start) AS seconds,
 pg_blocking_pids(pid) AS blocking_pids FROM pg_stat_activity WHERE wait_event_type='Lock'
) s
UNION ALL SELECT 'wal', to_jsonb(s) FROM pg_stat_wal s;
