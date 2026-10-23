-- supabase/migrations/20261023150000_people_layer_owner_only_invites.sql
--
-- People layer follow-up (docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md, "DJ direction").
--
-- 1. Sharing is owner-only. The API already requires the owner to create, resend, or revoke
--    an invite, but the table policies still let editors read and write invites directly
--    through the database API (20260423000003). Editors could re-share a project, and could
--    read the email behind an invite that was sent by handle.
-- 2. Agents never get more than their person. A member moved from Editor to Viewer kept
--    agent_access = 'write'. The agent gateway already refused those writes (it needs the
--    person's own write access first); this keeps the stored value honest too.

DROP POLICY IF EXISTS project_invites_select_write ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_insert_write ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_update_write ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_delete_write ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_select_owner ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_insert_owner ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_update_owner ON public.onto_project_invites;
DROP POLICY IF EXISTS project_invites_delete_owner ON public.onto_project_invites;

CREATE POLICY project_invites_select_owner
	ON public.onto_project_invites
	FOR SELECT
	TO authenticated
	USING (public.current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY project_invites_insert_owner
	ON public.onto_project_invites
	FOR INSERT
	TO authenticated
	WITH CHECK (public.current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY project_invites_update_owner
	ON public.onto_project_invites
	FOR UPDATE
	TO authenticated
	USING (public.current_actor_has_project_access(project_id, 'admin'))
	WITH CHECK (public.current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY project_invites_delete_owner
	ON public.onto_project_invites
	FOR DELETE
	TO authenticated
	USING (public.current_actor_has_project_access(project_id, 'admin'));

CREATE OR REPLACE FUNCTION public.clamp_project_member_agent_access()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF NEW.agent_access = 'write' AND NEW.access NOT IN ('write', 'admin') THEN
		NEW.agent_access := 'read';
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clamp_project_member_agent_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_project_members_clamp_agent_access ON public.onto_project_members;
CREATE TRIGGER trg_onto_project_members_clamp_agent_access
	BEFORE INSERT OR UPDATE OF access, agent_access ON public.onto_project_members
	FOR EACH ROW
	EXECUTE FUNCTION public.clamp_project_member_agent_access();

-- Rows that already drifted.
UPDATE public.onto_project_members
SET agent_access = 'read'
WHERE agent_access = 'write'
	AND access NOT IN ('write', 'admin');
