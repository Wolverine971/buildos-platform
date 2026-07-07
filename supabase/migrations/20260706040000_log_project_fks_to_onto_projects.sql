-- supabase/migrations/20260706040000_log_project_fks_to_onto_projects.sql
-- Align active logging tables with ontology projects.
--
-- error_logs.project_id and llm_usage_logs.project_id were still constrained to
-- legacy projects(id). Current callers pass onto_projects.id, causing valid
-- project attribution to be dropped by defensive FK retry paths.

-- Drop legacy project FKs first so existing legacy IDs can be remapped to their
-- ontology project IDs.
ALTER TABLE IF EXISTS public.error_logs
	DROP CONSTRAINT IF EXISTS error_logs_project_id_fkey;

ALTER TABLE IF EXISTS public.llm_usage_logs
	DROP CONSTRAINT IF EXISTS llm_usage_logs_project_id_fkey;

-- Preserve historical attribution by translating legacy project IDs through the
-- migration mapping table.
UPDATE public.error_logs AS log
SET project_id = mapping.onto_id
FROM public.legacy_entity_mappings AS mapping
WHERE mapping.legacy_table = 'projects'
	AND mapping.onto_table = 'onto_projects'
	AND log.project_id = mapping.legacy_id;

UPDATE public.llm_usage_logs AS log
SET project_id = mapping.onto_id
FROM public.legacy_entity_mappings AS mapping
WHERE mapping.legacy_table = 'projects'
	AND mapping.onto_table = 'onto_projects'
	AND log.project_id = mapping.legacy_id;

-- If an environment has stale/unmapped legacy IDs, keep the log row and clear
-- only the optional project pointer so the new FK can validate.
UPDATE public.error_logs AS log
SET project_id = NULL
WHERE log.project_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM public.onto_projects AS project
		WHERE project.id = log.project_id
	);

UPDATE public.llm_usage_logs AS log
SET project_id = NULL
WHERE log.project_id IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM public.onto_projects AS project
		WHERE project.id = log.project_id
	);

ALTER TABLE IF EXISTS public.error_logs
	ADD CONSTRAINT error_logs_project_id_fkey
	FOREIGN KEY (project_id)
	REFERENCES public.onto_projects(id)
	ON DELETE SET NULL
	NOT VALID;

ALTER TABLE IF EXISTS public.llm_usage_logs
	ADD CONSTRAINT llm_usage_logs_project_id_fkey
	FOREIGN KEY (project_id)
	REFERENCES public.onto_projects(id)
	ON DELETE SET NULL
	NOT VALID;

ALTER TABLE IF EXISTS public.error_logs
	VALIDATE CONSTRAINT error_logs_project_id_fkey;

ALTER TABLE IF EXISTS public.llm_usage_logs
	VALIDATE CONSTRAINT llm_usage_logs_project_id_fkey;

CREATE INDEX IF NOT EXISTS idx_error_logs_project_created
	ON public.error_logs(project_id, created_at DESC)
	WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_project_created
	ON public.llm_usage_logs(project_id, created_at DESC)
	WHERE project_id IS NOT NULL;
