-- supabase/migrations/20260126_140000_homework_workspace_indexes.sql
-- Adds discoverability indexes for homework workspace documents/edges

-- Btree on homework_run_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_onto_documents_homework_run_id
	ON onto_documents ((props ->> 'homework_run_id'));

CREATE INDEX IF NOT EXISTS idx_onto_edges_homework_run_id
	ON onto_edges ((props ->> 'homework_run_id'));

-- GIN on props for flexible querying
CREATE INDEX IF NOT EXISTS idx_onto_documents_props_homework_gin
	ON onto_documents USING gin (props);

CREATE INDEX IF NOT EXISTS idx_onto_edges_props_homework_gin
	ON onto_edges USING gin (props);
