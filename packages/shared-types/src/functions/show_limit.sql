-- packages/shared-types/src/functions/show_limit.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
