-- supabase/migrations/20261004220000_project_handoff_and_trash.sql
-- Tasker 103 follow-up: a shared project never disappears by surprise.
--
-- Before this, ownership could not move. An owner could not leave their own
-- project ("Delete it instead"), deleting a shared project took it from every
-- member at once with no way back, and deleting an account erased every project
-- the person created that had no second owner, editors and viewers included.
--
-- 1. transfer_onto_project_ownership(): the owner hands the project to an
--    active member, and stays as an editor or leaves. onto_projects.created_by
--    is the owner pointer every access check reads (actor_has_project_member_access
--    and ~25 other functions), so it moves with the owner membership.
-- 2. restore_onto_project(): the owner brings a deleted project back from Trash
--    until the 30-day purge (cleanup_privacy_deleted_projects) erases it.
--    soft_delete_onto_project() stamps the project and every child it deletes
--    with the same deleted_at, so restore brings back exactly those rows and
--    leaves items deleted earlier in the trash.
-- 3. list_my_deleted_onto_projects(): the owner's Trash.
-- 4. list_my_shared_owned_onto_projects(): the shared projects the caller owns,
--    with the members who can take them over. Account deletion asks for a
--    decision on each before it is scheduled.
--
-- All four are signed-in RPCs: SECURITY DEFINER, and each checks the caller's
-- own actor (current_actor_id()) before reading or writing anything.

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Hand off
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_onto_project_ownership(
	p_project_id uuid,
	p_new_owner_member_id uuid,
	p_leave boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_actor_id uuid := public.current_actor_id();
	v_project record;
	v_member record;
	v_now timestamptz := now();
	v_previous_updated integer := 0;
BEGIN
	IF v_user_id IS NULL OR v_actor_id IS NULL THEN
		RAISE EXCEPTION 'project_handoff_requires_user' USING ERRCODE = '42501';
	END IF;

	-- The project row lock comes before any write (Tasker 105 lock order).
	SELECT project.id, project.name, project.created_by
	INTO v_project
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id AND project.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND OR v_project.created_by IS DISTINCT FROM v_actor_id THEN
		RAISE EXCEPTION 'project_owner_required' USING ERRCODE = '42501';
	END IF;

	-- The new owner is a current member with a live account that is not being deleted.
	SELECT member.id, member.actor_id, actor.user_id
	INTO v_member
	FROM public.onto_project_members AS member
	JOIN public.onto_actors AS actor ON actor.id = member.actor_id
	JOIN public.users AS person ON person.id = actor.user_id
	WHERE member.id = p_new_owner_member_id
		AND member.project_id = p_project_id
		AND member.removed_at IS NULL
		AND member.actor_id <> v_actor_id
		AND actor.kind = 'human'
		AND person.deletion_status IS NULL
	FOR UPDATE OF member;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'project_handoff_member_not_found' USING ERRCODE = 'P0002';
	END IF;

	UPDATE public.onto_projects
	SET created_by = v_member.actor_id
	WHERE id = p_project_id;

	UPDATE public.onto_project_members
	SET role_key = 'owner',
		access = 'admin'
	WHERE id = v_member.id;

	-- unique_project_member keeps one row per (project, actor), removed or not.
	IF p_leave THEN
		UPDATE public.onto_project_members
		SET removed_at = v_now,
			removed_by_actor_id = v_actor_id
		WHERE project_id = p_project_id
			AND actor_id = v_actor_id
			AND removed_at IS NULL;
	ELSE
		UPDATE public.onto_project_members
		SET role_key = 'editor',
			access = 'write',
			removed_at = NULL,
			removed_by_actor_id = NULL
		WHERE project_id = p_project_id
			AND actor_id = v_actor_id;
		GET DIAGNOSTICS v_previous_updated = ROW_COUNT;

		IF v_previous_updated = 0 THEN
			INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
			VALUES (p_project_id, v_actor_id, 'editor', 'write', v_actor_id);
		END IF;
	END IF;

	INSERT INTO public.onto_project_logs (
		project_id, entity_type, entity_id, action, before_data, after_data,
		changed_by, changed_by_actor_id, change_source
	)
	VALUES (
		p_project_id, 'project', p_project_id, 'updated',
		jsonb_build_object('owner_actor_id', v_actor_id),
		jsonb_build_object(
			'event', 'ownership_transferred',
			'owner_actor_id', v_member.actor_id,
			'previous_owner_left', p_leave
		),
		v_user_id, v_actor_id, 'form'
	);

	RETURN jsonb_build_object(
		'project_id', p_project_id,
		'project_name', v_project.name,
		'new_owner_actor_id', v_member.actor_id,
		'new_owner_user_id', v_member.user_id,
		'previous_owner_left', p_leave
	);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_onto_project_ownership(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_onto_project_ownership(uuid, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.transfer_onto_project_ownership(uuid, uuid, boolean) IS
	'The owner hands a project to an active member (owner/admin) and becomes an editor, or leaves when p_leave. Moves onto_projects.created_by, the owner pointer access checks read.';

-- ---------------------------------------------------------------------------
-- Trash
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_onto_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_actor_id uuid := public.current_actor_id();
	v_project record;
	v_deleted_at timestamptz;
	v_now timestamptz := now();
	v_restored integer := 0;
	v_count integer;
BEGIN
	IF v_user_id IS NULL OR v_actor_id IS NULL THEN
		RAISE EXCEPTION 'project_restore_requires_user' USING ERRCODE = '42501';
	END IF;

	-- The project row lock comes before any write (Tasker 105 lock order).
	SELECT project.id, project.name, project.created_by, project.deleted_at
	INTO v_project
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id
	FOR UPDATE;

	IF NOT FOUND OR v_project.created_by IS DISTINCT FROM v_actor_id THEN
		RAISE EXCEPTION 'project_owner_required' USING ERRCODE = '42501';
	END IF;

	IF v_project.deleted_at IS NULL THEN
		RETURN jsonb_build_object('project_id', p_project_id, 'restored', false, 'items_restored', 0);
	END IF;

	v_deleted_at := v_project.deleted_at;

	-- soft_delete_onto_project() set this same timestamp on every row it took
	-- down, and set archived_at to it only where the row was not archived yet.
	UPDATE public.onto_tasks
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_plans
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_goals
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_documents
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_milestones
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_risks
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	-- Events come back in BuildOS. Their Google Calendar copies were removed at
	-- delete time (queue_deleted_project_calendar_cleanup) and are not re-created.
	UPDATE public.onto_events
	SET deleted_at = NULL,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_requirements
	SET deleted_at = NULL,
		updated_at = v_now
	WHERE project_id = p_project_id AND deleted_at = v_deleted_at;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	v_restored := v_restored + v_count;

	UPDATE public.onto_projects
	SET deleted_at = NULL,
		archived_at = CASE WHEN archived_at = v_deleted_at THEN NULL ELSE archived_at END
	WHERE id = p_project_id;

	INSERT INTO public.onto_project_logs (
		project_id, entity_type, entity_id, action, before_data, after_data,
		changed_by, changed_by_actor_id, change_source
	)
	VALUES (
		p_project_id, 'project', p_project_id, 'updated',
		jsonb_build_object('deleted_at', v_deleted_at),
		jsonb_build_object('event', 'restored_from_trash', 'items_restored', v_restored),
		v_user_id, v_actor_id, 'form'
	);

	RETURN jsonb_build_object(
		'project_id', p_project_id,
		'project_name', v_project.name,
		'restored', true,
		'items_restored', v_restored
	);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_onto_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_onto_project(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.restore_onto_project(uuid) IS
	'The owner restores a deleted project and exactly the rows its delete took down (same deleted_at), until the 30-day purge.';

CREATE OR REPLACE FUNCTION public.list_my_deleted_onto_projects()
RETURNS TABLE (
	id uuid,
	name text,
	icon_emoji jsonb,
	deleted_at timestamptz,
	erase_after timestamptz,
	member_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT
		project.id,
		project.name,
		project.icon_emoji,
		project.deleted_at,
		-- cleanup_privacy_deleted_projects erases a project 30 days after deleted_at.
		project.deleted_at + interval '30 days' AS erase_after,
		(
			SELECT count(*)::integer
			FROM public.onto_project_members AS member
			WHERE member.project_id = project.id
				AND member.removed_at IS NULL
				AND member.actor_id <> project.created_by
		) AS member_count
	FROM public.onto_projects AS project
	WHERE project.created_by = public.current_actor_id()
		AND project.deleted_at IS NOT NULL
	ORDER BY project.deleted_at DESC
	LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.list_my_deleted_onto_projects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_deleted_onto_projects() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared projects the caller owns (account deletion asks about each)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_my_shared_owned_onto_projects()
RETURNS TABLE (
	project_id uuid,
	project_name text,
	members jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	WITH me AS (
		SELECT public.current_actor_id() AS actor_id
	)
	SELECT
		project.id,
		project.name,
		jsonb_agg(
			jsonb_build_object(
				'member_id', member.id,
				'actor_id', member.actor_id,
				'name', actor.name,
				'email', coalesce(actor.email, person.email),
				'role_key', member.role_key,
				'access', member.access
			)
			ORDER BY
				CASE member.access WHEN 'admin' THEN 0 WHEN 'write' THEN 1 ELSE 2 END,
				member.created_at,
				member.id
		) AS members
	FROM me
	JOIN public.onto_projects AS project
		ON project.created_by = me.actor_id AND project.deleted_at IS NULL
	JOIN public.onto_project_members AS member
		ON member.project_id = project.id
		AND member.removed_at IS NULL
		AND member.actor_id <> me.actor_id
	JOIN public.onto_actors AS actor
		ON actor.id = member.actor_id AND actor.kind = 'human'
	-- Members whose own account is being deleted cannot take a project over.
	JOIN public.users AS person
		ON person.id = actor.user_id AND person.deletion_status IS NULL
	GROUP BY project.id, project.name
	ORDER BY project.name, project.id;
$$;

REVOKE ALL ON FUNCTION public.list_my_shared_owned_onto_projects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_shared_owned_onto_projects() TO authenticated, service_role;

RESET lock_timeout;
