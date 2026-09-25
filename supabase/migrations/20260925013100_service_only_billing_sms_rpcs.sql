-- supabase/migrations/20260925013100_service_only_billing_sms_rpcs.sql
-- Tasker 104 / 76, step 2 of 2. APPLY ONLY AFTER the web deploy that moves these callers to
-- the admin client (hooks.server.ts, billing-context.ts, sms/verify/confirm, llm-usage/summary);
-- before it, every signed-in mutation would fail the consumption gate.
-- - evaluate_user_consumption_gate trusts p_user_id and caller-supplied limits (a user could
--   freeze anyone or unfreeze themselves); queue_sms_message accepts any number and message;
--   get_user_llm_usage returns any user's spend. All three become service-only.
-- - get_user_subscription_status / get_user_trial_status keep client callers (their own id)
--   and gain an own-id-or-admin guard plus a fixed search_path. Bodies are production's
--   (pg_get_functiondef, 2026-09-25) with only the guard and search_path added.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL ON FUNCTION public.evaluate_user_consumption_gate(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_user_consumption_gate(uuid, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.queue_sms_message(uuid, text, text, public.sms_priority, timestamp with time zone, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_sms_message(uuid, text, text, public.sms_priority, timestamp with time zone, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_llm_usage(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_llm_usage(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_subscription_status(user_uuid uuid)
 RETURNS TABLE(has_subscription boolean, subscription_status text, current_period_end timestamp with time zone, is_beta_user boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Clients may read only their own status (admins any user); service callers are unrestricted.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND user_uuid IS DISTINCT FROM auth.uid()
     AND NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Not allowed to read another user''s billing status' USING ERRCODE = '42501';
  END IF;
    RETURN QUERY
    SELECT 
        COALESCE(cs.status IN ('active', 'trialing'), false) as has_subscription,
        COALESCE(cs.status, 'free') as subscription_status,
        cs.current_period_end,
        EXISTS (
            SELECT 1 FROM user_discounts ud
            JOIN discount_codes dc ON ud.discount_code_id = dc.id
            WHERE ud.user_id = user_uuid
            AND dc.metadata->>'type' = 'beta_user'
        ) as is_beta_user
    FROM users u
    LEFT JOIN customer_subscriptions cs ON u.id = cs.user_id
        AND cs.status IN ('active', 'trialing', 'past_due')
    WHERE u.id = user_uuid
    ORDER BY cs.created_at DESC
    LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_trial_status(p_user_id uuid)
 RETURNS TABLE(is_in_trial boolean, is_trial_expired boolean, is_in_grace_period boolean, days_until_trial_end integer, trial_end_date timestamp with time zone, has_active_subscription boolean, is_read_only boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user RECORD;
  v_grace_period_days INTEGER := 7;
BEGIN
  -- Clients may read only their own status (admins any user); service callers are unrestricted.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Not allowed to read another user''s billing status' USING ERRCODE = '42501';
  END IF;
  -- Get user data
  SELECT 
    u.trial_ends_at,
    u.subscription_status,
    EXISTS(
      SELECT 1 FROM customer_subscriptions cs
      WHERE cs.user_id = u.id
      AND cs.status = 'active'
    ) as has_active_sub
  INTO v_user
  FROM users u
  WHERE u.id = p_user_id;

  -- Calculate trial status
  RETURN QUERY
  SELECT
    -- Is in trial
    CASE 
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at > NOW() THEN TRUE
      ELSE FALSE
    END as is_in_trial,
    
    -- Is trial expired (past grace period)
    CASE
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at + (v_grace_period_days || ' days')::INTERVAL < NOW() THEN TRUE
      ELSE FALSE
    END as is_trial_expired,
    
    -- Is in grace period
    CASE
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at < NOW() 
        AND v_user.trial_ends_at + (v_grace_period_days || ' days')::INTERVAL >= NOW() THEN TRUE
      ELSE FALSE
    END as is_in_grace_period,
    
    -- Days until trial end
    CASE
      WHEN v_user.trial_ends_at IS NULL THEN 0
      WHEN v_user.has_active_sub THEN 0
      ELSE GREATEST(0, EXTRACT(DAY FROM v_user.trial_ends_at - NOW())::INTEGER)
    END as days_until_trial_end,
    
    -- Trial end date
    v_user.trial_ends_at,
    
    -- Has active subscription
    v_user.has_active_sub,
    
    -- Is read only (trial expired or in grace period without subscription)
    CASE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.trial_ends_at < NOW() THEN TRUE
      ELSE FALSE
    END as is_read_only;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
