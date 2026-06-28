-- supabase/migrations/20260627000000_calendar_suggestion_processing_status.sql
--
-- Calendar suggestion acceptance uses a short-lived "processing" status as an
-- atomic claim before creating the project/tasks. Older environments only
-- documented/allowed pending|accepted|rejected, which makes the AI Inbox
-- Accept action fail at the claim step.

DO $$
DECLARE
	v_constraint_name text;
BEGIN
	IF to_regclass('public.calendar_project_suggestions') IS NULL THEN
		RETURN;
	END IF;

	FOR v_constraint_name IN
		SELECT c.conname
		FROM pg_constraint c
		JOIN pg_class t ON t.oid = c.conrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE n.nspname = 'public'
			AND t.relname = 'calendar_project_suggestions'
			AND c.contype = 'c'
			AND pg_get_constraintdef(c.oid) ILIKE '%status%'
	LOOP
		EXECUTE format(
			'ALTER TABLE public.calendar_project_suggestions DROP CONSTRAINT IF EXISTS %I',
			v_constraint_name
		);
	END LOOP;

	ALTER TABLE public.calendar_project_suggestions
		ADD CONSTRAINT calendar_project_suggestions_status_check
		CHECK (
			status IS NULL
			OR status IN (
				'pending',
				'processing',
				'accepted',
				'rejected',
				'modified',
				'deferred'
			)
		);
END $$;
