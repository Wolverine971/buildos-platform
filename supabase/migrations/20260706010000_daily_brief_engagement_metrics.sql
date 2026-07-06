-- supabase/migrations/20260706010000_daily_brief_engagement_metrics.sql
-- Weekly daily-brief email engagement and 7-day reactivation by engagement stage.

CREATE OR REPLACE VIEW public.daily_brief_engagement_weekly_metrics AS
WITH click_events AS (
	SELECT
		ete.email_id,
		ete.recipient_id,
		MIN(COALESCE(ete.timestamp, ete.created_at)) AS clicked_at
	FROM public.email_tracking_events ete
	WHERE ete.event_type = 'clicked'
	GROUP BY ete.email_id, ete.recipient_id
),
daily_brief_email_recipients AS (
	SELECT
		e.id AS email_id,
		er.id AS email_recipient_id,
		er.recipient_id AS user_id,
		COALESCE(er.sent_at, e.sent_at, e.created_at) AS sent_at,
		DATE_TRUNC('week', COALESCE(er.sent_at, e.sent_at, e.created_at))::DATE AS week_start,
		CASE
			WHEN COALESCE(
				NULLIF(e.template_data->>'engagement_stage', ''),
				NULLIF(e.template_data->>'engagementStage', ''),
				NULLIF(nd.payload->>'engagement_stage', ''),
				NULLIF(nd.payload->>'engagementStage', '')
			) IN ('standard', 'reengagement', 'dormant')
				THEN COALESCE(
					NULLIF(e.template_data->>'engagement_stage', ''),
					NULLIF(e.template_data->>'engagementStage', ''),
					NULLIF(nd.payload->>'engagement_stage', ''),
					NULLIF(nd.payload->>'engagementStage', '')
				)
			WHEN e.template_data->>'isReengagement' = 'true'
				OR nd.payload->>'isReengagement' = 'true'
				THEN 'reengagement'
			ELSE 'standard'
		END AS engagement_stage,
		er.opened_at,
		COALESCE(nd.clicked_at, ce.clicked_at) AS clicked_at
	FROM public.emails e
	JOIN public.email_recipients er ON er.email_id = e.id
	LEFT JOIN public.notification_deliveries nd
		ON nd.id::TEXT = e.template_data->>'delivery_id'
	LEFT JOIN click_events ce
		ON ce.email_id = e.id
		AND ce.recipient_id = er.id
	WHERE COALESCE(er.sent_at, e.sent_at, e.created_at) IS NOT NULL
		AND (
			e.category = 'daily_brief'
			OR e.template_data->>'category' = 'daily_brief'
			OR e.template_data->>'campaign_type' = 'daily_brief'
			OR e.template_data->>'event_type' IN ('brief.completed', 'brief.failed')
		)
		AND (
			e.status IN ('sent', 'delivered', 'opened', 'clicked')
			OR er.status IN ('sent', 'delivered', 'opened', 'clicked')
		)
)
SELECT
	dber.week_start,
	dber.engagement_stage,
	COUNT(*)::BIGINT AS sends,
	COUNT(*) FILTER (WHERE dber.opened_at IS NOT NULL)::BIGINT AS opens,
	COUNT(*) FILTER (WHERE dber.clicked_at IS NOT NULL)::BIGINT AS clicks,
	ROUND(
		COUNT(*) FILTER (WHERE dber.opened_at IS NOT NULL)::NUMERIC
			/ NULLIF(COUNT(*)::NUMERIC, 0)
			* 100,
		2
	) AS open_rate,
	ROUND(
		COUNT(*) FILTER (WHERE dber.clicked_at IS NOT NULL)::NUMERIC
			/ NULLIF(COUNT(*)::NUMERIC, 0)
			* 100,
		2
	) AS click_rate,
	COUNT(*) FILTER (
		WHERE u.last_visit > dber.sent_at
			AND u.last_visit <= dber.sent_at + INTERVAL '7 days'
	)::BIGINT AS reactivated_7d,
	ROUND(
		COUNT(*) FILTER (
			WHERE u.last_visit > dber.sent_at
				AND u.last_visit <= dber.sent_at + INTERVAL '7 days'
		)::NUMERIC
			/ NULLIF(COUNT(*)::NUMERIC, 0)
			* 100,
		2
	) AS reactivation_rate_7d
FROM daily_brief_email_recipients dber
LEFT JOIN public.users u ON u.id::TEXT = dber.user_id::TEXT
GROUP BY dber.week_start, dber.engagement_stage;

GRANT SELECT ON public.daily_brief_engagement_weekly_metrics TO authenticated;
GRANT SELECT ON public.daily_brief_engagement_weekly_metrics TO service_role;
