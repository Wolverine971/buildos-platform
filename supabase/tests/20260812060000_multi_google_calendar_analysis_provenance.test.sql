-- Disposable verification for source-qualified Calendar analysis persistence.
-- Apply all migrations through 20260812060000, or the focused base fixture plus that migration,
-- before running. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

INSERT INTO public.users (id)
VALUES ('ca160000-0000-4000-8000-000000000001');

INSERT INTO public.user_calendar_sources (id, user_id)
VALUES
	(
		'ca360000-0000-4000-8000-000000000001',
		'ca160000-0000-4000-8000-000000000001'
	),
	(
		'ca360000-0000-4000-8000-000000000002',
		'ca160000-0000-4000-8000-000000000001'
	);

INSERT INTO public.calendar_analyses (id, user_id, status)
VALUES (
	'ca460000-0000-4000-8000-000000000001',
	'ca160000-0000-4000-8000-000000000001',
	'processing'
);

INSERT INTO public.calendar_analysis_events (
	analysis_id,
	calendar_source_id,
	calendar_id,
	calendar_event_id
)
VALUES
	(
		'ca460000-0000-4000-8000-000000000001',
		'ca360000-0000-4000-8000-000000000001',
		'calendar-one@example.com',
		'shared-provider-event'
	),
	(
		'ca460000-0000-4000-8000-000000000001',
		'ca360000-0000-4000-8000-000000000002',
		'calendar-two@example.com',
		'shared-provider-event'
	),
	(
		'ca460000-0000-4000-8000-000000000001',
		NULL,
		'primary',
		'shared-provider-event'
	);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 3
		FROM public.calendar_analysis_events
		WHERE analysis_id = 'ca460000-0000-4000-8000-000000000001'
	),
	'legacy and source-qualified snapshots must coexist for the same provider event ID'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			INSERT INTO public.calendar_analysis_events (
				analysis_id, calendar_source_id, calendar_id, calendar_event_id
			)
			VALUES (
				'ca460000-0000-4000-8000-000000000001',
				'ca360000-0000-4000-8000-000000000001',
				'calendar-one@example.com',
				'shared-provider-event'
			)
		$statement$,
		'duplicate key value'
	),
	'a source-qualified analysis event must be unique within its source'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			INSERT INTO public.calendar_analysis_events (
				analysis_id, calendar_source_id, calendar_id, calendar_event_id
			)
			VALUES (
				'ca460000-0000-4000-8000-000000000001',
				NULL,
				'primary',
				'shared-provider-event'
			)
		$statement$,
		'duplicate key value'
	),
	'a legacy analysis event must remain unique by analysis and provider event ID'
);

UPDATE public.calendar_analyses
SET
	partial_result = true,
	source_statuses = '[{"calendarSourceId":"ca360000-0000-4000-8000-000000000001","status":"success"}]'::jsonb,
	analysis_warnings = '[{"code":"CALENDAR_PARTIAL_RESULT"}]'::jsonb
WHERE id = 'ca460000-0000-4000-8000-000000000001';

UPDATE public.calendar_analysis_events
SET contributing_source_event_ids = '[
	{"calendarSourceId":"ca360000-0000-4000-8000-000000000001","providerEventId":"shared-provider-event"},
	{"calendarSourceId":"ca360000-0000-4000-8000-000000000002","providerEventId":"shared-provider-event"}
]'::jsonb
WHERE analysis_id = 'ca460000-0000-4000-8000-000000000001'
	AND calendar_source_id = 'ca360000-0000-4000-8000-000000000001';

INSERT INTO public.calendar_project_suggestions (
	analysis_id,
	user_id,
	calendar_event_ids,
	calendar_source_event_ids,
	confidence_score,
	suggested_name
)
VALUES (
	'ca460000-0000-4000-8000-000000000001',
	'ca160000-0000-4000-8000-000000000001',
	ARRAY['shared-provider-event'],
	'[{"calendarSourceId":"ca360000-0000-4000-8000-000000000001","providerEventId":"shared-provider-event"}]'::jsonb,
	0.9,
	'Source-aware suggestion'
);

SELECT pg_temp.assert_true(
	(
		SELECT
			partial_result
			AND jsonb_array_length(source_statuses) = 1
			AND jsonb_array_length(analysis_warnings) = 1
		FROM public.calendar_analyses
		WHERE id = 'ca460000-0000-4000-8000-000000000001'
	),
	'analysis rows must retain partial coverage diagnostics'
);

SELECT pg_temp.assert_true(
	(
		SELECT jsonb_array_length(contributing_source_event_ids) = 2
		FROM public.calendar_analysis_events
		WHERE analysis_id = 'ca460000-0000-4000-8000-000000000001'
			AND calendar_source_id = 'ca360000-0000-4000-8000-000000000001'
	),
	'deduplicated analysis events must retain every contributing source/event identity'
);

SELECT pg_temp.assert_true(
	(
		SELECT jsonb_array_length(calendar_source_event_ids) = 1
		FROM public.calendar_project_suggestions
		WHERE analysis_id = 'ca460000-0000-4000-8000-000000000001'
	),
	'suggestions must retain source and provider event identity together'
);

ROLLBACK;
