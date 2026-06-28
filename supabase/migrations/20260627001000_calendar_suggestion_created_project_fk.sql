-- supabase/migrations/20260627001000_calendar_suggestion_created_project_fk.sql
--
-- Calendar suggestion acceptance creates ontology projects via instantiateProject().
-- The source row link must therefore reference onto_projects, not the legacy
-- projects table.

DO $$
BEGIN
	IF to_regclass('public.calendar_project_suggestions') IS NULL THEN
		RETURN;
	END IF;
	IF to_regclass('public.onto_projects') IS NULL THEN
		RETURN;
	END IF;

	ALTER TABLE public.calendar_project_suggestions
		DROP CONSTRAINT IF EXISTS calendar_project_suggestions_created_project_id_fkey;

	UPDATE public.calendar_project_suggestions cps
	SET created_project_id = NULL
	WHERE cps.created_project_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM public.onto_projects op
			WHERE op.id = cps.created_project_id
		);

	ALTER TABLE public.calendar_project_suggestions
		ADD CONSTRAINT calendar_project_suggestions_created_project_id_fkey
		FOREIGN KEY (created_project_id)
		REFERENCES public.onto_projects(id)
		ON DELETE SET NULL;
END $$;
