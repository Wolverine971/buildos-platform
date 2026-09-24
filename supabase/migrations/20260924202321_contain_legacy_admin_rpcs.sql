-- supabase/migrations/20260924202321_contain_legacy_admin_rpcs.sql
-- Tasker 104 / 76: contain three exposed legacy admin RPCs.
-- App callers of the retained RPCs already use an admin/service client after an
-- admin check. No application or database dependency on the phase RPC was found.
-- Do not replay historical migrations to apply this change.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- RESTRICT is intentional: an unexpected dependency aborts the transaction.
-- Keep all legacy phase tables and their data.
DROP FUNCTION IF EXISTS public.batch_update_phase_dates(uuid, jsonb) RESTRICT;

CREATE OR REPLACE FUNCTION public.acquire_migration_platform_lock(p_run_id uuid, p_locked_by uuid, p_duration_minutes integer DEFAULT 60)
 RETURNS TABLE(acquired boolean, existing_run_id uuid, existing_locked_by uuid, existing_locked_at timestamp with time zone, existing_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
DECLARE
    v_expires_at TIMESTAMPTZ;
    v_current_lock RECORD;
BEGIN
    v_expires_at := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;

    -- Try to acquire the lock
    UPDATE public.migration_platform_lock
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
        SELECT * INTO v_current_lock FROM public.migration_platform_lock WHERE id = 1;

        RETURN QUERY SELECT
            false AS acquired,
            v_current_lock.run_id AS existing_run_id,
            v_current_lock.locked_by AS existing_locked_by,
            v_current_lock.locked_at AS existing_locked_at,
            v_current_lock.expires_at AS existing_expires_at;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_subscription_overview()
 RETURNS TABLE(total_subscribers bigint, active_subscriptions bigint, trial_subscriptions bigint, canceled_subscriptions bigint, paused_subscriptions bigint, mrr numeric, arr numeric)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT user_id) AS total_subscribers,
    COUNT(*) FILTER (WHERE status = 'active') AS active_subscriptions,
    COUNT(*) FILTER (WHERE status = 'trialing') AS trial_subscriptions,
    COUNT(*) FILTER (WHERE status = 'canceled') AS canceled_subscriptions,
    COUNT(*) FILTER (WHERE status = 'paused') AS paused_subscriptions,
    COALESCE(SUM(
      CASE
        WHEN status = 'active' THEN
          sp.price_cents / 100.0 /
          CASE sp.billing_interval
            WHEN 'month' THEN 1
            WHEN 'year' THEN 12
            ELSE 1
          END
        ELSE 0
      END
    ), 0) AS mrr,
    COALESCE(SUM(
      CASE
        WHEN status = 'active' THEN
          sp.price_cents / 100.0 /
          CASE sp.billing_interval
            WHEN 'month' THEN 1
            WHEN 'year' THEN 12
            ELSE 1
          END
        ELSE 0
      END
    ) * 12, 0) AS arr
  FROM public.customer_subscriptions cs
  LEFT JOIN public.subscription_plans sp ON cs.plan_id = sp.id;
END;
$function$;

-- PUBLIC's inherited default EXECUTE must be removed as well as named grants.
REVOKE ALL ON FUNCTION public.acquire_migration_platform_lock(uuid, uuid, integer)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_subscription_overview()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_migration_platform_lock(uuid, uuid, integer)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_overview() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
