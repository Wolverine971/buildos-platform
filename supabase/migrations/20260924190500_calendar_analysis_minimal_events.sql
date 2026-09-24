-- supabase/migrations/20260924190500_calendar_analysis_minimal_events.sql
-- Tasker 103 (CALMIN): calendar analysis keeps only the title, start and end of
-- the events a suggestion cites, and deletes them with that suggestion.
--
--   * Rows that back no suggestion are deleted, and suggestion_id becomes NOT NULL.
--   * event_description, event_location and attendee_emails are dropped (only the
--     old writer used them; the inbox evidence reader selects title/start/end).
--   * suggestion_id cascades, so a row goes when its suggestion goes.
--   * cleanup_privacy_calendar_analysis_events (first defined in
--     20260924190000, 7 days) is redefined here: 30 days after the row was
--     written. Suggestions themselves go 30 days after the decision, or 30 days
--     after the analysis if never decided (cleanup_privacy_calendar_analyses).
--
-- Data: deletes every existing row today (all 3,602 prod rows predate this
-- writer and carry no suggestion_id). Writer: calendar-analysis.service.ts
-- storeAnalysisEvents.

BEGIN;

SET LOCAL lock_timeout = '5s';

DELETE FROM public.calendar_analysis_events events
WHERE events.suggestion_id IS NULL
	OR NOT EXISTS (
		SELECT 1
		FROM public.calendar_project_suggestions suggestions
		WHERE suggestions.id = events.suggestion_id
			AND events.calendar_event_id = ANY (suggestions.calendar_event_ids)
	);

ALTER TABLE public.calendar_analysis_events
	DROP COLUMN IF EXISTS event_description,
	DROP COLUMN IF EXISTS event_location,
	DROP COLUMN IF EXISTS attendee_emails,
	ALTER COLUMN suggestion_id SET NOT NULL;

-- The table predates the migration history, so drop whatever FK sits on
-- suggestion_id before adding the cascading one.
DO $fk$
DECLARE
	v_name text;
BEGIN
	FOR v_name IN
		SELECT constraints.conname
		FROM pg_catalog.pg_constraint constraints
		JOIN pg_catalog.pg_attribute attributes
			ON attributes.attrelid = constraints.conrelid
			AND attributes.attnum = ANY (constraints.conkey)
		WHERE constraints.conrelid = 'public.calendar_analysis_events'::regclass
			AND constraints.contype = 'f'
			AND attributes.attname = 'suggestion_id'
	LOOP
		EXECUTE format(
			'ALTER TABLE public.calendar_analysis_events DROP CONSTRAINT %I',
			v_name
		);
	END LOOP;
END;
$fk$;

ALTER TABLE public.calendar_analysis_events
	ADD CONSTRAINT calendar_analysis_events_suggestion_id_fkey
	FOREIGN KEY (suggestion_id)
	REFERENCES public.calendar_project_suggestions(id)
	ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calendar_analysis_events_suggestion_id_idx
	ON public.calendar_analysis_events (suggestion_id);

-- Same name and signature as 20260924190000, which the worker schedules
-- (privacyRetention.ts). The cascade above handles earlier suggestion deletes.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_calendar_analysis_events(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT events.id
		FROM public.calendar_analysis_events events
		WHERE COALESCE(events.created_at, '-infinity'::timestamptz) <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.calendar_analysis_events events
	USING candidates
	WHERE events.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('calendar_analysis_events_deleted', v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_privacy_calendar_analysis_events(integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_privacy_calendar_analysis_events(integer)
	TO service_role;

COMMIT;
