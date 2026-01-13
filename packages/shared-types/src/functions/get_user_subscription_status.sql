-- packages/shared-types/src/functions/get_user_subscription_status.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_user_subscription_status(user_uuid uuid)
 RETURNS TABLE(has_subscription boolean, subscription_status text, current_period_end timestamp with time zone, is_beta_user boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
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
$function$
