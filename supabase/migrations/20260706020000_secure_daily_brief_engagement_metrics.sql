-- supabase/migrations/20260706020000_secure_daily_brief_engagement_metrics.sql
-- Follow-up to 20260706010000_daily_brief_engagement_metrics.sql:
-- 1) SECURITY: the view was granted to anon/authenticated, exposing company-wide
--    email engagement metrics through PostgREST to any (even unauthenticated) caller.
--    Restrict to service_role; the admin endpoint reads it via the admin client.
-- 2) CORRECTNESS: 7-day reactivation was computed from users.last_visit, which is
--    mutable — a user who reactivated and kept using the app stopped counting once
--    their last_visit moved past the window. Reactivation now uses append-only
--    activity signals (chat_sessions, user_activity_logs), with last_visit kept
--    only as an additive fallback for passive visits (accurate for recent cohorts).
-- 3) PERFORMANCE: expression index for the template_data->>'delivery_id' lookups
--    used by the email idempotency checks and the view's deliveries join, plus a
--    date floor inside the view.

CREATE INDEX IF NOT EXISTS idx_emails_template_delivery_id
	ON public.emails ((template_data->>'delivery_id'))
	WHERE template_data ? 'delivery_id';

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
		COALESCE(nd.clicked_at, ce.clicked_at) AS clicked_at,
		(
			EXISTS (
				SELECT 1
				FROM public.chat_sessions cs
				WHERE cs.user_id::TEXT = er.recipient_id::TEXT
					AND cs.created_at > COALESCE(er.sent_at, e.sent_at, e.created_at)
					AND cs.created_at <= COALESCE(er.sent_at, e.sent_at, e.created_at) + INTERVAL '7 days'
			)
			OR EXISTS (
				SELECT 1
				FROM public.user_activity_logs ual
				WHERE ual.user_id::TEXT = er.recipient_id::TEXT
					AND ual.created_at > COALESCE(er.sent_at, e.sent_at, e.created_at)
					AND ual.created_at <= COALESCE(er.sent_at, e.sent_at, e.created_at) + INTERVAL '7 days'
			)
			OR EXISTS (
				-- Additive fallback for passive visits. users.last_visit is mutable, so
				-- this term decays for cohorts older than the user's latest activity —
				-- the append-only signals above preserve history.
				SELECT 1
				FROM public.users u
				WHERE u.id::TEXT = er.recipient_id::TEXT
					AND u.last_visit > COALESCE(er.sent_at, e.sent_at, e.created_at)
					AND u.last_visit <= COALESCE(er.sent_at, e.sent_at, e.created_at) + INTERVAL '7 days'
			)
		) AS reactivated_7d
	FROM public.emails e
	JOIN public.email_recipients er ON er.email_id = e.id
	LEFT JOIN public.notification_deliveries nd
		ON nd.id::TEXT = e.template_data->>'delivery_id'
	LEFT JOIN click_events ce
		ON ce.email_id = e.id
		AND ce.recipient_id = er.id
	WHERE COALESCE(er.sent_at, e.sent_at, e.created_at) IS NOT NULL
		AND COALESCE(er.sent_at, e.sent_at, e.created_at) >= NOW() - INTERVAL '400 days'
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
	COUNT(*) FILTER (WHERE dber.reactivated_7d)::BIGINT AS reactivated_7d,
	ROUND(
		COUNT(*) FILTER (WHERE dber.reactivated_7d)::NUMERIC
			/ NULLIF(COUNT(*)::NUMERIC, 0)
			* 100,
		2
	) AS reactivation_rate_7d
FROM daily_brief_email_recipients dber
GROUP BY dber.week_start, dber.engagement_stage;

REVOKE SELECT ON public.daily_brief_engagement_weekly_metrics FROM anon;
REVOKE SELECT ON public.daily_brief_engagement_weekly_metrics FROM authenticated;
GRANT SELECT ON public.daily_brief_engagement_weekly_metrics TO service_role;
