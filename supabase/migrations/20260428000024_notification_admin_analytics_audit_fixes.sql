-- supabase/migrations/20260428000024_notification_admin_analytics_audit_fixes.sql
-- Fix admin notification analytics, SMS stats, and log correlation defaults.

BEGIN;

DO $$
BEGIN
	IF to_regclass('public.notification_logs') IS NOT NULL THEN
		ALTER TABLE public.notification_logs
			ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid();

		UPDATE public.notification_logs
		SET correlation_id = gen_random_uuid()
		WHERE correlation_id IS NULL;

		ALTER TABLE public.notification_logs
			ALTER COLUMN correlation_id SET NOT NULL;
	END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_notification_event(
	p_level text,
	p_message text,
	p_namespace text DEFAULT 'db_function'::text,
	p_correlation_id uuid DEFAULT NULL::uuid,
	p_event_id uuid DEFAULT NULL::uuid,
	p_delivery_id uuid DEFAULT NULL::uuid,
	p_user_id uuid DEFAULT NULL::uuid,
	p_context jsonb DEFAULT '{}'::jsonb,
	p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
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
		COALESCE(p_correlation_id, gen_random_uuid()),
		p_event_id,
		p_delivery_id,
		p_user_id,
		p_context || p_metadata,
		NOW()
	);
EXCEPTION
	WHEN OTHERS THEN
		NULL;
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
	WITH scoped_events AS (
		SELECT ne.id, ne.event_type AS event_type_key
		FROM notification_events ne
		WHERE ne.created_at > NOW() - p_interval::INTERVAL
	),
	event_counts AS (
		SELECT
			se.event_type_key,
			COUNT(*) AS total_events
		FROM scoped_events se
		GROUP BY se.event_type_key
	),
	delivery_metrics AS (
		SELECT
			se.event_type_key,
			COUNT(nd.id) AS total_deliveries,
			COUNT(DISTINCT nd.recipient_user_id) AS unique_recipients,
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
		FROM scoped_events se
		LEFT JOIN notification_deliveries nd ON nd.event_id = se.id
		GROUP BY se.event_type_key
	)
	SELECT
		ec.event_type_key AS event_type,
		ec.total_events,
		COALESCE(dm.total_deliveries, 0) AS total_deliveries,
		COALESCE(dm.unique_recipients, 0) AS unique_subscribers,
		dm.avg_delivery_time_seconds,
		dm.open_rate,
		dm.click_rate
	FROM event_counts ec
	LEFT JOIN delivery_metrics dm ON dm.event_type_key = ec.event_type_key
	ORDER BY ec.total_events DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sms_notification_stats(
	p_interval text DEFAULT '24 hours'::text
)
RETURNS TABLE(
	total_users_with_phone bigint,
	users_phone_verified bigint,
	users_sms_enabled bigint,
	users_opted_out bigint,
	phone_verification_rate numeric,
	sms_adoption_rate numeric,
	opt_out_rate numeric,
	total_sms_sent_24h bigint,
	sms_delivery_rate_24h numeric,
	avg_sms_delivery_time_seconds numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
	RETURN QUERY
	WITH sms_prefs AS (
		SELECT
			COUNT(DISTINCT usp.user_id) FILTER (WHERE usp.phone_number IS NOT NULL) AS with_phone,
			COUNT(DISTINCT usp.user_id) FILTER (WHERE usp.phone_verified = true) AS verified,
			COUNT(DISTINCT usp.user_id) FILTER (
				WHERE usp.phone_number IS NOT NULL
					AND usp.phone_verified = true
					AND COALESCE(usp.opted_out, false) = false
					AND (
						COALESCE(unp.sms_enabled, false) = true
						OR COALESCE(unp.should_sms_daily_brief, false) = true
						OR COALESCE(usp.event_reminders_enabled, false) = true
						OR COALESCE(usp.morning_kickoff_enabled, false) = true
						OR COALESCE(usp.evening_recap_enabled, false) = true
						OR COALESCE(usp.urgent_alerts, false) = true
					)
			) AS enabled,
			COUNT(DISTINCT usp.user_id) FILTER (
				WHERE usp.phone_verified = true
					AND COALESCE(usp.opted_out, false) = true
			) AS opted_out
		FROM user_sms_preferences usp
		LEFT JOIN user_notification_preferences unp ON unp.user_id = usp.user_id
	),
	sms_period AS (
		SELECT
			COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')) AS sent_count,
			COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) AS delivered_count,
			AVG(EXTRACT(EPOCH FROM (delivered_at - COALESCE(sent_at, created_at))))
				FILTER (WHERE delivered_at IS NOT NULL AND status IN ('delivered', 'opened', 'clicked')) AS avg_delivery_seconds
		FROM notification_deliveries
		WHERE channel = 'sms'
			AND created_at >= NOW() - p_interval::INTERVAL
	)
	SELECT
		(SELECT with_phone FROM sms_prefs),
		(SELECT verified FROM sms_prefs),
		(SELECT enabled FROM sms_prefs),
		(SELECT opted_out FROM sms_prefs),
		ROUND(
			(SELECT verified FROM sms_prefs)::NUMERIC / NULLIF((SELECT with_phone FROM sms_prefs)::NUMERIC, 0) * 100,
			2
		),
		ROUND(
			(SELECT enabled FROM sms_prefs)::NUMERIC / NULLIF((SELECT verified FROM sms_prefs)::NUMERIC, 0) * 100,
			2
		),
		ROUND(
			(SELECT opted_out FROM sms_prefs)::NUMERIC / NULLIF((SELECT verified FROM sms_prefs)::NUMERIC, 0) * 100,
			2
		),
		(SELECT sent_count FROM sms_period),
		ROUND(
			(SELECT delivered_count FROM sms_period)::NUMERIC / NULLIF((SELECT sent_count FROM sms_period)::NUMERIC, 0) * 100,
			2
		),
		(SELECT avg_delivery_seconds FROM sms_period)::NUMERIC;
END;
$function$;

COMMIT;
