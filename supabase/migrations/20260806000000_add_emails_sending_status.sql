-- supabase/migrations/20260806000000_add_emails_sending_status.sql
-- Notification email delivery uses "sending" as a short-lived atomic claim
-- before Gmail is called. The legacy emails status constraint predates that
-- claim and only allows draft, scheduled, sent, and failed.

BEGIN;

ALTER TABLE public.emails
	ADD CONSTRAINT emails_status_check_with_sending
	CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed'))
	NOT VALID;

-- Validate the replacement before removing the existing guard so an
-- unexpected legacy value aborts the migration without weakening integrity.
ALTER TABLE public.emails
	VALIDATE CONSTRAINT emails_status_check_with_sending;

ALTER TABLE public.emails
	DROP CONSTRAINT IF EXISTS emails_status_check;

ALTER TABLE public.emails
	RENAME CONSTRAINT emails_status_check_with_sending TO emails_status_check;

COMMENT ON CONSTRAINT emails_status_check ON public.emails IS
	'Email lifecycle: sending is a reclaimable pre-delivery lease; all other values are durable states.';

COMMIT;
