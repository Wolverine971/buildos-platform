-- supabase/migrations/20260729010000_fix_sms_job_payload_contract.sql
-- Repair the notification SMS queue contract.
--
-- queue_sms_message stores user_id on queue_jobs, but its worker consumes the
-- metadata object. Include the same canonical ID there and retain caller
-- metadata (notification delivery/event/correlation IDs) for end-to-end trace.

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
	v_queue_priority := CASE p_priority
		WHEN 'urgent' THEN 1
		WHEN 'high' THEN 5
		WHEN 'normal' THEN 10
		WHEN 'low' THEN 20
	END;

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

	IF p_scheduled_for IS NULL OR p_scheduled_for <= NOW() + INTERVAL '5 minutes' THEN
		v_job_id := add_queue_job(
			p_user_id := p_user_id,
			p_job_type := 'send_sms',
			p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
				'message_id', v_message_id,
				'phone_number', p_phone_number,
				'message', p_message,
				'user_id', p_user_id,
				'priority', p_priority
			),
			p_scheduled_for := COALESCE(p_scheduled_for, NOW()),
			p_priority := v_queue_priority
		);

		UPDATE sms_messages
		SET queue_job_id = v_job_id, status = 'queued'::sms_status
		WHERE id = v_message_id;
	END IF;

	RETURN v_message_id;
END;
$function$;

COMMENT ON FUNCTION public.queue_sms_message(uuid, text, text, sms_priority, timestamptz, jsonb) IS
'Creates an SMS record and queues a send_sms job whose metadata includes the canonical user_id and caller trace context.';
