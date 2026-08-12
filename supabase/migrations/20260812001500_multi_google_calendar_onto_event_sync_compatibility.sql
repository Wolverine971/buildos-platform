-- supabase/migrations/20260812001500_multi_google_calendar_onto_event_sync_compatibility.sql
-- Expand/contract compatibility for the onto_event_sync calendar FK rename.
--
-- The hosted application can continue writing calendar_id while the new application writes
-- project_calendar_id. Both names represent the same internal project_calendars.id value. Remove
-- the alias only after every web/worker deployment and queued payload has moved to the new name.

BEGIN;

ALTER TABLE public.onto_event_sync
	ADD COLUMN calendar_id uuid;

UPDATE public.onto_event_sync
SET calendar_id = project_calendar_id;

ALTER TABLE public.onto_event_sync
	ADD CONSTRAINT onto_event_sync_calendar_id_fkey
	FOREIGN KEY (calendar_id)
	REFERENCES public.project_calendars(id)
	ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.synchronize_onto_event_sync_calendar_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.calendar_id IS NOT NULL
			AND NEW.project_calendar_id IS NOT NULL
			AND NEW.calendar_id IS DISTINCT FROM NEW.project_calendar_id
		THEN
			RAISE EXCEPTION 'onto_event_sync_calendar_alias_mismatch'
				USING ERRCODE = 'check_violation';
		END IF;

		NEW.project_calendar_id := COALESCE(NEW.project_calendar_id, NEW.calendar_id);
		NEW.calendar_id := COALESCE(NEW.calendar_id, NEW.project_calendar_id);
		RETURN NEW;
	END IF;

	IF NEW.calendar_id IS DISTINCT FROM OLD.calendar_id
		AND NEW.project_calendar_id IS NOT DISTINCT FROM OLD.project_calendar_id
	THEN
		NEW.project_calendar_id := NEW.calendar_id;
	ELSIF NEW.project_calendar_id IS DISTINCT FROM OLD.project_calendar_id
		AND NEW.calendar_id IS NOT DISTINCT FROM OLD.calendar_id
	THEN
		NEW.calendar_id := NEW.project_calendar_id;
	END IF;

	IF NEW.calendar_id IS DISTINCT FROM NEW.project_calendar_id THEN
		RAISE EXCEPTION 'onto_event_sync_calendar_alias_mismatch'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

CREATE TRIGGER synchronize_onto_event_sync_calendar_alias_trigger
	BEFORE INSERT OR UPDATE OF calendar_id, project_calendar_id
	ON public.onto_event_sync
	FOR EACH ROW
	EXECUTE FUNCTION public.synchronize_onto_event_sync_calendar_alias();

ALTER TABLE public.onto_event_sync
	ADD CONSTRAINT onto_event_sync_calendar_alias_check
	CHECK (calendar_id IS NOT DISTINCT FROM project_calendar_id);

COMMENT ON COLUMN public.onto_event_sync.calendar_id IS
	'Deprecated deploy-compatibility alias for project_calendar_id; remove after all runtimes migrate.';

COMMIT;
