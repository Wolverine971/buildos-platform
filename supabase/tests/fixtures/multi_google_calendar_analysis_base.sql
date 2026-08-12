-- Minimal pre-20260812060000 schema for the focused Calendar analysis provenance test.
-- PSQL-ONLY / EMPTY DISPOSABLE DATABASE ONLY.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.user_calendar_sources (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE public.calendar_analyses (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	calendar_source_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
	status text
);

CREATE TABLE public.calendar_project_suggestions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	analysis_id uuid NOT NULL REFERENCES public.calendar_analyses(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	calendar_event_ids text[] NOT NULL,
	confidence_score numeric NOT NULL,
	suggested_name text NOT NULL
);

CREATE TABLE public.calendar_analysis_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	analysis_id uuid NOT NULL REFERENCES public.calendar_analyses(id) ON DELETE CASCADE,
	calendar_source_id uuid REFERENCES public.user_calendar_sources(id) ON DELETE SET NULL,
	calendar_id text NOT NULL,
	calendar_event_id text NOT NULL,
	CONSTRAINT calendar_analysis_events_analysis_id_calendar_event_id_key
		UNIQUE (analysis_id, calendar_event_id)
);
