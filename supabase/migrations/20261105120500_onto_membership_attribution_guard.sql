-- supabase/migrations/20261105120500_onto_membership_attribution_guard.sql
--
-- Security audit 2026-11-05, round 2: rows a collaborator writes whose identity columns other
-- code trusts.
--
-- 1. onto_project_members. A project owner or admin could INSERT a membership row for any
--    actor (no invite, no consent), then read that person's onto_actors row (email, user_id)
--    and unlock their collaborators-only builder profile. It also defeated the assignee guard
--    from 20261105120200 (add a stranger as member, then assign). An admin could also UPDATE
--    an existing row's actor_id to a stranger, and non-owner admins could change or delete the
--    owner's own row.
--    Every real membership comes from SECURITY DEFINER code: the owner row from the
--    add_project_owner_membership trigger, joins from accept_project_invite*,
--    accept_project_invite_link, decide_people_request / finish_project_join, handoff from
--    transfer_onto_project_ownership, role/remove/leave from update_project_membership_guarded,
--    agent access from set_project_member_agent_access. The fold and the brief owner-row
--    repair run as service_role. So, for signed-in clients:
--      - INSERT and DELETE are gone (policies dropped, grants revoked);
--      - UPDATE may only change role_name / role_description (the role-profile routes), and
--        only the owner may change the owner's row.
--
-- 2. onto_project_logs. A client insert could carry another user's changed_by (only
--    changed_by_actor_id was checked) or external_agent_caller_id; the daily brief, the
--    activity notification batcher and project-logs-enrich resolve those to a name or email.
--    For signed-in writers the row is now attributed to the caller: changed_by = auth.uid(),
--    changed_by_actor_id = current_actor_id(), and the external-agent columns are cleared
--    (the agent gateway writes them with the service role).
--
-- 3. created_by on onto_tasks, documents, goals, plans, milestones, risks, events,
--    requirements, metrics, sources. A write member could set created_by to any co-member;
--    task entity extraction then ran as that person (their private contact details, their
--    LLM bill), and calendar disconnect treats onto_events.created_by as ownership. For
--    signed-in writers created_by is set to current_actor_id() on INSERT and kept on UPDATE.
--    This guard reads the request's JWT role rather than current_user, so it also covers
--    onto_goal_create_atomic / onto_plan_create_atomic (SECURITY DEFINER, take created_by
--    from client JSON). Server code (service_role) and migrations are untouched.
--
-- 4. enqueue_task_entity_extraction runs the job as the signed-in writer when there is one.
--    Server writes fall back to the task's creator only while they still belong to the
--    project, then to the project owner.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. onto_project_members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS project_members_insert_admin ON public.onto_project_members;
DROP POLICY IF EXISTS project_members_delete_admin ON public.onto_project_members;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.onto_project_members FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.onto_project_members_guard_client_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
	v_owner uuid;
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_member_insert_server_only',
			DETAIL = 'People join a project by accepting an invite or a join request.';
	END IF;

	IF (to_jsonb(NEW) - 'role_name' - 'role_description')
		IS DISTINCT FROM (to_jsonb(OLD) - 'role_name' - 'role_description') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_member_change_server_only',
			DETAIL = 'Role, access and removal changes go through the membership actions.';
	END IF;

	-- Runs as the caller; an admin who can update the row can read the project.
	SELECT p.created_by INTO v_owner FROM public.onto_projects AS p WHERE p.id = OLD.project_id;
	IF (OLD.role_key = 'owner' OR OLD.actor_id = v_owner)
		AND public.current_actor_id() IS DISTINCT FROM OLD.actor_id THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_owner_membership_owner_only',
			DETAIL = 'Only the owner can change their own membership.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.onto_project_members_guard_client_writes() FROM PUBLIC, anon, authenticated;

-- Sorts before the trg_* BEFORE triggers.
DROP TRIGGER IF EXISTS guard_onto_project_members_client_writes ON public.onto_project_members;
CREATE TRIGGER guard_onto_project_members_client_writes
	BEFORE INSERT OR UPDATE ON public.onto_project_members
	FOR EACH ROW EXECUTE FUNCTION private.onto_project_members_guard_client_writes();

-- ---------------------------------------------------------------------------
-- 2. onto_project_logs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.onto_project_logs_pin_client_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_log_sign_in_required';
	END IF;

	NEW.changed_by := auth.uid();
	-- NULL here is filled by trg_onto_project_logs_actor from changed_by.
	NEW.changed_by_actor_id := public.current_actor_id();
	NEW.external_agent_caller_id := NULL;
	NEW.agent_call_session_id := NULL;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.onto_project_logs_pin_client_attribution() FROM PUBLIC, anon, authenticated;

