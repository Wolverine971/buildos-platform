-- supabase/migrations/20260428000023_add_security_event_retention.sql
-- Rollups and cleanup functions for the canonical security event stream.

CREATE TABLE IF NOT EXISTS public.security_event_daily_rollups (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	rollup_date date NOT NULL,
	category text NOT NULL,
	event_type text NOT NULL,
	outcome text NOT NULL,
	severity text NOT NULL,
	event_count bigint NOT NULL DEFAULT 0,
	unique_actor_user_count integer NOT NULL DEFAULT 0,
	unique_external_agent_caller_count integer NOT NULL DEFAULT 0,
	max_risk_score integer,
	first_seen_at timestamptz,
	last_seen_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (rollup_date, category, event_type, outcome, severity)
);

ALTER TABLE public.security_event_daily_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_event_daily_rollups_select_admin
	ON public.security_event_daily_rollups;
CREATE POLICY security_event_daily_rollups_select_admin
	ON public.security_event_daily_rollups
	FOR SELECT
	USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_security_event_daily_rollups_date
	ON public.security_event_daily_rollups (rollup_date DESC);

CREATE INDEX IF NOT EXISTS idx_security_event_daily_rollups_category_date
	ON public.security_event_daily_rollups (category, rollup_date DESC);

CREATE INDEX IF NOT EXISTS idx_security_event_daily_rollups_type_date
	ON public.security_event_daily_rollups (event_type, rollup_date DESC);

CREATE OR REPLACE FUNCTION public.is_high_signal_security_event(
	p_event_type text,
	p_outcome text,
	p_severity text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT
		p_outcome IN ('blocked', 'denied')
		OR p_severity IN ('high', 'critical')
		OR p_event_type IN (
			'agent.auth.failed',
			'agent.tool.denied',
			'agent.write.failed',
			'auth.oauth.state_mismatch',
			'auth.password_reset.completed',
			'auth.password_reset.failed',
			'integration.calendar.oauth_state_mismatch'
		);
$$;

CREATE OR REPLACE FUNCTION public.rollup_security_events(
	p_start_date date DEFAULT (CURRENT_DATE - 1),
	p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
	summary_start_date date,
	summary_end_date date,
	rollup_rows integer,
	rolled_event_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF p_end_date <= p_start_date THEN
		RAISE EXCEPTION 'p_end_date must be after p_start_date';
	END IF;

	INSERT INTO public.security_event_daily_rollups (
		rollup_date,
		category,
		event_type,
		outcome,
		severity,
		event_count,
		unique_actor_user_count,
		unique_external_agent_caller_count,
		max_risk_score,
		first_seen_at,
		last_seen_at,
		updated_at
	)
	SELECT
		se.created_at::date AS rollup_date,
		se.category,
		se.event_type,
		se.outcome,
		se.severity,
		COUNT(*)::bigint AS event_count,
		COUNT(DISTINCT se.actor_user_id) FILTER (WHERE se.actor_user_id IS NOT NULL)::integer
			AS unique_actor_user_count,
		COUNT(DISTINCT se.external_agent_caller_id)
			FILTER (WHERE se.external_agent_caller_id IS NOT NULL)::integer
			AS unique_external_agent_caller_count,
		MAX(se.risk_score) AS max_risk_score,
		MIN(se.created_at) AS first_seen_at,
		MAX(se.created_at) AS last_seen_at,
		NOW() AS updated_at
	FROM public.security_events se
	WHERE se.created_at >= p_start_date::timestamptz
		AND se.created_at < p_end_date::timestamptz
	GROUP BY
		se.created_at::date,
		se.category,
		se.event_type,
		se.outcome,
		se.severity
	ON CONFLICT (rollup_date, category, event_type, outcome, severity)
	DO UPDATE SET
		event_count = EXCLUDED.event_count,
		unique_actor_user_count = EXCLUDED.unique_actor_user_count,
		unique_external_agent_caller_count = EXCLUDED.unique_external_agent_caller_count,
		max_risk_score = EXCLUDED.max_risk_score,
		first_seen_at = EXCLUDED.first_seen_at,
		last_seen_at = EXCLUDED.last_seen_at,
		updated_at = NOW();

	RETURN QUERY
	SELECT
		p_start_date AS summary_start_date,
		p_end_date AS summary_end_date,
		COUNT(*)::integer AS rollup_rows,
		COALESCE(SUM(ser.event_count), 0)::bigint AS rolled_event_count
	FROM public.security_event_daily_rollups ser
	WHERE ser.rollup_date >= p_start_date
		AND ser.rollup_date < p_end_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_security_events(
	p_now timestamptz DEFAULT now(),
	p_low_signal_retention_days integer DEFAULT 180,
	p_high_signal_retention_days integer DEFAULT 400,
	p_dry_run boolean DEFAULT true
)
RETURNS TABLE (
	low_signal_cutoff timestamptz,
	high_signal_cutoff timestamptz,
	low_signal_candidate_count bigint,
	high_signal_candidate_count bigint,
	deleted_count bigint,
	dry_run boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_low_signal_cutoff timestamptz;
	v_high_signal_cutoff timestamptz;
	v_low_signal_count bigint;
	v_high_signal_count bigint;
	v_deleted_count bigint := 0;
BEGIN
	IF p_low_signal_retention_days < 30 THEN
		RAISE EXCEPTION 'p_low_signal_retention_days must be at least 30';
	END IF;

	IF p_high_signal_retention_days < p_low_signal_retention_days THEN
		RAISE EXCEPTION 'p_high_signal_retention_days must be greater than or equal to low-signal retention';
	END IF;

	v_low_signal_cutoff := p_now - make_interval(days => p_low_signal_retention_days);
	v_high_signal_cutoff := p_now - make_interval(days => p_high_signal_retention_days);

	SELECT COUNT(*)::bigint
	INTO v_low_signal_count
	FROM public.security_events se
	WHERE se.created_at < v_low_signal_cutoff
		AND NOT public.is_high_signal_security_event(se.event_type, se.outcome, se.severity);

	SELECT COUNT(*)::bigint
	INTO v_high_signal_count
	FROM public.security_events se
	WHERE se.created_at < v_high_signal_cutoff
		AND public.is_high_signal_security_event(se.event_type, se.outcome, se.severity);

	IF NOT p_dry_run THEN
		WITH deleted AS (
			DELETE FROM public.security_events se
			WHERE (
					se.created_at < v_low_signal_cutoff
					AND NOT public.is_high_signal_security_event(se.event_type, se.outcome, se.severity)
				)
				OR (
					se.created_at < v_high_signal_cutoff
					AND public.is_high_signal_security_event(se.event_type, se.outcome, se.severity)
				)
			RETURNING 1
		)
		SELECT COUNT(*)::bigint
		INTO v_deleted_count
		FROM deleted;
	END IF;

	RETURN QUERY
	SELECT
		v_low_signal_cutoff AS low_signal_cutoff,
		v_high_signal_cutoff AS high_signal_cutoff,
		v_low_signal_count AS low_signal_candidate_count,
		v_high_signal_count AS high_signal_candidate_count,
		v_deleted_count AS deleted_count,
		p_dry_run AS dry_run;
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_security_events(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollup_security_events(date, date) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_security_events(timestamptz, integer, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_security_events(timestamptz, integer, integer, boolean) TO service_role;
