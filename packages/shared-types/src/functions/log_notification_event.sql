-- packages/shared-types/src/functions/log_notification_event.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.log_notification_event(p_level text, p_message text, p_namespace text DEFAULT 'db_function'::text, p_correlation_id uuid DEFAULT NULL::uuid, p_event_id uuid DEFAULT NULL::uuid, p_delivery_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Insert log entry into notification_logs table
  -- Note: This is non-blocking and won't fail the transaction if logging fails
  INSERT INTO notification_logs (
    level,
    message,
    namespace,
    correlation_id,
    notification_event_id,
    notification_delivery_id,
    user_id,
    metadata,
    created_at
  ) VALUES (
    p_level,
    p_message,
    p_namespace,
    p_correlation_id,
    p_event_id,
    p_delivery_id,
    p_user_id,
    p_context || p_metadata,  -- Merge context and metadata
    NOW()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the transaction if logging fails
    -- Just silently continue (logging is best-effort)
    NULL;
END;
$function$