-- Sorts before trg_onto_project_logs_actor.
DROP TRIGGER IF EXISTS guard_onto_project_logs_attribution ON public.onto_project_logs;
CREATE TRIGGER guard_onto_project_logs_attribution
	BEFORE INSERT ON public.onto_project_logs
	FOR EACH ROW EXECUTE FUNCTION private.onto_project_logs_pin_client_attribution();

-- ---------------------------------------------------------------------------
-- 3. created_by on project entities
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.onto_entity_pin_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
	v_role text := coalesce(
		nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
		current_user::text
	);
	v_actor uuid;
BEGIN
	-- JWT role, not current_user: SECURITY DEFINER create RPCs called by a signed-in user
	-- (onto_goal_create_atomic, onto_plan_create_atomic) are covered too.
	IF v_role NOT IN ('authenticated', 'anon') AND current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'UPDATE' THEN
		NEW.created_by := OLD.created_by;
		RETURN NEW;
	END IF;

	v_actor := public.current_actor_id();
	IF v_actor IS NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'actor_required',
			DETAIL = 'Sign in to create project items.';
	END IF;
	NEW.created_by := v_actor;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.onto_entity_pin_created_by() FROM PUBLIC, anon, authenticated;

-- Named to sort before guard_guest_*, organize_* and trg_* BEFORE triggers.
DO $$
DECLARE
	t text;
BEGIN
	FOREACH t IN ARRAY ARRAY[
		'onto_tasks', 'onto_documents', 'onto_goals', 'onto_plans', 'onto_milestones',
		'onto_risks', 'onto_events', 'onto_requirements', 'onto_metrics', 'onto_sources'
	] LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS guard_entity_created_by ON public.%I', t);
		EXECUTE format(
			'CREATE TRIGGER guard_entity_created_by BEFORE INSERT OR UPDATE OF created_by ON public.%I '
			'FOR EACH ROW EXECUTE FUNCTION private.onto_entity_pin_created_by()',
			t
		);
	END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Task entity extraction runs as the writer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_task_entity_extraction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
	v_digest text;
	v_user_id uuid;
BEGIN
	-- A task moved to another project takes its entities along, so access follows the task.
	IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
		UPDATE public.onto_task_entities SET project_id = NEW.project_id WHERE task_id = NEW.id;
		UPDATE public.onto_task_entity_state SET project_id = NEW.project_id WHERE task_id = NEW.id;
	END IF;

	IF NEW.deleted_at IS NOT NULL THEN
		RETURN NULL;
	END IF;

	v_digest := md5(coalesce(NEW.title, '') || chr(31) || coalesce(NEW.description, ''));

	IF TG_OP = 'UPDATE'
		AND v_digest = md5(coalesce(OLD.title, '') || chr(31) || coalesce(OLD.description, ''))
		AND OLD.deleted_at IS NULL THEN
		RETURN NULL;
	END IF;

	-- The person who wrote the text: the signed-in writer when there is one.
	IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated' THEN
		v_user_id := auth.uid();
	END IF;
	-- Server writes: the creator, while they still belong to the project.
	IF v_user_id IS NULL THEN
		SELECT a.user_id INTO v_user_id
		FROM public.onto_actors a
		WHERE a.id = NEW.created_by
			AND (
				EXISTS (SELECT 1 FROM public.onto_projects p WHERE p.id = NEW.project_id AND p.created_by = a.id)
				OR EXISTS (
					SELECT 1 FROM public.onto_project_members m
					WHERE m.project_id = NEW.project_id AND m.actor_id = a.id AND m.removed_at IS NULL
				)
			);
	END IF;
	IF v_user_id IS NULL THEN
		SELECT a.user_id INTO v_user_id
		FROM public.onto_projects p
		JOIN public.onto_actors a ON a.id = p.created_by
		WHERE p.id = NEW.project_id;
	END IF;
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;

	PERFORM public.add_queue_job(
		v_user_id,
		'extract_task_entities',
		jsonb_build_object('taskId', NEW.id, 'projectId', NEW.project_id, 'userId', v_user_id),
		10,
		now() + interval '15 seconds',
		'extract_task_entities:' || NEW.id || ':' || v_digest
	);
	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- Entities are a convenience; the task write must always win.
	RAISE WARNING 'enqueue_task_entity_extraction failed for task %: %', NEW.id, SQLERRM;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_task_entity_extraction() FROM PUBLIC, anon, authenticated;
