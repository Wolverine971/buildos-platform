-- packages/shared-types/src/functions/get_user_trial_status.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_user_trial_status(p_user_id uuid)
 RETURNS TABLE(is_in_trial boolean, is_trial_expired boolean, is_in_grace_period boolean, days_until_trial_end integer, trial_end_date timestamp with time zone, has_active_subscription boolean, is_read_only boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user RECORD;
  v_grace_period_days INTEGER := 7;
BEGIN
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
$function$
