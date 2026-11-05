-- supabase/migrations/20261105120200_project_owner_columns_guard.sql
--
-- Security audit 2026-11-05, shared-project ownership. A signed-in editor (write member) could
-- UPDATE any column of a shared project through the table API (project_update_member plus a
-- table-wide grant):
--   - created_by, the owner pointer every access check reads, so an editor could make
--     themselves the owner and lock the real owner out;
--   - deleted_at, directly or by calling soft_delete_onto_project (SECURITY INVOKER), which
--     trashes the project for everyone and queues removal of every member's Google copies;
--   - is_public and props.featured_public_example, which put a project on the anonymous
--     homepage example picker, and icon_svg, which that picker rendered as live markup;
--   - external_agent_access, which the app only lets project admins change.
-- Separately, any signed-in user could insert an onto_task_assignees row naming a stranger's
-- actor on a task in their own project; definer readers such as get_project_full_v2_initial
-- then returned that stranger's name, email and user id.
--
-- Both guards only act on signed-in or anonymous writers (current_user authenticated/anon).
-- The worker and server routes (service_role) and SECURITY DEFINER functions (current_user is
-- their owner) keep working: transfer_onto_project_ownership, restore_onto_project,
-- delete_onto_project, onto_task_move_atomic and the seed script that features a project.
--
-- onto_projects, for signed-in writers:
--   - created_by never changes (ownership moves only through transfer_onto_project_ownership);
--   - deleted_at changes only for the owner (the app's delete route is owner-only already);
--   - is_public and icon_svg never change, and a new row can't start public or with an icon
--     (no app flow sets either; icon generation was retired);
--   - props.featured_public_example is pinned to its old value (dropped on insert), so a
--     whole-props save still works;
--   - external_agent_access changes only for project admins (as the app route checks).
-- onto_task_assignees, for signed-in writers: the assignee must be the project owner or an
-- active (removed_at IS NULL) member. This is the rule task-assignment.service.ts and the
-- agent gateway already apply; it now also covers direct inserts and onto_task_create_atomic
-- / onto_task_update_atomic (SECURITY INVOKER).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.onto_projects_guard_owner_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
	v_actor uuid;
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF COALESCE(NEW.is_public, false) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_publication_server_only',
				DETAIL = 'Only BuildOS can publish a project as a public example.';
		END IF;
		IF NEW.icon_svg IS NOT NULL THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_icon_svg_server_only';
		END IF;
		IF jsonb_typeof(NEW.props) = 'object' THEN
			NEW.props := NEW.props - 'featured_public_example';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_owner_change_requires_handoff',
			DETAIL = 'Only the owner can hand a project over, through the handoff flow.';
	END IF;

	IF NEW.is_public IS DISTINCT FROM OLD.is_public THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_publication_server_only',
			DETAIL = 'Only BuildOS can publish a project as a public example.';
	END IF;

	IF NEW.icon_svg IS DISTINCT FROM OLD.icon_svg THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_icon_svg_server_only';
	END IF;

	IF (NEW.props -> 'featured_public_example') IS DISTINCT FROM (OLD.props -> 'featured_public_example')
		AND jsonb_typeof(NEW.props) = 'object' THEN
		IF jsonb_typeof(OLD.props) = 'object' AND OLD.props ? 'featured_public_example' THEN
			NEW.props := jsonb_set(NEW.props, '{featured_public_example}', OLD.props -> 'featured_public_example');
		ELSE
			NEW.props := NEW.props - 'featured_public_example';
		END IF;
	END IF;

	IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
		v_actor := public.current_actor_id();
		IF v_actor IS NULL OR v_actor IS DISTINCT FROM OLD.created_by THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_owner_required',
				DETAIL = 'Only the project owner can delete or restore this project.';
		END IF;
	END IF;

	IF NEW.external_agent_access IS DISTINCT FROM OLD.external_agent_access
		AND NOT public.current_actor_has_project_member_access(OLD.id, 'admin') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_admin_required',
			DETAIL = 'Only project admins can change connected AI access.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.onto_projects_guard_owner_columns() FROM PUBLIC, anon, authenticated;

-- Named to sort before the other BEFORE triggers (handle_email_relevance_*, queue_project_*,
-- trg_*), so a refused write fails before any side-effect trigger runs.
DROP TRIGGER IF EXISTS guard_onto_projects_owner_columns ON public.onto_projects;
CREATE TRIGGER guard_onto_projects_owner_columns
	BEFORE INSERT OR UPDATE ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION private.onto_projects_guard_owner_columns();

-- Logged-out callers never soft-delete projects.
REVOKE EXECUTE ON FUNCTION public.soft_delete_onto_project(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION private.onto_task_assignees_guard_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE'
		AND NEW.assignee_actor_id IS NOT DISTINCT FROM OLD.assignee_actor_id
		AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
		RETURN NEW;
	END IF;

	-- Runs as the caller, so these reads go through RLS. A caller who may write the project
	-- can read its owner and member rows; anything hidden counts as "not a member".
	IF EXISTS (
		SELECT 1 FROM public.onto_projects AS p
		WHERE p.id = NEW.project_id AND p.created_by = NEW.assignee_actor_id
	) OR EXISTS (
		SELECT 1 FROM public.onto_project_members AS m
		WHERE m.project_id = NEW.project_id
			AND m.actor_id = NEW.assignee_actor_id
			AND m.removed_at IS NULL
	) THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION USING
		ERRCODE = '42501',
		MESSAGE = 'task_assignee_not_project_member',
		DETAIL = 'Assignees must be the project owner or an active project member.';
END;
$$;

REVOKE ALL ON FUNCTION private.onto_task_assignees_guard_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_onto_task_assignees_membership ON public.onto_task_assignees;
CREATE TRIGGER guard_onto_task_assignees_membership
	BEFORE INSERT OR UPDATE ON public.onto_task_assignees
	FOR EACH ROW EXECUTE FUNCTION private.onto_task_assignees_guard_membership();
