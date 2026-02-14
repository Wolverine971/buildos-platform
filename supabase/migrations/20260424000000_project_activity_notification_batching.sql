-- supabase/migrations/20260424000000_project_activity_notification_batching.sql
-- Phase 3: Shared project activity batching + flush pipeline

-- Queue type for batch flush jobs
DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'project_activity_batch_flush';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- Extend allowed notification event types
ALTER TABLE notification_events
	DROP CONSTRAINT IF EXISTS notification_events_event_type_check;

ALTER TABLE notification_events
	ADD CONSTRAINT notification_events_event_type_check
	CHECK (event_type IN (
		'user.signup',
		'user.trial_expired',
		'payment.failed',
		'error.critical',
		'brief.completed',
		'brief.failed',
		'brain_dump.processed',
		'task.due_soon',
		'project.phase_scheduled',
		'calendar.sync_failed',
		'project.invite.accepted',
		'project.activity.changed',
		'project.activity.batched'
	));

CREATE TABLE IF NOT EXISTS project_notification_batches (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
	recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	window_start timestamptz NOT NULL,
	window_end timestamptz NOT NULL,
	flush_after timestamptz NOT NULL,
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'processing', 'flushed', 'failed')),
	event_count integer NOT NULL DEFAULT 0,
	action_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
	actor_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
	latest_event_at timestamptz NOT NULL DEFAULT now(),
	flushed_at timestamptz,
	flushed_event_id uuid REFERENCES notification_events(id) ON DELETE SET NULL,
	last_error text,
	attempts integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (recipient_user_id, project_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_project_notification_batches_pending
	ON project_notification_batches(status, flush_after)
	WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_project_notification_batches_recipient
	ON project_notification_batches(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_notification_batches_project
	ON project_notification_batches(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.jsonb_increment_counter(
	p_counts jsonb,
	p_key text,
	p_increment integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
	v_counts jsonb := COALESCE(p_counts, '{}'::jsonb);
	v_current integer := 0;
	v_increment integer := COALESCE(p_increment, 1);
BEGIN
	IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
		RETURN v_counts;
	END IF;

	BEGIN
		v_current := COALESCE((v_counts->>p_key)::integer, 0);
	EXCEPTION
		WHEN invalid_text_representation THEN
			v_current := 0;
	END;

	RETURN jsonb_set(v_counts, ARRAY[p_key], to_jsonb(v_current + v_increment), true);
END;
$function$;

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
			recipient_user_id,
			channel,
			payload,
			status,
			correlation_id
		)
		VALUES (
			v_event_id,
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
				recipient_user_id,
				channel,
				channel_identifier,
				payload,
				status,
				correlation_id
			)
			VALUES (
				v_event_id,
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

CREATE OR REPLACE FUNCTION public.flush_project_activity_notification_batch(
	p_batch_id uuid
)
RETURNS TABLE(
	batch_id uuid,
	status text,
	event_id uuid,
	message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_batch project_notification_batches%ROWTYPE;
	v_project_name text;
	v_top_action_key text;
	v_top_action_count integer := 0;
	v_entity_label text := 'project';
	v_action_label text := 'updated';
	v_actor_names text[];
	v_actor_user_ids text[];
	v_actor_count integer := 0;
	v_lead_actor text := 'A teammate';
	v_primary_actor_user_id uuid;
	v_primary_actor_user_id_text text;
	v_title text;
	v_body text;
	v_payload jsonb;
	v_event_id uuid;
	v_correlation_id uuid := gen_random_uuid();
BEGIN
	IF p_batch_id IS NULL THEN
		RETURN QUERY SELECT NULL::uuid, 'invalid', NULL::uuid, 'Batch ID required';
		RETURN;
	END IF;

	SELECT *
	INTO v_batch
	FROM project_notification_batches
	WHERE id = p_batch_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT p_batch_id, 'missing', NULL::uuid, 'Batch not found';
		RETURN;
	END IF;

	IF v_batch.status = 'flushed' THEN
		RETURN QUERY SELECT v_batch.id, 'already_flushed', v_batch.flushed_event_id, 'Batch already flushed';
		RETURN;
	END IF;

	IF v_batch.event_count <= 0 THEN
		UPDATE project_notification_batches
		SET
			status = 'failed',
			last_error = 'Batch has no events',
			updated_at = NOW()
		WHERE id = v_batch.id;

		RETURN QUERY SELECT v_batch.id, 'failed', NULL::uuid, 'Batch has no events';
		RETURN;
	END IF;

	UPDATE project_notification_batches
	SET
		status = 'processing',
		attempts = attempts + 1,
		updated_at = NOW()
	WHERE id = v_batch.id;

	SELECT name
	INTO v_project_name
	FROM onto_projects
	WHERE id = v_batch.project_id;

	v_project_name := COALESCE(NULLIF(v_project_name, ''), 'this project');

	SELECT key, (value)::integer
	INTO v_top_action_key, v_top_action_count
	FROM jsonb_each_text(COALESCE(v_batch.action_counts, '{}'::jsonb))
	ORDER BY (value)::integer DESC, key ASC
	LIMIT 1;

	IF v_top_action_key IS NOT NULL THEN
		v_entity_label := replace(COALESCE(NULLIF(split_part(v_top_action_key, '.', 1), ''), 'project'), '_', ' ');
		v_action_label := replace(COALESCE(NULLIF(split_part(v_top_action_key, '.', 2), ''), 'updated'), '_', ' ');
	END IF;

	WITH actor_rank AS (
		SELECT
			key::uuid AS user_id,
			(value)::integer AS actor_events
		FROM jsonb_each_text(COALESCE(v_batch.actor_counts, '{}'::jsonb))
		WHERE key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
	)
	SELECT
		array_agg(COALESCE(NULLIF(u.name, ''), u.email) ORDER BY ar.actor_events DESC, ar.user_id::text),
		array_agg(ar.user_id::text ORDER BY ar.actor_events DESC, ar.user_id::text)
	INTO v_actor_names, v_actor_user_ids
	FROM actor_rank ar
	LEFT JOIN users u ON u.id = ar.user_id;

	v_actor_count := COALESCE(array_length(v_actor_names, 1), 0);
	IF v_actor_count > 0 THEN
		v_lead_actor := v_actor_names[1];
	END IF;

	IF v_actor_user_ids IS NOT NULL
		AND array_length(v_actor_user_ids, 1) > 0
		AND v_actor_user_ids[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
	THEN
		v_primary_actor_user_id := v_actor_user_ids[1]::uuid;
	END IF;

	IF v_batch.event_count = 1 THEN
		v_title := format('%s activity in %s', v_lead_actor, v_project_name);
		v_body := format('%s %s %s in %s', v_lead_actor, v_action_label, v_entity_label, v_project_name);
	ELSE
		IF v_actor_count > 1 THEN
			v_title := format('%s and %s others updated %s', v_lead_actor, v_actor_count - 1, v_project_name);
		ELSE
			v_title := format('%s updated %s', v_lead_actor, v_project_name);
		END IF;

		v_body := format('%s teammate updates in %s', v_batch.event_count, v_project_name);
	END IF;

	v_payload := jsonb_build_object(
		'title', v_title,
		'body', v_body,
		'action_url', format('/projects/%s', v_batch.project_id),
		'event_type', 'project.activity.batched',
		'tag', format('project:%s:activity', v_batch.project_id),
		'project_id', v_batch.project_id::text,
		'project_name', v_project_name,
		'event_count', v_batch.event_count,
		'action_counts', COALESCE(v_batch.action_counts, '{}'::jsonb),
		'actor_counts', COALESCE(v_batch.actor_counts, '{}'::jsonb),
		'window_start', v_batch.window_start,
		'window_end', v_batch.window_end,
		'data', jsonb_build_object(
			'url', format('/projects/%s', v_batch.project_id),
			'project_id', v_batch.project_id::text,
			'batch_id', v_batch.id::text,
			'thread_id', format('project:%s', v_batch.project_id)
		)
	);

	v_event_id := emit_project_activity_batched_event(
		p_recipient_user_id => v_batch.recipient_user_id,
		p_project_id => v_batch.project_id,
		p_payload => v_payload,
		p_metadata => jsonb_build_object(
			'correlationId', v_correlation_id,
			'batchId', v_batch.id,
			'projectId', v_batch.project_id,
			'recipientUserId', v_batch.recipient_user_id
		),
		p_actor_user_id => v_primary_actor_user_id
	);

	UPDATE project_notification_batches
	SET
		status = 'flushed',
		flushed_event_id = v_event_id,
		flushed_at = NOW(),
		last_error = NULL,
		updated_at = NOW()
	WHERE id = v_batch.id;

	RETURN QUERY SELECT v_batch.id, 'flushed', v_event_id, 'Batch flushed';
EXCEPTION
	WHEN OTHERS THEN
		UPDATE project_notification_batches
		SET
			status = 'failed',
			last_error = SQLERRM,
			updated_at = NOW()
		WHERE id = p_batch_id;

		RETURN QUERY SELECT p_batch_id, 'failed', NULL::uuid, SQLERRM;
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

CREATE OR REPLACE FUNCTION public.trg_queue_project_activity_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_project_name text;
BEGIN
	SELECT p.name
	INTO v_project_name
	FROM onto_projects p
	WHERE p.id = NEW.project_id;

	INSERT INTO notification_events (
		event_type,
		event_source,
		actor_user_id,
		target_user_id,
		payload,
		metadata
	)
	VALUES (
		'project.activity.changed',
		'database_trigger',
		NEW.changed_by,
		NULL,
		jsonb_build_object(
			'project_id', NEW.project_id::text,
			'project_name', COALESCE(v_project_name, ''),
			'actor_user_id', CASE WHEN NEW.changed_by IS NULL THEN NULL ELSE NEW.changed_by::text END,
			'action_type', format(
				'%s.%s',
				COALESCE(NULLIF(lower(trim(NEW.entity_type)), ''), 'project'),
				COALESCE(NULLIF(lower(trim(NEW.action)), ''), 'updated')
			),
			'entity_id', CASE WHEN NEW.entity_id IS NULL THEN NULL ELSE NEW.entity_id::text END,
			'entity_type', NEW.entity_type,
			'occurred_at', COALESCE(NEW.created_at, NOW())
		),
		jsonb_build_object(
			'project_log_id', NEW.id,
			'project_id', NEW.project_id,
			'entity_type', NEW.entity_type,
			'action', NEW.action
		)
	);

	PERFORM queue_project_activity_notification_batch(
		p_project_id => NEW.project_id,
		p_actor_user_id => NEW.changed_by,
		p_actor_actor_id => NEW.changed_by_actor_id,
		p_entity_type => NEW.entity_type,
		p_action => NEW.action,
		p_occurred_at => NEW.created_at
	);

	RETURN NEW;
EXCEPTION
	WHEN OTHERS THEN
		RAISE WARNING '[trg_queue_project_activity_batch] Failed for log %: %', NEW.id, SQLERRM;
		RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_queue_project_activity_batch ON onto_project_logs;
CREATE TRIGGER trg_queue_project_activity_batch
	AFTER INSERT ON onto_project_logs
	FOR EACH ROW
	EXECUTE FUNCTION public.trg_queue_project_activity_batch();

GRANT EXECUTE ON FUNCTION public.emit_project_activity_batched_event(uuid, uuid, jsonb, jsonb, uuid)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.flush_project_activity_notification_batch(uuid)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_project_activity_notification_batch(uuid, uuid, uuid, text, text, timestamptz)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_project_activity_notification_batch(uuid, uuid, uuid, text, text, timestamptz)
	TO authenticated;

COMMENT ON TABLE project_notification_batches IS
	'Batched shared-project activity notifications keyed by recipient/project/time window.';

COMMENT ON FUNCTION public.queue_project_activity_notification_batch(uuid, uuid, uuid, text, text, timestamptz) IS
	'Upserts 5-minute shared-project activity batches for eligible recipients and enqueues flush jobs.';

COMMENT ON FUNCTION public.flush_project_activity_notification_batch(uuid) IS
	'Flushes one project activity batch into notification_events + deliveries.';
