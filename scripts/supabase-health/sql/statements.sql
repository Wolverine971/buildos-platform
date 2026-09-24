-- scripts/supabase-health/sql/statements.sql
-- Retain normalized shapes, never bind values. Top 20 by each requested measure.
WITH ranked AS (
 SELECT dbid, userid, queryid::text, toplevel, calls, total_exec_time, mean_exec_time,
 max_exec_time, min_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read,
 shared_blks_dirtied, shared_blks_written, temp_blks_read, temp_blks_written,
 blk_read_time, blk_write_time, wal_records, wal_bytes, query,
 rank() OVER (ORDER BY total_exec_time DESC) AS rank_total,
 rank() OVER (ORDER BY calls DESC) AS rank_calls,
 rank() OVER (ORDER BY max_exec_time DESC) AS rank_max
 FROM extensions.pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
)
SELECT * FROM ranked ORDER BY total_exec_time DESC;
