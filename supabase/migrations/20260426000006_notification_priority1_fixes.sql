-- supabase/migrations/20260426000006_notification_priority1_fixes.sql
-- Priority-1 notification fixes:
-- 1) add explicit cancelled delivery status
-- 2) lifecycle-safe notification analytics denominators
-- 3) atomic SMS daily rate-limit check/increment RPC

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
			AND t.typname = 'notification_status'
	) THEN
		ALTER TYPE public.notification_status
			ADD VALUE IF NOT EXISTS 'cancelled';
	END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.check_and_increment_sms_daily_limit(
	p_user_id uuid,
	p_increment integer DEFAULT 1,
	p_default_limit integer DEFAULT 10,
	p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE(
	allowed boolean,
	current_count integer,
	"limit" integer,
	reset_at timestamp with time zone,
	reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_limit integer;
	v_current_count integer;
	v_reset_at timestamp with time zone;
	v_needs_reset boolean := false;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'User ID is required';
	END IF;

	IF p_increment IS NULL OR p_increment < 1 THEN
		RAISE EXCEPTION 'Increment must be >= 1';
	END IF;

	SELECT
		COALESCE(daily_sms_limit, p_default_limit),
		COALESCE(daily_sms_count, 0),
		daily_count_reset_at
	INTO v_limit, v_current_count, v_reset_at
	FROM user_sms_preferences
	WHERE user_id = p_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY
		SELECT
			false,
			NULL::integer,
			NULL::integer,
			NULL::timestamp with time zone,
			'SMS preferences not found'::text;
		RETURN;
	END IF;

	v_needs_reset := v_reset_at IS NULL
		OR ((v_reset_at AT TIME ZONE 'UTC')::date <> (p_now AT TIME ZONE 'UTC')::date);

	IF v_needs_reset THEN
		v_current_count := 0;
		v_reset_at := p_now;
	END IF;

	IF (v_current_count + p_increment) > v_limit THEN
		IF v_needs_reset THEN
			UPDATE user_sms_preferences
			SET
				daily_sms_count = 0,
				daily_count_reset_at = v_reset_at,
				updated_at = p_now
			WHERE user_id = p_user_id;
		END IF;

		RETURN QUERY
		SELECT
			false,
			v_current_count,
			v_limit,
			v_reset_at,
			format('Daily SMS limit reached (%s/%s)', v_current_count, v_limit);
		RETURN;
	END IF;

	UPDATE user_sms_preferences
	SET
		daily_sms_count = v_current_count + p_increment,
		daily_count_reset_at = COALESCE(v_reset_at, p_now),
		updated_at = p_now
	WHERE user_id = p_user_id
	RETURNING
		daily_sms_count,
		COALESCE(daily_sms_limit, p_default_limit),
		daily_count_reset_at
	INTO v_current_count, v_limit, v_reset_at;

	RETURN QUERY
	SELECT
		true,
		v_current_count,
		v_limit,
		v_reset_at,
		NULL::text;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_sms_daily_limit(
	uuid,
	integer,
	integer,
	timestamp with time zone
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_and_increment_sms_daily_limit(
	uuid,
	integer,
	integer,
	timestamp with time zone
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_notification_overview_metrics(
	p_interval text DEFAULT '7 days'::text,
	p_offset text DEFAULT NULL::text
)
RETURNS TABLE(
	total_sent bigint,
	delivery_success_rate numeric,
	avg_open_rate numeric,
	avg_click_rate numeric
)
LANGUAGE plpgsql
AS $function$
DECLARE
	v_start_time TIMESTAMPTZ;
	v_end_time TIMESTAMPTZ;
BEGIN
	IF p_offset IS NULL THEN
		v_end_time := NOW();
		v_start_time := NOW() - p_interval::INTERVAL;
	ELSE
		v_end_time := NOW() - p_offset::INTERVAL;
		v_start_time := v_end_time - p_interval::INTERVAL;
	END IF;

	RETURN QUERY
	SELECT
		COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked')) AS total_sent,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC
				/ NULLIF(
					COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced'))::NUMERIC,
					0
				)
				* 100
			),
			2
		) AS delivery_success_rate,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC
				/ NULLIF(
					COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC,
					0
				)
				* 100
			),
			2
		) AS avg_open_rate,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC
				/ NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0)
				* 100
			),
			2
		) AS avg_click_rate
	FROM notification_deliveries nd
	WHERE nd.created_at >= v_start_time
		AND nd.created_at < v_end_time;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_notification_channel_performance(
	p_interval text DEFAULT '7 days'::text
)
RETURNS TABLE(
	channel text,
	total_sent bigint,
	sent bigint,
	delivered bigint,
	opened bigint,
	clicked bigint,
	failed bigint,
	success_rate numeric,
	delivery_rate numeric,
	open_rate numeric,
	click_rate numeric,
	avg_delivery_time_ms numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
	RETURN QUERY
	SELECT
		nd.channel,
		COUNT(*) FILTER (WHERE nd.status <> 'cancelled') AS total_sent,
		COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked')) AS sent,
		COUNT(*) FILTER (WHERE nd.status IN ('delivered', 'opened', 'clicked')) AS delivered,
		COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
		COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
		COUNT(*) FILTER (WHERE nd.status IN ('failed', 'bounced')) AS failed,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC
				/ NULLIF(
					COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced'))::NUMERIC,
					0
				)
				* 100
			),
			2
		) AS success_rate,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.status IN ('delivered', 'opened', 'clicked'))::NUMERIC
				/ NULLIF(
					COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC,
					0
				)
				* 100
			),
			2
		) AS delivery_rate,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC
				/ NULLIF(
					COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC,
					0
				)
				* 100
			),
			2
		) AS open_rate,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC
				/ NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0)
				* 100
			),
			2
		) AS click_rate,
		ROUND(
			AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000)
				FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,
			2
		) AS avg_delivery_time_ms
	FROM notification_deliveries nd
	WHERE nd.created_at > NOW() - p_interval::INTERVAL
	GROUP BY nd.channel
	ORDER BY total_sent DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_notification_event_performance(
	p_interval text DEFAULT '30 days'::text
)
RETURNS TABLE(
	event_type text,
	total_events bigint,
	total_deliveries bigint,
	unique_subscribers bigint,
	avg_delivery_time_seconds numeric,
	open_rate numeric,
	click_rate numeric
)
LANGUAGE plpgsql
AS $function$
BEGIN
	RETURN QUERY
	SELECT
		ne.event_type,
		COUNT(DISTINCT ne.id) AS total_events,
		COUNT(nd.id) AS total_deliveries,
		COUNT(DISTINCT ns.user_id) AS unique_subscribers,
		ROUND(
			AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)))
				FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,
			2
		) AS avg_delivery_time_seconds,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC
				/ NULLIF(
					COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC,
					0
				)
				* 100
			),
			2
		) AS open_rate,
		ROUND(
			(
				COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC
				/ NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0)
				* 100
			),
			2
		) AS click_rate
	FROM notification_events ne
	LEFT JOIN notification_deliveries nd ON nd.event_id = ne.id
	LEFT JOIN notification_subscriptions ns ON ns.event_type = ne.event_type
	WHERE ne.created_at > NOW() - p_interval::INTERVAL
	GROUP BY ne.event_type
	ORDER BY total_events DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_notification_delivery_timeline(
	p_interval text DEFAULT '7 days'::text,
	p_granularity text DEFAULT 'day'::text
)
RETURNS TABLE(
	time_bucket timestamp with time zone,
	sent bigint,
	delivered bigint,
	opened bigint,
	clicked bigint,
	failed bigint
)
LANGUAGE plpgsql
AS $function$
DECLARE
	v_trunc_format TEXT;
