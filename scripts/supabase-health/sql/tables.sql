-- scripts/supabase-health/sql/tables.sql
SELECT t.schemaname, t.relname, t.relid, pg_total_relation_size(t.relid) AS total_bytes,
 pg_relation_size(t.relid) AS heap_bytes, pg_indexes_size(t.relid) AS index_bytes,
 CASE WHEN c.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid) END AS toast_bytes,
 c.reltuples AS estimated_rows, c.reloptions, t.n_live_tup, t.n_dead_tup, t.n_tup_ins,
 t.n_tup_upd, t.n_tup_hot_upd, t.n_tup_del, t.seq_scan, t.seq_tup_read, t.idx_scan,
 t.last_autovacuum, t.last_autoanalyze, t.autovacuum_count, t.autoanalyze_count,
 t.n_mod_since_analyze, age(c.relfrozenxid) AS xid_age,
 io.heap_blks_read, io.heap_blks_hit, io.idx_blks_read, io.idx_blks_hit,
 io.toast_blks_read, io.toast_blks_hit
FROM pg_stat_user_tables t JOIN pg_class c ON c.oid=t.relid
LEFT JOIN pg_statio_user_tables io ON io.relid=t.relid
ORDER BY total_bytes DESC;
