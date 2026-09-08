-- supabase/migrations/20260907200711_harden_document_recency_guard_search_path.sql
-- Keep document recency checks independent of the calling role's search path.
-- The trigger uses pg_catalog builtins and explicitly qualified public helpers.
alter function public.update_onto_documents_updated_at() set search_path = '';
