-- supabase/migrations/20261028170000_push_subscriptions_native_providers.sql
--
-- The BuildOS iPhone app registers Expo push tokens. They live in push_subscriptions beside
-- the Web Push subscriptions so emit_notification_event's fan-out (one 'push' delivery per
-- active row, channel_identifier = endpoint) and the user's push preference apply unchanged,
-- and the daily brief reaches the phone with no new settings.
--
--   provider     'web_push' (VAPID, the browser/PWA)  |  'expo' (Expo push service token)
--   platform     'web' | 'ios' | 'android'
--   device_name  shown in the devices list ("DJ's iPhone")
--   app_version  the native app build that registered the token
--
-- Expo rows have no encryption keys, so p256dh_key and auth_key become nullable; a CHECK
-- keeps Web Push rows complete. endpoint stays UNIQUE: an Expo token is unique per install.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE public.push_subscriptions
	ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'web_push',
	ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web',
	ADD COLUMN IF NOT EXISTS device_name text NULL,
	ADD COLUMN IF NOT EXISTS app_version text NULL;

ALTER TABLE public.push_subscriptions
	ALTER COLUMN p256dh_key DROP NOT NULL,
	ALTER COLUMN auth_key DROP NOT NULL;

ALTER TABLE public.push_subscriptions
	DROP CONSTRAINT IF EXISTS push_subscriptions_provider_check,
	ADD CONSTRAINT push_subscriptions_provider_check CHECK (provider IN ('web_push', 'expo'));

ALTER TABLE public.push_subscriptions
	DROP CONSTRAINT IF EXISTS push_subscriptions_platform_check,
	ADD CONSTRAINT push_subscriptions_platform_check CHECK (platform IN ('web', 'ios', 'android'));

ALTER TABLE public.push_subscriptions
	DROP CONSTRAINT IF EXISTS push_subscriptions_provider_keys_check,
	ADD CONSTRAINT push_subscriptions_provider_keys_check CHECK (
		(provider = 'web_push' AND p256dh_key IS NOT NULL AND auth_key IS NOT NULL)
		OR (provider = 'expo' AND char_length(endpoint) BETWEEN 10 AND 200)
	);

ALTER TABLE public.push_subscriptions
	DROP CONSTRAINT IF EXISTS push_subscriptions_device_name_check,
	ADD CONSTRAINT push_subscriptions_device_name_check CHECK (
		device_name IS NULL OR char_length(device_name) <= 120
	);

ALTER TABLE public.push_subscriptions
	DROP CONSTRAINT IF EXISTS push_subscriptions_app_version_check,
	ADD CONSTRAINT push_subscriptions_app_version_check CHECK (
		app_version IS NULL OR char_length(app_version) <= 40
	);

COMMENT ON TABLE public.push_subscriptions IS
	'Push delivery targets per user: Web Push subscriptions (provider web_push) and native Expo push tokens (provider expo).';
COMMENT ON COLUMN public.push_subscriptions.provider IS 'web_push (VAPID) or expo (Expo push service)';
COMMENT ON COLUMN public.push_subscriptions.platform IS 'web, ios or android';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS 'Unique push service endpoint URL (web_push) or Expo push token (expo)';
