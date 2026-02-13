-- supabase/migrations/20260423000003_allow_editor_invite_management.sql
-- Allow collaborators with write access (owners/editors) to manage project invites.
-- Editors can create/list/resend/revoke invites; viewers remain read-only.
-- Date: 2026-04-23

BEGIN;

DROP POLICY IF EXISTS project_invites_select_admin ON onto_project_invites;
DROP POLICY IF EXISTS project_invites_insert_admin ON onto_project_invites;
DROP POLICY IF EXISTS project_invites_update_admin ON onto_project_invites;
DROP POLICY IF EXISTS project_invites_delete_admin ON onto_project_invites;

DROP POLICY IF EXISTS project_invites_select_write ON onto_project_invites;
DROP POLICY IF EXISTS project_invites_insert_write ON onto_project_invites;
DROP POLICY IF EXISTS project_invites_update_write ON onto_project_invites;
DROP POLICY IF EXISTS project_invites_delete_write ON onto_project_invites;

CREATE POLICY "project_invites_select_write"
	ON onto_project_invites FOR SELECT
	USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "project_invites_insert_write"
	ON onto_project_invites FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "project_invites_update_write"
	ON onto_project_invites FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "project_invites_delete_write"
	ON onto_project_invites FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));

COMMIT;
