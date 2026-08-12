-- supabase/tests/20260812001500_multi_google_calendar_onto_event_sync_compatibility.test.sql
BEGIN;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'onto_event_sync'
			AND column_name = 'calendar_id'
	) THEN
		RAISE EXCEPTION 'calendar_id compatibility alias is missing';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.onto_event_sync'::regclass
			AND conname = 'onto_event_sync_calendar_alias_check'
	) THEN
		RAISE EXCEPTION 'calendar alias equality constraint is missing';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgrelid = 'public.onto_event_sync'::regclass
			AND tgname = 'synchronize_onto_event_sync_calendar_alias_trigger'
			AND NOT tgisinternal
	) THEN
		RAISE EXCEPTION 'calendar alias synchronization trigger is missing';
	END IF;
END;
$$;

CREATE TEMP TABLE onto_event_sync_alias_fixture (
	calendar_id uuid,
	project_calendar_id uuid
);

CREATE TRIGGER synchronize_fixture_calendar_alias_trigger
	BEFORE INSERT OR UPDATE OF calendar_id, project_calendar_id
	ON onto_event_sync_alias_fixture
	FOR EACH ROW
	EXECUTE FUNCTION public.synchronize_onto_event_sync_calendar_alias();

INSERT INTO onto_event_sync_alias_fixture (calendar_id)
VALUES ('11111111-1111-4111-8111-111111111111');

INSERT INTO onto_event_sync_alias_fixture (project_calendar_id)
VALUES ('22222222-2222-4222-8222-222222222222');

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM onto_event_sync_alias_fixture
		WHERE calendar_id IS DISTINCT FROM project_calendar_id
	) THEN
		RAISE EXCEPTION 'insert compatibility did not synchronize both column names';
	END IF;
END;
$$;

UPDATE onto_event_sync_alias_fixture
SET calendar_id = '33333333-3333-4333-8333-333333333333'
WHERE calendar_id = '11111111-1111-4111-8111-111111111111';

UPDATE onto_event_sync_alias_fixture
SET project_calendar_id = '44444444-4444-4444-8444-444444444444'
WHERE project_calendar_id = '22222222-2222-4222-8222-222222222222';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM onto_event_sync_alias_fixture
		WHERE calendar_id IS DISTINCT FROM project_calendar_id
	) THEN
		RAISE EXCEPTION 'update compatibility did not synchronize both column names';
	END IF;
END;
$$;

DO $$
BEGIN
	BEGIN
		INSERT INTO onto_event_sync_alias_fixture (calendar_id, project_calendar_id)
		VALUES (
			'55555555-5555-4555-8555-555555555555',
			'66666666-6666-4666-8666-666666666666'
		);
		RAISE EXCEPTION 'mismatched aliases were accepted';
	EXCEPTION
		WHEN check_violation THEN
			NULL;
	END;
END;
$$;

ROLLBACK;
