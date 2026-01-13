-- packages/shared-types/src/functions/acquire_migration_platform_lock.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.acquire_migration_platform_lock(p_run_id uuid, p_locked_by uuid, p_duration_minutes integer DEFAULT 60)
 RETURNS TABLE(acquired boolean, existing_run_id uuid, existing_locked_by uuid, existing_locked_at timestamp with time zone, existing_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_expires_at TIMESTAMPTZ;
    v_current_lock RECORD;
BEGIN
    v_expires_at := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;

    -- Try to acquire the lock
    UPDATE migration_platform_lock
    SET
        run_id = p_run_id,
        locked_by = p_locked_by,
        locked_at = NOW(),
        expires_at = v_expires_at
    WHERE id = 1
        AND (run_id IS NULL OR expires_at < NOW())
    RETURNING * INTO v_current_lock;

    IF FOUND THEN
        -- Lock acquired
        RETURN QUERY SELECT
            true AS acquired,
            NULL::UUID AS existing_run_id,
            NULL::UUID AS existing_locked_by,
            NULL::TIMESTAMPTZ AS existing_locked_at,
            NULL::TIMESTAMPTZ AS existing_expires_at;
    ELSE
        -- Lock not acquired, return existing lock info
        SELECT * INTO v_current_lock FROM migration_platform_lock WHERE id = 1;

        RETURN QUERY SELECT
            false AS acquired,
            v_current_lock.run_id AS existing_run_id,
            v_current_lock.locked_by AS existing_locked_by,
            v_current_lock.locked_at AS existing_locked_at,
            v_current_lock.expires_at AS existing_expires_at;
    END IF;
END;
$function$
