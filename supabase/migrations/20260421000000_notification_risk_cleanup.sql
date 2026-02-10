-- supabase/migrations/20260421000000_notification_risk_cleanup.sql
-- Cleanup migration for notification preference/schema drift and SMS linkage consistency.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_notification_active_subscriptions()
 RETURNS TABLE(
	user_id uuid,
	email text,
	name text,
	subscribed_events text[],
	push_enabled boolean,
	email_enabled boolean,
	sms_enabled boolean,
	in_app_enabled boolean,
	last_notification_sent timestamp with time zone
 )
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email,
    u.name,
    ARRAY_AGG(DISTINCT ns.event_type) AS subscribed_events,
    COALESCE(BOOL_OR(unp.push_enabled), false) AS push_enabled,
    COALESCE(BOOL_OR(unp.email_enabled), false) AS email_enabled,
    COALESCE(BOOL_OR(unp.sms_enabled), false) AS sms_enabled,
    COALESCE(BOOL_OR(unp.in_app_enabled), false) AS in_app_enabled,
    MAX(nd.created_at) AS last_notification_sent
  FROM users u
  JOIN notification_subscriptions ns ON ns.user_id = u.id
  LEFT JOIN user_notification_preferences unp ON unp.user_id = u.id
  LEFT JOIN notification_deliveries nd ON nd.recipient_user_id = u.id
  WHERE ns.is_active = true
  GROUP BY u.id, u.email, u.name
  ORDER BY last_notification_sent DESC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_sms_message(
	p_user_id uuid,
	p_phone_number text,
	p_message text,
	p_priority sms_priority DEFAULT 'normal'::sms_priority,
	p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone,
	p_metadata jsonb DEFAULT '{}'::jsonb
)
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
    notification_delivery_id,
    metadata,
    status
  ) VALUES (
    p_user_id,
    p_phone_number,
    p_message,
    p_priority,
    p_scheduled_for,
    CASE
      WHEN (p_metadata ? 'notification_delivery_id')
        AND (p_metadata->>'notification_delivery_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (p_metadata->>'notification_delivery_id')::uuid
      ELSE NULL
    END,
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
$function$;

DROP INDEX IF EXISTS idx_user_notification_preferences_user_event;
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id
	ON user_notification_preferences(user_id);

COMMIT;
