-- packages/shared-types/src/functions/show_trgm.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
