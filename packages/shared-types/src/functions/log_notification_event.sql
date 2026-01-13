-- packages/shared-types/src/functions/log_notification_event.sql
-- log_notification_event(text, text, text, uuid, uuid, uuid, uuid, jsonb, jsonb)
-- Log a notification event
-- Source: apps/web/supabase/migrations/20251011_add_notification_logging_helper.sql

CREATE OR REPLACE FUNCTION log_notification_event(
  p_level TEXT,
  p_message TEXT,
  p_namespace TEXT DEFAULT 'db_function',
  p_correlation_id UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_delivery_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS void AS $$
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
    p_context || p_metadata,
    NOW()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the transaction if logging fails
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
