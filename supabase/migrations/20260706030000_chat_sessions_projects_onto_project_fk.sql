-- supabase/migrations/20260706030000_chat_sessions_projects_onto_project_fk.sql
-- Align project-scoped chat session links with the ontology project table.
--
-- `chat_sessions_projects.project_id` was still constrained to the legacy
-- `projects(id)` table. Project loops, project-suggestion chats, agent-run
-- project chats, and Complete Project Audit all pass `onto_projects.id`, so the
-- old FK rejects valid ontology project sessions in production.

ALTER TABLE IF EXISTS public.chat_sessions_projects
	DROP CONSTRAINT IF EXISTS chat_sessions_projects_project_id_fkey;

ALTER TABLE IF EXISTS public.chat_sessions_projects
	ADD CONSTRAINT chat_sessions_projects_project_id_fkey
	FOREIGN KEY (project_id)
	REFERENCES public.onto_projects(id)
	ON DELETE CASCADE
	NOT VALID;

-- Enforce the same relationship for future inserts immediately, then validate
-- existing data. Validation should pass in production because this junction
-- table currently has no rows; if another environment still has legacy links,
-- the migration should fail loudly so those rows can be inspected.
ALTER TABLE IF EXISTS public.chat_sessions_projects
	VALIDATE CONSTRAINT chat_sessions_projects_project_id_fkey;