BEGIN
	v_trunc_format := CASE
		WHEN p_granularity = 'hour' THEN 'hour'
		ELSE 'day'
	END;

	RETURN QUERY
	EXECUTE format('
		SELECT
			DATE_TRUNC(%L, nd.created_at) AS time_bucket,
			COUNT(*) FILTER (WHERE nd.status IN (''sent'', ''delivered'', ''opened'', ''clicked'')) AS sent,
			COUNT(*) FILTER (WHERE nd.status IN (''delivered'', ''opened'', ''clicked'')) AS delivered,
			COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
			COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
			COUNT(*) FILTER (WHERE nd.status IN (''failed'', ''bounced'')) AS failed
		FROM notification_deliveries nd
		WHERE nd.created_at > NOW() - %L::INTERVAL
		GROUP BY time_bucket
		ORDER BY time_bucket ASC
	', v_trunc_format, p_interval);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_notification_failed_deliveries(
	p_interval text DEFAULT '24 hours'::text,
	p_limit integer DEFAULT 50
)
RETURNS TABLE(
	delivery_id uuid,
	event_id uuid,
	event_type text,
	channel text,
	recipient_user_id uuid,
	recipient_email text,
	last_error text,
	attempts integer,
	max_attempts integer,
	created_at timestamp with time zone,
	failed_at timestamp with time zone
)
LANGUAGE plpgsql
AS $function$
BEGIN
	RETURN QUERY
	SELECT
		nd.id AS delivery_id,
		ne.id AS event_id,
		ne.event_type,
		nd.channel,
		nd.recipient_user_id,
		u.email AS recipient_email,
		nd.last_error,
		nd.attempts,
		nd.max_attempts,
		nd.created_at,
		nd.failed_at
	FROM notification_deliveries nd
	JOIN notification_events ne ON ne.id = nd.event_id
	JOIN users u ON u.id = nd.recipient_user_id
	WHERE nd.status IN ('failed', 'bounced')
		AND nd.created_at > NOW() - p_interval::INTERVAL
	ORDER BY nd.created_at DESC
	LIMIT p_limit;
END;
$function$;
