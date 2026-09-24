-- supabase/tests/fixtures/legacy_admin_rpcs_base.sql
-- Disposable local fixture only. No customer data.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE unrelated_client;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, unrelated_client;
CREATE TABLE public.phases(id uuid PRIMARY KEY, project_id uuid, start_date date, end_date date, updated_at timestamptz);
INSERT INTO public.phases VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-01-01','2026-02-01',now());
CREATE TABLE public.migration_platform_lock(id integer PRIMARY KEY, run_id uuid, locked_by uuid, locked_at timestamptz, expires_at timestamptz);
INSERT INTO public.migration_platform_lock(id) VALUES (1);
CREATE TABLE public.subscription_plans(id uuid PRIMARY KEY, price_cents integer, billing_interval text);
CREATE TABLE public.customer_subscriptions(user_id uuid, status text, plan_id uuid);
INSERT INTO public.subscription_plans VALUES ('00000000-0000-0000-0000-000000000003',12000,'year');
INSERT INTO public.customer_subscriptions VALUES ('00000000-0000-0000-0000-000000000004','active','00000000-0000-0000-0000-000000000003');
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_platform_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.migration_platform_lock TO service_role;
GRANT SELECT ON public.customer_subscriptions, public.subscription_plans TO service_role;

-- Prior definitions captured read-only from production, 2026-09-24.
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
$function$;
GRANT EXECUTE ON FUNCTION public.acquire_migration_platform_lock(uuid,uuid,integer) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.batch_update_phase_dates(p_project_id uuid, p_updates jsonb)
 RETURNS TABLE(id uuid, start_date date, end_date date, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  UPDATE phases p
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
GRANT EXECUTE ON FUNCTION public.batch_update_phase_dates(uuid,jsonb) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_subscription_overview()
 RETURNS TABLE(total_subscribers bigint, active_subscriptions bigint, trial_subscriptions bigint, canceled_subscriptions bigint, paused_subscriptions bigint, mrr numeric, arr numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  FROM customer_subscriptions cs
  LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_subscription_overview() TO anon, authenticated, service_role;
