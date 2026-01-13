-- packages/shared-types/src/functions/get_migration_platform_lock_status.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_migration_platform_lock_status()
 RETURNS TABLE(is_locked boolean, run_id uuid, locked_by uuid, locked_by_email text, locked_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        (mpl.run_id IS NOT NULL AND mpl.expires_at > NOW()) AS is_locked,
        mpl.run_id,
        mpl.locked_by,
        u.email AS locked_by_email,
        mpl.locked_at,
        mpl.expires_at
    FROM migration_platform_lock mpl
    LEFT JOIN auth.users u ON u.id = mpl.locked_by
    WHERE mpl.id = 1;
END;
$function$
