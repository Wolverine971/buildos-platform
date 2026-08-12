-- supabase/tests/fixtures/multi_google_calendar_webhook_identity_base.sql
-- Minimal pre-20260812050000 schema for the focused webhook identity migration test.
-- PSQL-ONLY / EMPTY DISPOSABLE DATABASE ONLY.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.user_calendar_connections (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	provider text NOT NULL DEFAULT 'google_calendar',
	provider_account_id text NOT NULL,
	email_address text NOT NULL,
	account_label text NOT NULL,
	UNIQUE (id, user_id),
	UNIQUE (user_id, provider, provider_account_id)
);

CREATE TABLE public.user_calendar_sources (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid NOT NULL,
	provider_calendar_id text NOT NULL,
	summary text NOT NULL,
	access_role text NOT NULL,
	UNIQUE (id, user_id),
	FOREIGN KEY (connection_id, user_id)
		REFERENCES public.user_calendar_connections(id, user_id)
		ON DELETE CASCADE
);

CREATE TABLE public.calendar_webhook_channels (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	channel_id text NOT NULL UNIQUE,
	resource_id text,
	calendar_id text,
	calendar_source_id uuid,
	expiration bigint NOT NULL,
	sync_token text,
	webhook_token text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT calendar_webhook_channels_user_id_calendar_id_key
		UNIQUE (user_id, calendar_id),
	CONSTRAINT calendar_webhook_channels_calendar_source_owner_fkey
		FOREIGN KEY (calendar_source_id, user_id)
		REFERENCES public.user_calendar_sources(id, user_id)
		ON DELETE SET NULL (calendar_source_id)
);

CREATE UNIQUE INDEX calendar_webhook_channels_source_idx
	ON public.calendar_webhook_channels (calendar_source_id)
	WHERE calendar_source_id IS NOT NULL;
