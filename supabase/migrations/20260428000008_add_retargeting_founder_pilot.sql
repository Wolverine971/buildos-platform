-- supabase/migrations/20260428000008_add_retargeting_founder_pilot.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.retargeting_founder_pilot_members (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	campaign_id TEXT NOT NULL,
	cohort_id TEXT NOT NULL,
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	name TEXT,
	cohort_frozen_at TIMESTAMPTZ NOT NULL,
	cohort_size INTEGER NOT NULL,
	prioritized_rank INTEGER NOT NULL,
	pilot_segment TEXT NOT NULL CHECK (
		pilot_segment IN (
			'signed_up_barely_used',
			'tried_briefly_then_disappeared',
			'used_for_a_while_then_went_dormant'
		)
	),
	holdout BOOLEAN NOT NULL DEFAULT FALSE,
	batch_id TEXT,
	variant TEXT NOT NULL DEFAULT 'A',
	conversion_window_days INTEGER NOT NULL DEFAULT 14,
	first_activity_at TIMESTAMPTZ,
	last_meaningful_activity_at TIMESTAMPTZ,
	lifetime_activity_count INTEGER NOT NULL DEFAULT 0,
	first_14d_activity_count INTEGER NOT NULL DEFAULT 0,
	last_outbound_email_at TIMESTAMPTZ,
	last_seen_at TIMESTAMPTZ,
	touch_1_sent_at TIMESTAMPTZ,
	touch_2_sent_at TIMESTAMPTZ,
	touch_3_sent_at TIMESTAMPTZ,
	reply_status TEXT NOT NULL DEFAULT 'none' CHECK (
		reply_status IN ('none', 'replied', 'positive_reply', 'negative_reply', 'do_not_contact')
	),
	reply_recorded_at TIMESTAMPTZ,
	manual_stop BOOLEAN NOT NULL DEFAULT FALSE,
	manual_stop_at TIMESTAMPTZ,
	manual_stop_reason TEXT,
	notes TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (campaign_id, cohort_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_retargeting_founder_members_cohort_rank
	ON public.retargeting_founder_pilot_members(campaign_id, cohort_id, prioritized_rank);

CREATE INDEX IF NOT EXISTS idx_retargeting_founder_members_batch
	ON public.retargeting_founder_pilot_members(campaign_id, cohort_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_retargeting_founder_members_holdout
	ON public.retargeting_founder_pilot_members(campaign_id, cohort_id, holdout);

DROP TRIGGER IF EXISTS trg_retargeting_founder_pilot_members_updated_at
	ON public.retargeting_founder_pilot_members;

CREATE TRIGGER trg_retargeting_founder_pilot_members_updated_at
	BEFORE UPDATE ON public.retargeting_founder_pilot_members
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.retargeting_founder_pilot_members IS
	'Frozen cohort state for the founder-led dormant-user reactivation pilot, including deterministic holdout assignment, batching, touch timestamps, and manual suppression notes.';

COMMENT ON COLUMN public.retargeting_founder_pilot_members.variant IS
	'Manual subject/content variant assigned to the member for the founder-led retargeting pilot.';

COMMENT ON COLUMN public.retargeting_founder_pilot_members.reply_status IS
	'Founder-maintained reply outcome used to suppress follow-up touches without building inbox automation.';

CREATE OR REPLACE FUNCTION public.freeze_retargeting_founder_pilot_cohort(
	p_campaign_id TEXT,
	p_cohort_id TEXT,
	p_batch_size INTEGER DEFAULT 25,
	p_holdout_users_if_small INTEGER DEFAULT 10,
	p_holdout_pct_if_large NUMERIC DEFAULT 0.10,
	p_conversion_window_days INTEGER DEFAULT 14,
	p_cohort_frozen_at TIMESTAMPTZ DEFAULT NOW(),
	p_replace_existing BOOLEAN DEFAULT FALSE
)
RETURNS SETOF public.retargeting_founder_pilot_members
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(NULLIF(BTRIM(p_campaign_id), ''), '') = '' THEN
		RAISE EXCEPTION 'campaign_id is required';
	END IF;

	IF COALESCE(NULLIF(BTRIM(p_cohort_id), ''), '') = '' THEN
		RAISE EXCEPTION 'cohort_id is required';
	END IF;

	IF p_batch_size <= 0 THEN
		RAISE EXCEPTION 'batch_size must be greater than 0';
	END IF;

	IF p_holdout_users_if_small < 0 THEN
		RAISE EXCEPTION 'holdout_users_if_small must be non-negative';
	END IF;

	IF p_holdout_pct_if_large < 0 OR p_holdout_pct_if_large > 1 THEN
		RAISE EXCEPTION 'holdout_pct_if_large must be between 0 and 1';
	END IF;

	IF p_conversion_window_days <= 0 THEN
		RAISE EXCEPTION 'conversion_window_days must be greater than 0';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.retargeting_founder_pilot_members members
		WHERE members.campaign_id = p_campaign_id
		  AND members.cohort_id = p_cohort_id
	) AND NOT p_replace_existing THEN
		RAISE EXCEPTION 'cohort % for campaign % already exists', p_cohort_id, p_campaign_id;
	END IF;

	IF p_replace_existing THEN
		DELETE FROM public.retargeting_founder_pilot_members members
		WHERE members.campaign_id = p_campaign_id
		  AND members.cohort_id = p_cohort_id;
	END IF;

	RETURN QUERY
	WITH params AS (
		SELECT
			p_campaign_id::TEXT AS campaign_id,
			p_cohort_id::TEXT AS cohort_id,
			p_cohort_frozen_at AS cohort_frozen_at,
			p_batch_size::INTEGER AS batch_size,
			p_holdout_users_if_small::INTEGER AS holdout_users_if_small,
			p_holdout_pct_if_large::NUMERIC AS holdout_pct_if_large,
			p_conversion_window_days::INTEGER AS conversion_window_days
	),
	activity AS (
		SELECT user_id, created_at, 'agent_chat_session'::TEXT AS activity_type
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
	activity_rollup AS (
		SELECT
			u.id AS user_id,
			MIN(a.created_at) AS first_activity_at,
			MAX(a.created_at) AS last_meaningful_activity_at,
			COUNT(a.created_at)::INTEGER AS lifetime_activity_count,
			COUNT(a.created_at) FILTER (
				WHERE a.created_at >= u.created_at
				  AND a.created_at < u.created_at + INTERVAL '14 days'
			)::INTEGER AS first_14d_activity_count
		FROM public.users u
		LEFT JOIN activity a
			ON a.user_id = u.id
		GROUP BY u.id
	),
	email_touchpoints AS (
		SELECT
			u.id AS user_id,
			el.sent_at,
			el.status
		FROM public.users u
		JOIN public.email_logs el
			ON lower(el.to_email) = lower(u.email)

		UNION ALL

		SELECT
			u.id AS user_id,
			er.sent_at,
			er.status
		FROM public.users u
		JOIN public.email_recipients er
			ON lower(er.recipient_email) = lower(u.email)
	),
	email_rollup AS (
		SELECT
			user_id,
			MAX(sent_at) FILTER (
				WHERE status IN ('sent', 'delivered', 'opened', 'clicked')
			) AS last_outbound_email_at,
			BOOL_OR(status IN ('bounced', 'complaint')) AS has_bad_email_history,
			BOOL_OR(status = 'bounced') AS has_bounced_recipient
		FROM email_touchpoints
		GROUP BY user_id
	),
	eligible AS (
		SELECT
			p.campaign_id,
			p.cohort_id,
			p.cohort_frozen_at,
			p.batch_size,
			p.conversion_window_days,
			u.id AS user_id,
			u.email,
			u.name,
			ar.first_activity_at,
			ar.last_meaningful_activity_at,
			COALESCE(ar.lifetime_activity_count, 0) AS lifetime_activity_count,
			COALESCE(ar.first_14d_activity_count, 0) AS first_14d_activity_count,
			er.last_outbound_email_at,
			GREATEST(
				COALESCE(ar.last_meaningful_activity_at, TIMESTAMPTZ '1900-01-01'),
				COALESCE(u.last_visit, TIMESTAMPTZ '1900-01-01')
			) AS last_seen_at,
			CASE
				WHEN COALESCE(ar.first_14d_activity_count, 0) = 0 THEN 'signed_up_barely_used'
				WHEN COALESCE(ar.first_14d_activity_count, 0) <= 3 THEN 'tried_briefly_then_disappeared'
				ELSE 'used_for_a_while_then_went_dormant'
			END AS pilot_segment,
			md5(u.id::TEXT || ':' || p.campaign_id) AS deterministic_random_key
		FROM public.users u
		CROSS JOIN params p
		LEFT JOIN activity_rollup ar
			ON ar.user_id = u.id
		LEFT JOIN email_rollup er
			ON er.user_id = u.id
		LEFT JOIN public.user_notification_preferences unp
			ON unp.user_id = u.id
		WHERE u.email IS NOT NULL
		  AND BTRIM(u.email) <> ''
		  AND u.created_at <= p.cohort_frozen_at - INTERVAL '180 days'
		  AND COALESCE(u.is_admin, FALSE) = FALSE
		  AND COALESCE(u.access_restricted, FALSE) = FALSE
		  AND u.email !~* '(^test\\+|^dev\\+|@example\\.com$|@buildos\\.|@build-os\\.)'
		  AND GREATEST(
				COALESCE(ar.last_meaningful_activity_at, TIMESTAMPTZ '1900-01-01'),
				COALESCE(u.last_visit, TIMESTAMPTZ '1900-01-01')
			) < p.cohort_frozen_at - INTERVAL '30 days'
		  AND COALESCE(unp.email_enabled, TRUE) = TRUE
		  AND COALESCE(er.has_bad_email_history, FALSE) = FALSE
		  AND COALESCE(er.has_bounced_recipient, FALSE) = FALSE
		  AND (
				er.last_outbound_email_at IS NULL
				OR er.last_outbound_email_at < p.cohort_frozen_at - INTERVAL '14 days'
			)
	),
	ranked AS (
		SELECT
			e.*,
			COUNT(*) OVER ()::INTEGER AS cohort_size,
			ROW_NUMBER() OVER (
				ORDER BY
					CASE e.pilot_segment
						WHEN 'tried_briefly_then_disappeared' THEN 1
						WHEN 'signed_up_barely_used' THEN 2
						ELSE 3
					END,
					e.deterministic_random_key
			)::INTEGER AS prioritized_rank
		FROM eligible e
	),
	with_holdout AS (
		SELECT
			r.*,
			CASE
				WHEN r.cohort_size < 100
					AND r.prioritized_rank <= LEAST(p_holdout_users_if_small, r.cohort_size) THEN TRUE
				WHEN r.cohort_size >= 100
					AND r.prioritized_rank <= CEIL(r.cohort_size * p_holdout_pct_if_large) THEN TRUE
				ELSE FALSE
			END AS holdout
		FROM ranked r
	),
	sendable AS (
		SELECT
			w.user_id,
			ROW_NUMBER() OVER (ORDER BY w.prioritized_rank)::INTEGER AS send_rank
		FROM with_holdout w
		WHERE w.holdout = FALSE
	),
	prepared AS (
		SELECT
			w.campaign_id,
			w.cohort_id,
			w.user_id,
			w.email,
			w.name,
			w.cohort_frozen_at,
			w.cohort_size,
			w.prioritized_rank,
			w.pilot_segment,
			w.holdout,
			CASE
				WHEN w.holdout = TRUE THEN NULL
				ELSE 'batch_' || LPAD((((s.send_rank - 1) / w.batch_size) + 1)::TEXT, 2, '0')
			END AS batch_id,
			'A'::TEXT AS variant,
			w.conversion_window_days,
			w.first_activity_at,
			w.last_meaningful_activity_at,
			w.lifetime_activity_count,
			w.first_14d_activity_count,
			w.last_outbound_email_at,
			w.last_seen_at
		FROM with_holdout w
		LEFT JOIN sendable s
			ON s.user_id = w.user_id
	),
	inserted AS (
		INSERT INTO public.retargeting_founder_pilot_members (
			campaign_id,
			cohort_id,
			user_id,
			email,
			name,
			cohort_frozen_at,
			cohort_size,
			prioritized_rank,
			pilot_segment,
			holdout,
			batch_id,
			variant,
			conversion_window_days,
			first_activity_at,
			last_meaningful_activity_at,
			lifetime_activity_count,
			first_14d_activity_count,
			last_outbound_email_at,
			last_seen_at
		)
		SELECT
			campaign_id,
			cohort_id,
			user_id,
			email,
			name,
			cohort_frozen_at,
			cohort_size,
			prioritized_rank,
			pilot_segment,
			holdout,
			batch_id,
			variant,
			conversion_window_days,
			first_activity_at,
			last_meaningful_activity_at,
			lifetime_activity_count,
			first_14d_activity_count,
			last_outbound_email_at,
			last_seen_at
		FROM prepared
		ORDER BY prioritized_rank
		RETURNING *
	)
	SELECT *
	FROM inserted
	ORDER BY prioritized_rank;
END;
$$;

COMMENT ON FUNCTION public.freeze_retargeting_founder_pilot_cohort(
	TEXT,
	TEXT,
	INTEGER,
	INTEGER,
	NUMERIC,
	INTEGER,
	TIMESTAMPTZ,
	BOOLEAN
) IS
	'Materializes a deterministic dormant-user cohort for the founder-led reactivation pilot, including holdout and batch assignment.';

CREATE OR REPLACE FUNCTION public.get_retargeting_founder_pilot_member_metrics(
	p_campaign_id TEXT,
	p_cohort_id TEXT,
	p_report_run_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
	member_id UUID,
	user_id UUID,
	email TEXT,
	name TEXT,
	campaign_id TEXT,
	cohort_id TEXT,
	batch_id TEXT,
	pilot_segment TEXT,
	holdout BOOLEAN,
	variant TEXT,
	conversion_window_days INTEGER,
	manual_stop BOOLEAN,
	reply_status TEXT,
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
		c.id AS member_id,
		c.user_id,
		c.email,
		c.name,
		c.campaign_id,
		c.cohort_id,
		c.batch_id,
		c.pilot_segment,
		c.holdout,
		c.variant,
		c.conversion_window_days,
		c.manual_stop,
		c.reply_status,
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
	'Returns per-member send, tracking, and outcome metrics for the founder-led retargeting pilot so admin APIs can preview follow-up candidates and compare send-vs-holdout performance.';

COMMIT;
