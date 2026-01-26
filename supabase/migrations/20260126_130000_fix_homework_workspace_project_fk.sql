-- supabase/migrations/20260126_130000_fix_homework_workspace_project_fk.sql
-- Description: Fix homework_runs.workspace_project_id to reference onto_projects

ALTER TABLE homework_runs
	DROP CONSTRAINT IF EXISTS homework_runs_workspace_project_id_fkey;

ALTER TABLE homework_runs
	ADD CONSTRAINT homework_runs_workspace_project_id_fkey
	FOREIGN KEY (workspace_project_id) REFERENCES onto_projects(id) ON DELETE SET NULL;
