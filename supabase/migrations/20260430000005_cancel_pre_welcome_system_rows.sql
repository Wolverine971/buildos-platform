-- supabase/migrations/20260430000005_cancel_pre_welcome_system_rows.sql
--
-- Phase 0 cleanup for the new welcome email sequence system.
--
-- Context: the legacy welcome pipeline (public.welcome_email_sequences) never
-- successfully delivered Email 1 to ~94 users. The new system ships with a
-- reliable delivery path. To preserve the "existing users go to a separate
-- Reactivation Campaign, not welcome" scope (see
-- docs/specs/buildos-welcome-email-sequence-system.md §19 Phase 0), every
-- currently-active row in welcome_email_sequences must be terminated BEFORE
-- the delivery fix ships. Otherwise the fixed pipeline will back-send Email 1
-- to every pre-deploy user on the next cron tick.
--
-- Decision: cancel (don't delete). Preserves the cohort for the reactivation
-- spec to query via:
--
--   SELECT user_id FROM welcome_email_sequences
--   WHERE status = 'cancelled'
--     AND email_1_sent_at IS NULL
--     AND started_at < <deploy timestamp>;
--
-- This migration is idempotent: it only touches rows whose status is 'active'.
-- Re-running it is a no-op.
BEGIN;

UPDATE public.welcome_email_sequences
SET status = 'cancelled',
    completed_at = COALESCE(completed_at, NOW()),
    updated_at = NOW()
WHERE status = 'active';

DO $$
DECLARE
    remaining_active INT;
BEGIN
    SELECT COUNT(*) INTO remaining_active
    FROM public.welcome_email_sequences
    WHERE status = 'active';

    IF remaining_active > 0 THEN
        RAISE EXCEPTION
            'Phase 0 cleanup failed: % welcome_email_sequences rows still active',
            remaining_active;
    END IF;
END $$;

COMMIT;
