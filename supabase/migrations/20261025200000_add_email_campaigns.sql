-- supabase/migrations/20261025200000_add_email_campaigns.sql
--
-- Email campaigns: one email to a group, with optional per-person tailoring,
-- a review step, paced waves, and per-person results.
--
-- Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md
--
-- Design notes:
--   - A campaign holds the template and the sending plan. Each person is one
--     email_campaign_recipients row. A recipient may carry its own subject/body
--     (tailored by AI or edited by hand); otherwise the template is used.
--   - Every send goes through EmailService, which writes its own emails +
--     email_recipients rows. email_campaign_recipients.email_id points at that
--     row, so opens, clicks and unsubscribes come from the existing tracking
--     tables and are per person.
--   - Sending is a queue drained by a once-a-minute cron. claim_email_campaign_sends
--     moves due rows from queued to sending under SKIP LOCKED, so overlapping
--     cron runs never send the same row twice. A sending row whose lease expires
--     is marked failed (never re-sent automatically), because the email may have
--     gone out before the process died.
--   - user_id cascades on delete so account deletion removes a person's
--     campaign rows (and their email address) with them.

BEGIN;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_campaigns (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL DEFAULT 'Untitled campaign',
	status TEXT NOT NULL DEFAULT 'draft' CHECK (
		status IN ('draft', 'sending', 'paused', 'completed', 'canceled')
	),
	subject_template TEXT NOT NULL DEFAULT '',
	body_template TEXT NOT NULL DEFAULT '',
	from_name TEXT NOT NULL DEFAULT 'DJ',
	-- { segments: string[], people: [{ email, name?, user_id?, beta_signup_id? }], removed_emails: string[] }
	audience JSONB NOT NULL DEFAULT '{}'::jsonb,
	tailoring_instructions TEXT,
	wave_size INTEGER NOT NULL DEFAULT 20 CHECK (wave_size BETWEEN 1 AND 200),
	wave_interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (wave_interval_minutes BETWEEN 1 AND 10080),
	starts_at TIMESTAMPTZ,
	queued_at TIMESTAMPTZ,
	completed_at TIMESTAMPTZ,
	canceled_at TIMESTAMPTZ,
	source TEXT NOT NULL DEFAULT 'admin',
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status
	ON public.email_campaigns(status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER trg_email_campaigns_updated_at
	BEFORE UPDATE ON public.email_campaigns
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.email_campaigns IS
	'Admin email campaigns: template, audience, tailoring instructions, and wave plan. Recipients live in email_campaign_recipients.';

-- ---------------------------------------------------------------------------
-- Recipients (one row per person per campaign)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
	email TEXT NOT NULL CHECK (email = lower(trim(email))),
	name TEXT,
	first_name TEXT,
	user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
	beta_signup_id UUID REFERENCES public.beta_signups(id) ON DELETE SET NULL,
	segment TEXT NOT NULL DEFAULT 'manual',
	-- Facts used for merge fields and tailoring (signup month, last project title, signup answers).
	context JSONB NOT NULL DEFAULT '{}'::jsonb,
	subject_override TEXT,
	body_override TEXT,
	override_source TEXT CHECK (override_source IN ('tailored', 'edited', 'imported')),
	tailor_status TEXT NOT NULL DEFAULT 'none' CHECK (
		tailor_status IN ('none', 'done', 'failed')
	),
	tailored_at TIMESTAMPTZ,
	tailor_error TEXT,
	included BOOLEAN NOT NULL DEFAULT TRUE,
	status TEXT NOT NULL DEFAULT 'draft' CHECK (
		status IN ('draft', 'queued', 'sending', 'sent', 'skipped', 'failed', 'canceled')
	),
	skip_reason TEXT,
	scheduled_for TIMESTAMPTZ,
	lease_expires_at TIMESTAMPTZ,
	attempt_count INTEGER NOT NULL DEFAULT 0,
	email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
	tracking_id TEXT,
	message_id TEXT,
	sent_at TIMESTAMPTZ,
	replied_at TIMESTAMPTZ,
	reply_checked_at TIMESTAMPTZ,
	bounced_at TIMESTAMPTZ,
	error_message TEXT,
	source_email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT email_campaign_recipients_unique_email UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign
	ON public.email_campaign_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_due
	ON public.email_campaign_recipients(scheduled_for, id)
	WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_sending
	ON public.email_campaign_recipients(lease_expires_at)
	WHERE status = 'sending';

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_reply_watch
	ON public.email_campaign_recipients(reply_checked_at NULLS FIRST, sent_at)
	WHERE status = 'sent' AND replied_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_email_id
	ON public.email_campaign_recipients(email_id)
	WHERE email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_user
	ON public.email_campaign_recipients(user_id)
	WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_beta_signup
	ON public.email_campaign_recipients(beta_signup_id)
	WHERE beta_signup_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_address
	ON public.email_campaign_recipients(email, sent_at DESC);

DROP TRIGGER IF EXISTS trg_email_campaign_recipients_updated_at ON public.email_campaign_recipients;
CREATE TRIGGER trg_email_campaign_recipients_updated_at
	BEFORE UPDATE ON public.email_campaign_recipients
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.email_campaign_recipients IS
	'One person in an email campaign: their tailored or edited version, send state, and reply/bounce state. Opens/clicks/unsubscribes come from emails/email_recipients/email_tracking_events via email_id.';

-- ---------------------------------------------------------------------------
-- Row level security: admins only. The cron uses the service role.
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage email campaigns" ON public.email_campaigns;
CREATE POLICY "Admins manage email campaigns"
	ON public.email_campaigns
	FOR ALL
	TO authenticated
	USING (public.is_admin(auth.uid()))
	WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage email campaign recipients" ON public.email_campaign_recipients;
CREATE POLICY "Admins manage email campaign recipients"
	ON public.email_campaign_recipients
	FOR ALL
	TO authenticated
	USING (public.is_admin(auth.uid()))
	WITH CHECK (public.is_admin(auth.uid()));

REVOKE ALL ON public.email_campaigns FROM anon;
REVOKE ALL ON public.email_campaign_recipients FROM anon;

-- ---------------------------------------------------------------------------
-- Queue claim (service role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_email_campaign_sends(
	p_limit INTEGER,
	p_lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.email_campaign_recipients
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
	IF p_limit IS NULL OR p_limit <= 0 THEN
		RETURN;
	END IF;

	RETURN QUERY
	WITH due AS (
		SELECT r.id
		FROM public.email_campaign_recipients AS r
		JOIN public.email_campaigns AS c ON c.id = r.campaign_id
		WHERE r.status = 'queued'
			AND r.included
			AND r.scheduled_for <= NOW()
			AND c.status = 'sending'
		ORDER BY r.scheduled_for, r.id
		FOR UPDATE OF r SKIP LOCKED
		LIMIT LEAST(p_limit, 200)
	)
	UPDATE public.email_campaign_recipients AS r
	SET status = 'sending',
		lease_expires_at = NOW() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
		attempt_count = r.attempt_count + 1
	FROM due
	WHERE r.id = due.id
	RETURNING r.*;
END;
$$;

COMMENT ON FUNCTION public.claim_email_campaign_sends(INTEGER, INTEGER) IS
	'Moves up to p_limit due, included, queued recipients of sending campaigns to sending with a lease. SKIP LOCKED makes overlapping cron runs safe.';

REVOKE ALL ON FUNCTION public.claim_email_campaign_sends(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_campaign_sends(INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Per-person engagement (admin pages; RLS limits rows to admins)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_email_campaign_engagement(p_campaign_ids UUID[])
RETURNS TABLE (
	campaign_recipient_id UUID,
	campaign_id UUID,
	opened_at TIMESTAMPTZ,
	open_count INTEGER,
	first_clicked_at TIMESTAMPTZ,
	click_count BIGINT,
	unsubscribed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
	SELECT
		r.id,
		r.campaign_id,
		er.opened_at,
		COALESCE(er.open_count, 0),
		clicks.first_clicked_at,
		COALESCE(clicks.click_count, 0),
		unsubs.unsubscribed_at
	FROM public.email_campaign_recipients AS r
	LEFT JOIN LATERAL (
		SELECT MIN(rec.opened_at) AS opened_at, MAX(rec.open_count) AS open_count
		FROM public.email_recipients AS rec
		WHERE rec.email_id = r.email_id
	) AS er ON TRUE
	LEFT JOIN LATERAL (
		SELECT MIN(COALESCE(ev.timestamp, ev.created_at)) AS first_clicked_at, COUNT(*) AS click_count
		FROM public.email_tracking_events AS ev
		WHERE ev.email_id = r.email_id AND ev.event_type = 'clicked'
	) AS clicks ON TRUE
	LEFT JOIN LATERAL (
		SELECT MIN(COALESCE(ev.timestamp, ev.created_at)) AS unsubscribed_at
		FROM public.email_tracking_events AS ev
		WHERE ev.email_id = r.email_id AND ev.event_type = 'unsubscribed'
	) AS unsubs ON TRUE
	WHERE r.campaign_id = ANY (p_campaign_ids)
		AND r.email_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_email_campaign_engagement(UUID[]) IS
	'Opens, clicks and unsubscribes per sent campaign recipient, read from the shared email tracking tables.';

REVOKE ALL ON FUNCTION public.get_email_campaign_engagement(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_campaign_engagement(UUID[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared images: uploads made before a draft is saved have no email row.
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_attachments ALTER COLUMN email_id DROP NOT NULL;

COMMIT;
