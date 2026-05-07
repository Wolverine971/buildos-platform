-- supabase/migrations/20260506000001_add_reactivation_sequence_send_queue.sql

CREATE TABLE IF NOT EXISTS public.retargeting_founder_pilot_sends (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	member_id UUID NOT NULL REFERENCES public.retargeting_founder_pilot_members(id) ON DELETE CASCADE,
	campaign_id TEXT NOT NULL DEFAULT 'buildos-reactivation-founder-pilot-v1',
	cohort_id TEXT NOT NULL,
	batch_id TEXT NOT NULL,
	user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
	recipient_email TEXT NOT NULL,
	email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
	step TEXT NOT NULL CHECK (step IN ('touch_1', 'touch_2', 'touch_3')),
	variant TEXT NOT NULL DEFAULT 'A',
	status TEXT NOT NULL DEFAULT 'queued' CHECK (
		status IN ('queued', 'sending', 'sent', 'skipped', 'failed', 'canceled')
	),
	trigger_source TEXT NOT NULL DEFAULT 'admin_bulk',
	trigger_mode TEXT NOT NULL DEFAULT 'schedule' CHECK (trigger_mode IN ('schedule', 'send_now', 'cron')),
	scheduled_for TIMESTAMPTZ NOT NULL,
	queued_by_admin UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	sent_by_admin UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	sent_at TIMESTAMPTZ,
	skipped_at TIMESTAMPTZ,
	failed_at TIMESTAMPTZ,
	failure_reason TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retargeting_pilot_sends_member
	ON public.retargeting_founder_pilot_sends(member_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_retargeting_pilot_sends_due
	ON public.retargeting_founder_pilot_sends(status, scheduled_for)
	WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_retargeting_pilot_sends_cohort
	ON public.retargeting_founder_pilot_sends(campaign_id, cohort_id, batch_id, status);

CREATE INDEX IF NOT EXISTS idx_retargeting_pilot_sends_email
	ON public.retargeting_founder_pilot_sends(email_id)
	WHERE email_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_retargeting_pilot_sends_one_pending_step
	ON public.retargeting_founder_pilot_sends(member_id, step)
	WHERE status IN ('queued', 'sending');

DROP TRIGGER IF EXISTS trg_retargeting_pilot_sends_updated_at
	ON public.retargeting_founder_pilot_sends;

CREATE TRIGGER trg_retargeting_pilot_sends_updated_at
	BEFORE UPDATE ON public.retargeting_founder_pilot_sends
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.retargeting_founder_pilot_sends ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.retargeting_founder_pilot_sends IS
	'Queue and audit table for admin-triggered BuildOS reactivation sequence sends.';

COMMENT ON COLUMN public.retargeting_founder_pilot_sends.status IS
	'queued | sending | sent | skipped | failed | canceled.';

COMMENT ON COLUMN public.retargeting_founder_pilot_sends.scheduled_for IS
	'When the queued reactivation touch should be sent. Cron claims rows when this timestamp is due.';
