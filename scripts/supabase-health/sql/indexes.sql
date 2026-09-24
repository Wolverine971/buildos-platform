-- scripts/supabase-health/sql/indexes.sql
SELECT s.schemaname, s.relname, s.indexrelname, s.idx_scan, s.idx_tup_read, s.idx_tup_fetch,
 pg_relation_size(s.indexrelid) AS bytes, x.indisunique, x.indisprimary, x.indisvalid,
 pg_get_indexdef(s.indexrelid) AS definition,
 EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=s.indexrelid) AS constraint_backed
FROM pg_stat_user_indexes s JOIN pg_index x ON x.indexrelid=s.indexrelid ORDER BY bytes DESC;
