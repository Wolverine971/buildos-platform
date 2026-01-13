-- supabase/migrations/20260329000000_remove_unused_rpc_functions.sql
-- Remove deprecated RPC functions that are no longer used in the codebase.

DROP FUNCTION IF EXISTS public.get_dashboard_data(uuid, text, date, date, date);
DROP FUNCTION IF EXISTS public.get_projects_with_stats(uuid, text, text, integer, integer);
