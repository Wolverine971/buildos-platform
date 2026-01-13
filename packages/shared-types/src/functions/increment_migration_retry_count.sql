-- packages/shared-types/src/functions/increment_migration_retry_count.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.increment_migration_retry_count(row_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE migration_log
    SET
        retry_count = COALESCE(retry_count, 0) + 1,
        last_retry_at = NOW()
    WHERE id = row_id;
END;
$function$
