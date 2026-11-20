-- supabase/tests/20261120120000_stored_file_paths_plain_segments.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261120120000_stored_file_paths_plain_segments.sql \
--     --check supabase/tests/20261120120000_stored_file_paths_plain_segments.check.sql
--
-- For each of the three path columns: the shapes the app writes are accepted, and every
-- spelling that fetch would resolve out of the folder is refused with a check violation.
-- Foreign keys and row triggers are switched off so the rows need no parents and the result
-- shows the constraints alone (the older triggers only refuse a literal `..`).

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path = public, extensions;
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE results (key text PRIMARY KEY, value text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.try(p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
		INSERT INTO results VALUES (p_key, 'ok');
	EXCEPTION WHEN check_violation THEN
		INSERT INTO results VALUES (p_key, 'check_violation');
	END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.voice(p_path text) RETURNS text LANGUAGE sql AS $$
	SELECT format(
		'INSERT INTO public.voice_notes (user_id, storage_path, file_size_bytes, mime_type)
		 VALUES (%L, %L, 1, %L)',
		'11111111-1111-4111-8111-111111111111', p_path, 'audio/webm');
$$;

CREATE OR REPLACE FUNCTION pg_temp.asset(p_path text) RETURNS text LANGUAGE sql AS $$
	SELECT format(
		'INSERT INTO public.onto_assets
			(project_id, storage_path, content_type, file_size_bytes, created_by, storage_project_id)
		 VALUES (%L, %L, %L, 1, %L, %L)',
		'22222222-2222-4222-8222-222222222222', p_path, 'image/png',
		'33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222');
$$;

CREATE OR REPLACE FUNCTION pg_temp.brief(p_path text, p_day int) RETURNS text LANGUAGE sql AS $$
	SELECT format(
		'INSERT INTO public.ontology_daily_briefs (user_id, actor_id, brief_date, audio_storage_path)
		 VALUES (%L, %L, %L, %L)',
		'11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
		date '2026-01-01' + p_day, p_path);
$$;

-- Shapes the app writes.
SELECT pg_temp.try('voice ok', pg_temp.voice('11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.webm'));
SELECT pg_temp.try('asset ok', pg_temp.asset('projects/22222222-2222-4222-8222-222222222222/assets/55555555-5555-4555-8555-555555555555/original.png'));
SELECT pg_temp.try('brief ok', pg_temp.brief('11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666.mp3', 0));
SELECT pg_temp.try('brief no audio', pg_temp.brief(NULL, 1));

-- Spellings fetch resolves as a parent segment, and characters that end or re-split the path.
SELECT pg_temp.try('voice encoded climb', pg_temp.voice('11111111-1111-4111-8111-111111111111/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/users?select=*'));
SELECT pg_temp.try('voice upper encoded climb', pg_temp.voice('11111111-1111-4111-8111-111111111111/%2E%2E/other/note.webm'));
SELECT pg_temp.try('voice half encoded climb', pg_temp.voice('11111111-1111-4111-8111-111111111111/.%2e/other/note.webm'));
SELECT pg_temp.try('voice tab climb', pg_temp.voice(E'11111111-1111-4111-8111-111111111111/.\t./other/note.webm'));
SELECT pg_temp.try('voice literal climb', pg_temp.voice('11111111-1111-4111-8111-111111111111/../other/note.webm'));
SELECT pg_temp.try('voice query', pg_temp.voice('11111111-1111-4111-8111-111111111111/note.webm?x=1'));
SELECT pg_temp.try('voice backslash', pg_temp.voice('11111111-1111-4111-8111-111111111111\..\note.webm'));
SELECT pg_temp.try('voice trailing newline', pg_temp.voice(E'11111111-1111-4111-8111-111111111111/note.webm\n'));
SELECT pg_temp.try('asset encoded climb', pg_temp.asset('projects/22222222-2222-4222-8222-222222222222/assets/55555555-5555-4555-8555-555555555555/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/voice_notes/u/v.webm'));
SELECT pg_temp.try('asset fragment', pg_temp.asset('projects/22222222-2222-4222-8222-222222222222/assets/55555555-5555-4555-8555-555555555555/original.png#x'));
SELECT pg_temp.try('brief encoded climb', pg_temp.brief('11111111-1111-4111-8111-111111111111/%2e%2e/other/audio.mp3', 2));
SELECT pg_temp.try('brief other owner folder', pg_temp.brief('77777777-7777-4777-8777-777777777777/66666666-6666-4666-8666-666666666666.mp3', 3));

DO $$
DECLARE
	v_bad text;
BEGIN
	SELECT string_agg(format('%s=%s', key, value), ', ' ORDER BY key) INTO v_bad
	FROM results
	WHERE value IS DISTINCT FROM
		CASE WHEN key IN ('voice ok', 'asset ok', 'brief ok', 'brief no audio')
			THEN 'ok' ELSE 'check_violation' END;
	IF v_bad IS NOT NULL THEN
		RAISE EXCEPTION 'assertion_failed: %', v_bad;
	END IF;
	IF (SELECT count(*) FROM results) <> 16 THEN
		RAISE EXCEPTION 'assertion_failed: expected 16 results, got %', (SELECT count(*) FROM results);
	END IF;
	RAISE NOTICE 'stored file path checks passed (16 cases)';
END;
$$;

ROLLBACK;
