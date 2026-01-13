-- packages/shared-types/src/functions/queue_sms_message.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.queue_sms_message(p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority DEFAULT 'normal'::sms_priority, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_message_id UUID;
  v_job_id UUID;
  v_queue_priority INTEGER;
BEGIN
  -- Convert priority to numeric value for queue
  v_queue_priority := CASE p_priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 5
    WHEN 'normal' THEN 10
    WHEN 'low' THEN 20
  END;

  -- Create SMS message record
  INSERT INTO sms_messages (
    user_id,
    phone_number,
    message_content,
    priority,
    scheduled_for,
    metadata,
    status
  ) VALUES (
    p_user_id,
    p_phone_number,
    p_message,
    p_priority,
    p_scheduled_for,
    p_metadata,
    CASE
      WHEN p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW()
      THEN 'scheduled'::sms_status
      ELSE 'pending'::sms_status
    END
  ) RETURNING id INTO v_message_id;

  -- Queue the job if it should be sent now or soon
  IF p_scheduled_for IS NULL OR p_scheduled_for <= NOW() + INTERVAL '5 minutes' THEN
    -- Use existing add_queue_job function
    v_job_id := add_queue_job(
      p_user_id := p_user_id,
      p_job_type := 'send_sms',
      p_metadata := jsonb_build_object(
        'message_id', v_message_id,
        'phone_number', p_phone_number,
        'message', p_message,
        'priority', p_priority
      ),
      p_scheduled_for := COALESCE(p_scheduled_for, NOW()),
      p_priority := v_queue_priority
    );

    -- Update message with queue job reference
    UPDATE sms_messages
    SET queue_job_id = v_job_id, status = 'queued'::sms_status
    WHERE id = v_message_id;
  END IF;

  RETURN v_message_id;
END;
$function$
