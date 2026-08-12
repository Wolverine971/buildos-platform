-- Preserve source-qualified identities and partial-coverage diagnostics for Calendar analysis.

BEGIN;

ALTER TABLE public.calendar_analyses
	ADD COLUMN partial_result boolean NOT NULL DEFAULT false,
	ADD COLUMN source_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD COLUMN analysis_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD CONSTRAINT calendar_analyses_source_statuses_array_check
		CHECK (jsonb_typeof(source_statuses) = 'array'),
	ADD CONSTRAINT calendar_analyses_analysis_warnings_array_check
		CHECK (jsonb_typeof(analysis_warnings) = 'array');

ALTER TABLE public.calendar_project_suggestions
	ADD COLUMN calendar_source_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD CONSTRAINT calendar_project_suggestions_source_event_ids_array_check
		CHECK (jsonb_typeof(calendar_source_event_ids) = 'array');

ALTER TABLE public.calendar_analysis_events
	ADD COLUMN contributing_source_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD CONSTRAINT calendar_analysis_events_source_events_array_check
		CHECK (jsonb_typeof(contributing_source_event_ids) = 'array');

-- The original analysis/event uniqueness key loses source identity. Keep it only for compatibility
-- rows and let distinct source-backed snapshots retain the same provider event ID safely.
ALTER TABLE public.calendar_analysis_events
	DROP CONSTRAINT IF EXISTS calendar_analysis_events_analysis_id_calendar_event_id_key;

CREATE UNIQUE INDEX calendar_analysis_events_legacy_identity_idx
	ON public.calendar_analysis_events (analysis_id, calendar_event_id)
	WHERE calendar_source_id IS NULL;

CREATE UNIQUE INDEX calendar_analysis_events_source_identity_idx
	ON public.calendar_analysis_events (analysis_id, calendar_source_id, calendar_event_id)
	WHERE calendar_source_id IS NOT NULL;

COMMIT;
