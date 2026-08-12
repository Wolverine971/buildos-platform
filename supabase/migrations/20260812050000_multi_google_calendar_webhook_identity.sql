-- supabase/migrations/20260812050000_multi_google_calendar_webhook_identity.sql
-- Make Google Calendar webhook identity source-aware while retaining legacy rows during rollout.
--
-- The original UNIQUE (user_id, calendar_id) constraint prevents a connection-backed source
-- channel from coexisting with the user's legacy singleton channel for the same provider calendar.
-- It also incorrectly treats a provider calendar ID as globally unique across a user's Google
-- accounts. New channels are owned by calendar_source_id; only rows without a source keep the
-- legacy (user_id, calendar_id) identity.

BEGIN;

ALTER TABLE public.calendar_webhook_channels
	DROP CONSTRAINT IF EXISTS calendar_webhook_channels_user_id_calendar_id_key;

CREATE UNIQUE INDEX calendar_webhook_channels_legacy_identity_idx
	ON public.calendar_webhook_channels (user_id, calendar_id)
	WHERE calendar_source_id IS NULL;

-- A source-backed channel has no valid legacy interpretation. If its source is hard-deleted,
-- delete the local channel instead of clearing calendar_source_id and risking credential drift.
ALTER TABLE public.calendar_webhook_channels
	DROP CONSTRAINT IF EXISTS calendar_webhook_channels_calendar_source_owner_fkey;

ALTER TABLE public.calendar_webhook_channels
	ADD CONSTRAINT calendar_webhook_channels_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE CASCADE;

COMMIT;
