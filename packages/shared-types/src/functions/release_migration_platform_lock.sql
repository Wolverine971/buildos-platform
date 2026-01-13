-- packages/shared-types/src/functions/release_migration_platform_lock.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.release_migration_platform_lock(p_run_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_released BOOLEAN;
BEGIN
    UPDATE migration_platform_lock
    SET
        run_id = NULL,
        locked_by = NULL,
        locked_at = NULL,
        expires_at = NULL
    WHERE id = 1 AND run_id = p_run_id;

    RETURN FOUND;
END;
$function$
