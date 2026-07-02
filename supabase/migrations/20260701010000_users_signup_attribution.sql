-- supabase/migrations/20260701010000_users_signup_attribution.sql
-- First-touch acquisition attribution on users.
-- Captured client-side on first landing (localStorage), passed through the
-- register endpoint, and mirrored to PostHog person properties.
-- See docs/marketing/growth/posthog-analytics-workflow.md (A4).

ALTER TABLE public.users
	ADD COLUMN IF NOT EXISTS signup_source text,
	ADD COLUMN IF NOT EXISTS utm_source text,
	ADD COLUMN IF NOT EXISTS utm_medium text,
	ADD COLUMN IF NOT EXISTS utm_campaign text,
	ADD COLUMN IF NOT EXISTS referrer text;

COMMENT ON COLUMN public.users.signup_source IS 'Derived acquisition source at signup: utm_source, else referrer host, else direct';
COMMENT ON COLUMN public.users.utm_source IS 'First-touch utm_source captured on landing';
COMMENT ON COLUMN public.users.utm_medium IS 'First-touch utm_medium captured on landing';
COMMENT ON COLUMN public.users.utm_campaign IS 'First-touch utm_campaign captured on landing';
COMMENT ON COLUMN public.users.referrer IS 'First-touch external document.referrer captured on landing';
