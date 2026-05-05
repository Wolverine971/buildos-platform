-- supabase/migrations/20260505000002_fix_retargeting_metrics_shape.sql
BEGIN;

DROP FUNCTION IF EXISTS public.get_retargeting_founder_pilot_member_metrics(
	TEXT,
	TEXT,
	TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.get_retargeting_founder_pilot_member_metrics(
	p_campaign_id TEXT,
	p_cohort_id TEXT,
	p_report_run_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
	id UUID,
	member_id UUID,
	user_id UUID,
	email TEXT,
	name TEXT,
	campaign_id TEXT,
	cohort_id TEXT,
	cohort_size INTEGER,
	prioritized_rank INTEGER,
	batch_id TEXT,
	pilot_segment TEXT,
	holdout BOOLEAN,
	variant TEXT,
	conversion_window_days INTEGER,
	first_activity_at TIMESTAMPTZ,
	last_meaningful_activity_at TIMESTAMPTZ,
	lifetime_activity_count INTEGER,
	first_14d_activity_count INTEGER,
	last_outbound_email_at TIMESTAMPTZ,
	last_seen_at TIMESTAMPTZ,
	manual_stop BOOLEAN,
	manual_stop_at TIMESTAMPTZ,
	manual_stop_reason TEXT,
	reply_status TEXT,
	reply_recorded_at TIMESTAMPTZ,
	notes TEXT,
	created_at TIMESTAMPTZ,
	updated_at TIMESTAMPTZ,
	cohort_frozen_at TIMESTAMPTZ,
	touch_1_sent_at TIMESTAMPTZ,
	touch_2_sent_at TIMESTAMPTZ,
	touch_3_sent_at TIMESTAMPTZ,
	first_send_at TIMESTAMPTZ,
	last_send_at TIMESTAMPTZ,
	touch_1_opened BOOLEAN,
	touch_1_clicked BOOLEAN,
	any_open BOOLEAN,
	any_click BOOLEAN,
	anchor_at TIMESTAMPTZ,
	first_post_send_activity_at TIMESTAMPTZ,
	first_post_send_action_at TIMESTAMPTZ,
	return_session_at TIMESTAMPTZ,
	first_action_at TIMESTAMPTZ,
	active_days_30d INTEGER,
	attributed_step TEXT,
	attribution_type TEXT
)
LANGUAGE sql
STABLE
AS $$
	WITH cohort AS (
		SELECT *
		FROM public.retargeting_founder_pilot_members members
		WHERE members.campaign_id = p_campaign_id
		  AND members.cohort_id = p_cohort_id
	),
	campaign_recipients AS (
		SELECT
			c.id AS member_id,
			e.id AS email_id,
			er.id AS recipient_id,
			er.sent_at,
			er.opened_at,
			e.template_data->>'step' AS step
		FROM cohort c
		JOIN public.email_recipients er
			ON lower(er.recipient_email) = lower(c.email)
		JOIN public.emails e
			ON e.id = er.email_id
		WHERE e.template_data->>'campaign_id' = p_campaign_id
		  AND e.template_data->>'cohort_id' = p_cohort_id
		  AND er.sent_at IS NOT NULL
	),
	send_rollup AS (
		SELECT
			cr.member_id,
			MIN(cr.sent_at) AS first_send_at,
			MAX(cr.sent_at) AS last_send_at,
			BOOL_OR(cr.opened_at IS NOT NULL) AS any_open,
			BOOL_OR(cr.step = '1' AND cr.opened_at IS NOT NULL) AS touch_1_opened
		FROM campaign_recipients cr
		GROUP BY cr.member_id
	),
	click_rollup AS (
		SELECT
			cr.member_id,
			BOOL_OR(ete.event_type = 'clicked') AS any_click,
			BOOL_OR(cr.step = '1' AND ete.event_type = 'clicked') AS touch_1_clicked
		FROM campaign_recipients cr
		JOIN public.email_tracking_events ete
			ON ete.email_id = cr.email_id
		   AND ete.recipient_id = cr.recipient_id
		WHERE ete.event_type = 'clicked'
		GROUP BY cr.member_id
	),
	cohort_with_anchor AS (
		SELECT
			c.*,
			COALESCE(sr.first_send_at, c.cohort_frozen_at) AS anchor_at
		FROM cohort c
		LEFT JOIN send_rollup sr
			ON sr.member_id = c.id
	),
	activity AS (
		SELECT user_id, created_at, 'chat_session'::TEXT AS activity_type
		FROM public.agent_chat_sessions

		UNION ALL

		SELECT user_id, created_at, 'braindump'::TEXT AS activity_type
		FROM public.onto_braindumps

		UNION ALL

		SELECT changed_by AS user_id, created_at, 'project_log'::TEXT AS activity_type
		FROM public.onto_project_logs

		UNION ALL

		SELECT user_id, created_at, 'daily_brief'::TEXT AS activity_type
		FROM public.ontology_daily_briefs
		WHERE generation_status = 'completed'
	),
	post_anchor_activity AS (
		SELECT
			c.id AS member_id,
			a.created_at,
			a.activity_type,
			DATE(a.created_at) AS activity_day
		FROM cohort_with_anchor c
		JOIN activity a
			ON a.user_id = c.user_id
		   AND a.created_at > c.anchor_at
		   AND a.created_at <= c.anchor_at + INTERVAL '30 days'
	),
	post_first_send_activity AS (
		SELECT
			c.id AS member_id,
			a.created_at,
			a.activity_type
		FROM cohort_with_anchor c
		JOIN send_rollup sr
			ON sr.member_id = c.id
		JOIN activity a
			ON a.user_id = c.user_id
		   AND a.created_at > sr.first_send_at
	),
	user_summary AS (
		SELECT
			c.id AS member_id,
			MIN(pfs.created_at) AS first_post_send_activity_at,
			MIN(pfs.created_at) FILTER (
				WHERE pfs.activity_type IN ('braindump', 'project_log')
			) AS first_post_send_action_at,
			MIN(a.created_at) FILTER (
				WHERE a.created_at <= c.anchor_at + make_interval(days => c.conversion_window_days)
			) AS return_session_at,
			MIN(a.created_at) FILTER (
				WHERE a.activity_type IN ('braindump', 'project_log')
				  AND a.created_at <= c.anchor_at + make_interval(days => c.conversion_window_days)
			) AS first_action_at,
			COUNT(DISTINCT a.activity_day)::INTEGER AS active_days_30d
		FROM cohort_with_anchor c
		LEFT JOIN post_anchor_activity a
			ON a.member_id = c.id
		LEFT JOIN post_first_send_activity pfs
			ON pfs.member_id = c.id
		GROUP BY c.id, c.anchor_at, c.conversion_window_days
	)
	SELECT
		c.id,
		c.id AS member_id,
		c.user_id,
		c.email,
		c.name,
		c.campaign_id,
		c.cohort_id,
		c.cohort_size,
		c.prioritized_rank,
		c.batch_id,
		c.pilot_segment,
		c.holdout,
		c.variant,
		c.conversion_window_days,
		c.first_activity_at,
		c.last_meaningful_activity_at,
		c.lifetime_activity_count,
		c.first_14d_activity_count,
		c.last_outbound_email_at,
		c.last_seen_at,
		c.manual_stop,
		c.manual_stop_at,
		c.manual_stop_reason,
		c.reply_status,
		c.reply_recorded_at,
		c.notes,
		c.created_at,
		c.updated_at,
		c.cohort_frozen_at,
		c.touch_1_sent_at,
		c.touch_2_sent_at,
		c.touch_3_sent_at,
		sr.first_send_at,
		sr.last_send_at,
		COALESCE(sr.touch_1_opened, FALSE) AS touch_1_opened,
		COALESCE(clk.touch_1_clicked, FALSE) AS touch_1_clicked,
		COALESCE(sr.any_open, FALSE) AS any_open,
		COALESCE(clk.any_click, FALSE) AS any_click,
		c.anchor_at,
		us.first_post_send_activity_at,
		us.first_post_send_action_at,
		us.return_session_at,
		us.first_action_at,
		COALESCE(us.active_days_30d, 0) AS active_days_30d,
		attr.step AS attributed_step,
		COALESCE(
			attr.attribution_type,
			CASE
				WHEN c.holdout = TRUE THEN 'organic_holdout'
				ELSE 'organic'
			END
		) AS attribution_type
	FROM cohort_with_anchor c
	LEFT JOIN send_rollup sr
		ON sr.member_id = c.id
	LEFT JOIN click_rollup clk
		ON clk.member_id = c.id
	LEFT JOIN user_summary us
		ON us.member_id = c.id
	LEFT JOIN LATERAL (
		SELECT
			cr.step,
			'email'::TEXT AS attribution_type
		FROM campaign_recipients cr
		WHERE cr.member_id = c.id
		  AND COALESCE(us.first_action_at, us.return_session_at) IS NOT NULL
		  AND cr.sent_at <= COALESCE(us.first_action_at, us.return_session_at)
		  AND cr.sent_at >= COALESCE(us.first_action_at, us.return_session_at)
				- make_interval(days => c.conversion_window_days)
		ORDER BY cr.sent_at DESC
		LIMIT 1
	) attr ON TRUE
	ORDER BY c.prioritized_rank;
$$;

COMMENT ON FUNCTION public.get_retargeting_founder_pilot_member_metrics(
	TEXT,
	TEXT,
	TIMESTAMPTZ
) IS
	'Returns per-member send, tracking, and outcome metrics for the founder-led retargeting pilot. Includes the member id and prioritization fields required by admin send candidate selection.';

COMMIT;
