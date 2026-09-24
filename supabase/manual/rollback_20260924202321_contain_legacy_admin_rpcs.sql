-- supabase/manual/rollback_20260924202321_contain_legacy_admin_rpcs.sql
-- Incident-only compatibility rollback. Never reopens client execution.
-- Review and apply explicitly; this is not part of automatic migrations.
-- The two retained admin RPCs regain their old execution identity, with the new
-- safe search path and schema-qualified bodies preserved. Phase data is untouched.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
ALTER FUNCTION public.acquire_migration_platform_lock(uuid, uuid, integer) SECURITY DEFINER;
ALTER FUNCTION public.get_subscription_overview() SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.batch_update_phase_dates(p_project_id uuid, p_updates jsonb)
 RETURNS TABLE(id uuid, start_date date, end_date date, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
BEGIN
  -- Validate dates
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_updates) AS update_item
    WHERE (update_item->>'start_date')::DATE >= (update_item->>'end_date')::DATE
  ) THEN
    RAISE EXCEPTION 'Phase start date must be before end date';
  END IF;

  -- Perform batch update
  RETURN QUERY
  UPDATE public.phases p
  SET
    start_date = (u.value->>'start_date')::DATE,
    end_date = (u.value->>'end_date')::DATE,
    updated_at = NOW()
  FROM jsonb_array_elements(p_updates) AS u
  WHERE p.id = (u.value->>'id')::UUID
    AND p.project_id = p_project_id
  RETURNING p.id, p.start_date, p.end_date, p.updated_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.batch_update_phase_dates(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_migration_platform_lock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_subscription_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_update_phase_dates(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_migration_platform_lock(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_overview() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
