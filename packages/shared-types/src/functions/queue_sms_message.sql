-- packages/shared-types/src/functions/queue_sms_message.sql
-- queue_sms_message(uuid, text, text, timestamptz, sms_priority, jsonb)
-- Queue an SMS message for sending
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION queue_sms_message(
  p_user_id uuid,
  p_phone_number text,
  p_message text,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_priority sms_priority DEFAULT 'normal',
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_id uuid;
BEGIN
  INSERT INTO sms_messages (
    user_id,
    phone_number,
    message,
    scheduled_for,
    priority,
    metadata,
    status,
    created_at
  )
  VALUES (
    p_user_id,
    p_phone_number,
    p_message,
    COALESCE(p_scheduled_for, NOW()),
    p_priority,
    COALESCE(p_metadata, '{}'::jsonb),
    'scheduled',
    NOW()
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;
