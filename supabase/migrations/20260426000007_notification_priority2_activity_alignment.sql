-- supabase/migrations/20260426000007_notification_priority2_activity_alignment.sql
-- Priority 2: align project-activity batching with notification_subscriptions contract

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
	v_preferences record;
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

	-- Project activity batching now honors the explicit subscription model.
	IF v_subscription_id IS NULL THEN
		RETURN v_event_id;
	END IF;

	SELECT *
	INTO v_preferences
	FROM user_notification_preferences
	WHERE user_id = p_recipient_user_id;

	IF NOT FOUND THEN
		RETURN v_event_id;
	END IF;

	IF COALESCE(v_preferences.in_app_enabled, false) THEN
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
	END IF;

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
		COALESCE(v_preferences.push_enabled, false)
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

CREATE OR REPLACE FUNCTION public.queue_project_activity_notification_batch(
	p_project_id uuid,
	p_actor_user_id uuid DEFAULT NULL,
	p_actor_actor_id uuid DEFAULT NULL,
	p_entity_type text DEFAULT NULL,
	p_action text DEFAULT NULL,
	p_occurred_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_props jsonb;
	v_notifications jsonb;
	v_shared jsonb;
	v_overrides jsonb;
	v_owner_actor_id uuid;
	v_member_count integer := 0;
	v_is_shared boolean := false;
	v_default_enabled boolean := false;
	v_window_start timestamptz;
	v_window_end timestamptz;
	v_action_key text;
	v_batch_id uuid;
	v_actor_user_id uuid := p_actor_user_id;
	v_member_enabled boolean;
	v_job_id uuid;
	rec record;
BEGIN
	IF p_project_id IS NULL THEN
		RETURN;
	END IF;

	IF v_actor_user_id IS NULL AND p_actor_actor_id IS NOT NULL THEN
		SELECT user_id
		INTO v_actor_user_id
		FROM onto_actors
		WHERE id = p_actor_actor_id;
	END IF;

	SELECT props, created_by
	INTO v_props, v_owner_actor_id
	FROM onto_projects
	WHERE id = p_project_id
		AND deleted_at IS NULL;

	IF NOT FOUND THEN
		RETURN;
	END IF;

	SELECT COUNT(DISTINCT m.actor_id)
	INTO v_member_count
	FROM onto_project_members m
	WHERE m.project_id = p_project_id
		AND m.removed_at IS NULL;

	IF v_owner_actor_id IS NOT NULL AND NOT EXISTS (
		SELECT 1
		FROM onto_project_members m
		WHERE m.project_id = p_project_id
			AND m.actor_id = v_owner_actor_id
			AND m.removed_at IS NULL
	) THEN
		v_member_count := v_member_count + 1;
	END IF;

	v_is_shared := v_member_count > 1;
	v_props := COALESCE(v_props, '{}'::jsonb);
	v_notifications := CASE
		WHEN jsonb_typeof(v_props->'notifications') = 'object' THEN v_props->'notifications'
		ELSE '{}'::jsonb
	END;
	v_shared := CASE
		WHEN jsonb_typeof(v_notifications->'shared_project_activity') = 'object'
			THEN v_notifications->'shared_project_activity'
		ELSE '{}'::jsonb
	END;
	v_overrides := CASE
		WHEN jsonb_typeof(v_shared->'member_overrides') = 'object'
			THEN v_shared->'member_overrides'
		ELSE '{}'::jsonb
	END;

	v_default_enabled := CASE
		WHEN jsonb_typeof(v_shared->'enabled_by_default') = 'boolean'
			THEN (v_shared->>'enabled_by_default')::boolean
		ELSE v_is_shared
	END;

	v_window_start := to_timestamp(
		floor(extract(epoch from COALESCE(p_occurred_at, NOW())) / 300) * 300
	);
	v_window_end := v_window_start + INTERVAL '5 minutes';
	v_action_key := format(
		'%s.%s',
		COALESCE(NULLIF(lower(trim(p_entity_type)), ''), 'project'),
		COALESCE(NULLIF(lower(trim(p_action)), ''), 'updated')
	);

	FOR rec IN
		WITH actor_set AS (
			SELECT m.actor_id
			FROM onto_project_members m
			WHERE m.project_id = p_project_id
				AND m.removed_at IS NULL
			UNION
			SELECT v_owner_actor_id
		)
		SELECT DISTINCT
			a.id AS actor_id,
			a.user_id
		FROM actor_set s
		JOIN onto_actors a ON a.id = s.actor_id
		WHERE s.actor_id IS NOT NULL
			AND a.user_id IS NOT NULL
			AND (p_actor_actor_id IS NULL OR a.id <> p_actor_actor_id)
			AND (v_actor_user_id IS NULL OR a.user_id <> v_actor_user_id)
	LOOP
		v_member_enabled := CASE
			WHEN v_overrides ? rec.actor_id::text
				THEN COALESCE((v_overrides->>rec.actor_id::text)::boolean, v_default_enabled)
			ELSE v_default_enabled
		END;

		IF v_member_enabled IS NOT TRUE THEN
			CONTINUE;
		END IF;

		-- Keep explicit subscription state synchronized with project-level activity enablement.
		INSERT INTO notification_subscriptions (
			user_id,
			event_type,
			is_active,
			admin_only,
			created_by,
			updated_at
		)
		VALUES (
			rec.user_id,
			'project.activity.batched',
			true,
			false,
			COALESCE(v_actor_user_id, rec.user_id),
			NOW()
		)
		ON CONFLICT (user_id, event_type)
		DO UPDATE SET
			is_active = true,
			admin_only = false,
			created_by = COALESCE(notification_subscriptions.created_by, EXCLUDED.created_by),
			updated_at = NOW();

		INSERT INTO project_notification_batches (
			project_id,
			recipient_user_id,
			window_start,
			window_end,
			flush_after,
			status,
			event_count,
			action_counts,
			actor_counts,
			latest_event_at,
			created_at,
			updated_at
		)
		VALUES (
			p_project_id,
			rec.user_id,
			v_window_start,
			v_window_end,
			v_window_end,
			'pending',
			1,
			jsonb_build_object(v_action_key, 1),
			CASE
				WHEN v_actor_user_id IS NOT NULL THEN jsonb_build_object(v_actor_user_id::text, 1)
				ELSE '{}'::jsonb
			END,
			COALESCE(p_occurred_at, NOW()),
			NOW(),
			NOW()
		)
		ON CONFLICT (recipient_user_id, project_id, window_start)
		DO UPDATE SET
			event_count = project_notification_batches.event_count + 1,
			action_counts = jsonb_increment_counter(
				project_notification_batches.action_counts,
				v_action_key,
				1
			),
			actor_counts = CASE
				WHEN v_actor_user_id IS NULL THEN project_notification_batches.actor_counts
				ELSE jsonb_increment_counter(
					project_notification_batches.actor_counts,
					v_actor_user_id::text,
					1
				)
			END,
			latest_event_at = GREATEST(
				COALESCE(project_notification_batches.latest_event_at, EXCLUDED.latest_event_at),
				EXCLUDED.latest_event_at
			),
			flush_after = GREATEST(
				COALESCE(project_notification_batches.flush_after, EXCLUDED.flush_after),
				EXCLUDED.flush_after
			),
			status = CASE
				WHEN project_notification_batches.status IN ('flushed', 'failed') THEN 'pending'
				ELSE project_notification_batches.status
			END,
			last_error = NULL,
			updated_at = NOW()
		RETURNING id INTO v_batch_id;

		v_job_id := add_queue_job(
			p_user_id => rec.user_id,
			p_job_type => 'project_activity_batch_flush',
			p_metadata => jsonb_build_object(
				'batch_id', v_batch_id,
				'recipient_user_id', rec.user_id,
				'project_id', p_project_id
			),
			p_priority => 8,
			p_scheduled_for => v_window_end,
			p_dedup_key => format('project_activity_batch_flush:%s', v_batch_id)
		);
	END LOOP;
END;
$function$;

COMMIT;
