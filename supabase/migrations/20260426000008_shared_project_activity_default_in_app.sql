-- supabase/migrations/20260426000008_shared_project_activity_default_in_app.sql
-- Ensure shared-project activity notifications appear in /notifications by default.
-- Push remains preference-gated; in-app delivery is always created when
-- project-level shared-activity notification settings include the recipient.

BEGIN;

CREATE OR REPLACE FUNCTION public.emit_project_activity_batched_event(
	p_recipient_user_id uuid,
	p_project_id uuid,
	p_payload jsonb,
	p_metadata jsonb DEFAULT '{}'::jsonb,
	p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_event_id uuid;
	v_delivery_id uuid;
	v_queue_job_id text;
	v_correlation_id uuid;
	v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
	v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
	v_subscription_id uuid;
	v_push_enabled boolean := false;
	v_push_subscription record;
	v_max_push_per_hour integer := 6;
	v_max_push_per_day integer := 30;
	v_push_last_10 integer := 0;
	v_push_last_hour integer := 0;
	v_push_last_day integer := 0;
	v_allow_push boolean := false;
	v_push_hour_setting text;
	v_push_day_setting text;
BEGIN
	IF p_recipient_user_id IS NULL OR p_project_id IS NULL THEN
		RAISE EXCEPTION 'Recipient user and project are required';
	END IF;

	v_correlation_id := CASE
		WHEN (v_metadata ? 'correlationId')
			AND (v_metadata->>'correlationId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
			THEN (v_metadata->>'correlationId')::uuid
		ELSE gen_random_uuid()
	END;

	v_payload := jsonb_set(v_payload, '{event_type}', to_jsonb('project.activity.batched'::text), true);
	v_payload := jsonb_set(v_payload, '{project_id}', to_jsonb(p_project_id::text), true);
	v_metadata := v_metadata || jsonb_build_object('correlationId', v_correlation_id);

	INSERT INTO notification_events (
		event_type,
		event_source,
		actor_user_id,
		target_user_id,
		payload,
		metadata,
		correlation_id
	)
	VALUES (
		'project.activity.batched',
		'api_action',
		p_actor_user_id,
		p_recipient_user_id,
		v_payload,
		v_metadata,
		v_correlation_id
	)
	RETURNING id INTO v_event_id;

	SELECT ns.id
	INTO v_subscription_id
	FROM notification_subscriptions ns
	WHERE ns.user_id = p_recipient_user_id
		AND ns.event_type = 'project.activity.batched'
		AND ns.is_active = true
	ORDER BY ns.updated_at DESC
	LIMIT 1;

	-- Shared project activity is opt-in by project settings + active subscription.
	IF v_subscription_id IS NULL THEN
		RETURN v_event_id;
	END IF;

	-- In-app delivery is always created for shared-project activity once opted in at project scope.
	INSERT INTO notification_deliveries (
		event_id,
		subscription_id,
		recipient_user_id,
		channel,
		payload,
		status,
		correlation_id
	)
	VALUES (
		v_event_id,
		v_subscription_id,
		p_recipient_user_id,
		'in_app',
		v_payload,
		'pending',
		v_correlation_id
	)
	RETURNING id INTO v_delivery_id;

	v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;
	INSERT INTO queue_jobs (
		user_id,
		job_type,
		status,
		scheduled_for,
		queue_job_id,
		metadata
	)
	VALUES (
		p_recipient_user_id,
		'send_notification',
		'pending',
		NOW(),
		v_queue_job_id,
		jsonb_build_object(
			'event_id', v_event_id,
			'event_type', 'project.activity.batched',
			'delivery_id', v_delivery_id,
			'channel', 'in_app',
			'correlationId', v_correlation_id
		)
	);

	-- Push continues to honor user-level push preferences.
	SELECT COALESCE(push_enabled, false)
	INTO v_push_enabled
	FROM user_notification_preferences
	WHERE user_id = p_recipient_user_id;

	SELECT
		props->'notifications'->'shared_project_activity'->>'max_push_per_hour',
		props->'notifications'->'shared_project_activity'->>'max_push_per_day'
	INTO v_push_hour_setting, v_push_day_setting
	FROM onto_projects
	WHERE id = p_project_id;

	IF v_push_hour_setting ~ '^[0-9]+$' THEN
		v_max_push_per_hour := GREATEST(1, LEAST(60, v_push_hour_setting::integer));
	END IF;

	IF v_push_day_setting ~ '^[0-9]+$' THEN
		v_max_push_per_day := GREATEST(1, LEAST(200, v_push_day_setting::integer));
	END IF;

	SELECT COUNT(*)
	INTO v_push_last_10
	FROM notification_deliveries nd
	JOIN notification_events ne ON ne.id = nd.event_id
	WHERE nd.recipient_user_id = p_recipient_user_id
		AND nd.channel = 'push'
		AND ne.event_type = 'project.activity.batched'
		AND (nd.payload->>'project_id') = p_project_id::text
		AND nd.created_at >= NOW() - INTERVAL '10 minutes';

	SELECT COUNT(*)
	INTO v_push_last_hour
	FROM notification_deliveries nd
	JOIN notification_events ne ON ne.id = nd.event_id
	WHERE nd.recipient_user_id = p_recipient_user_id
		AND nd.channel = 'push'
		AND ne.event_type = 'project.activity.batched'
		AND (nd.payload->>'project_id') = p_project_id::text
		AND nd.created_at >= NOW() - INTERVAL '1 hour';

	SELECT COUNT(*)
	INTO v_push_last_day
	FROM notification_deliveries nd
	JOIN notification_events ne ON ne.id = nd.event_id
	WHERE nd.recipient_user_id = p_recipient_user_id
		AND nd.channel = 'push'
		AND ne.event_type = 'project.activity.batched'
		AND (nd.payload->>'project_id') = p_project_id::text
		AND nd.created_at >= NOW() - INTERVAL '1 day';

	v_allow_push :=
		v_push_enabled
		AND v_push_last_10 < 1
		AND v_push_last_hour < v_max_push_per_hour
		AND v_push_last_day < v_max_push_per_day;

	IF v_allow_push THEN
		FOR v_push_subscription IN
			SELECT *
			FROM push_subscriptions
			WHERE user_id = p_recipient_user_id
				AND is_active = true
		LOOP
			INSERT INTO notification_deliveries (
				event_id,
				subscription_id,
				recipient_user_id,
				channel,
				channel_identifier,
				payload,
				status,
				correlation_id
			)
			VALUES (
				v_event_id,
				v_subscription_id,
				p_recipient_user_id,
				'push',
				v_push_subscription.endpoint,
				v_payload,
				'pending',
				v_correlation_id
			)
			RETURNING id INTO v_delivery_id;

			v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;
			INSERT INTO queue_jobs (
				user_id,
				job_type,
				status,
				scheduled_for,
				queue_job_id,
				metadata
			)
			VALUES (
				p_recipient_user_id,
				'send_notification',
				'pending',
				NOW(),
				v_queue_job_id,
				jsonb_build_object(
					'event_id', v_event_id,
					'event_type', 'project.activity.batched',
					'delivery_id', v_delivery_id,
					'channel', 'push',
					'correlationId', v_correlation_id
				)
			);
		END LOOP;
	END IF;

	RETURN v_event_id;
END;
$function$;

COMMIT;
