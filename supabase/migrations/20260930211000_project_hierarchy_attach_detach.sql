-- supabase/migrations/20260930211000_project_hierarchy_attach_detach.sql
--
-- Fix-forward for 20260930130000_project_hierarchy_shared_shelf.sql (applied).
-- Product decisions (DJ, 2026-09-30):
--
-- 1. Attach (nest a project under a parent) needs admin on BOTH projects. It
--    used to need only write on the parent, so any collaborator could hang
--    their project under someone else's hub and show up in its family.
--    Detach needs admin on the child OR admin on its current parent: either
--    side can end the relationship.
--    Errors (the web layer maps both):
--      project_parent_admin_required  caller is admin on the child and can read
--                                     the parent but is not its admin
--      project_parent_access_denied   everything else (learns nothing)
--
-- 2. onto_project_family_v1 reports can_detach on the parent and on each child
--    (viewer is admin on this project or on the other one). Everything else in
--    its output is unchanged.
--
-- 3. One level of nesting survives restores. The guard ignores soft-deleted
--    children, so: soft-delete child C of P, nest P under Q, restore C, and C
--    sat two levels deep. Restoring a project now detaches it from its parent
--    when keeping it would break the rule (its parent has a parent, or it has
--    live children of its own). The restore itself is never blocked.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Set or clear a project's parent.

CREATE OR REPLACE FUNCTION public.onto_project_set_parent_atomic(
	p_project_id uuid,
	p_parent_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_actor uuid;
	v_current_parent uuid;
	v_child record;
	v_parent record;
	v_folder uuid;
	v_structure jsonb;
	v_root jsonb;
	v_version integer;
	v_next jsonb;
	v_lock_id uuid;
	v_folder_title constant text := 'Shared with sub-projects';
	v_folder_description constant text :=
		'Docs in this folder show in every sub-project, read-only. Editing one here changes it everywhere.';
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_auth_required';
	END IF;
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_parent_invalid_arguments';
	END IF;
	PERFORM public.ensure_actor_for_user(auth.uid());
	v_actor := public.current_actor_id();

	-- Authorization read (unlocked). Denied callers learn nothing about either
	-- project; the rows are re-read and re-checked under the locks below.
	IF p_parent_project_id IS NOT NULL THEN
		IF NOT public.current_actor_has_project_member_access(p_project_id, 'admin') THEN
			RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_access_denied';
		END IF;
		IF NOT public.current_actor_has_project_member_access(p_parent_project_id, 'admin') THEN
			IF public.current_actor_has_project_member_access(p_parent_project_id, 'read') THEN
				RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_admin_required';
			END IF;
			RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_access_denied';
		END IF;
		v_lock_id := p_parent_project_id;
	ELSE
		SELECT project.parent_project_id INTO v_current_parent
		FROM public.onto_projects AS project
		WHERE project.id = p_project_id;
		IF NOT public.current_actor_has_project_member_access(p_project_id, 'admin')
			AND (
				v_current_parent IS NULL
				OR NOT public.current_actor_has_project_member_access(v_current_parent, 'admin')
			) THEN
			RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_access_denied';
		END IF;
		v_lock_id := v_current_parent;
	END IF;

	-- Lock both rows in ascending id order, as onto_lock_projects_for_write does.
	-- That helper skips rows the caller cannot write, and a parent admin who
	-- detaches a child they are not a member of must still lock the child.
	PERFORM 1
	FROM public.onto_projects AS project
	WHERE project.id IN (p_project_id, v_lock_id)
	ORDER BY project.id
	FOR UPDATE;

	SELECT project.id, project.parent_project_id, project.deleted_at
	INTO v_child
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id;
	IF NOT FOUND OR v_child.deleted_at IS NOT NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'project_not_found';
	END IF;

	IF p_parent_project_id IS NULL THEN
		-- The parent may have changed between the authorization read and the
		-- lock; a parent admin may only detach from the parent they admin.
		IF v_child.parent_project_id IS DISTINCT FROM v_current_parent
			AND NOT public.current_actor_has_project_member_access(p_project_id, 'admin') THEN
			RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_access_denied';
		END IF;
		-- The flag is on only around each protected write, so it never outlives
		-- this function inside a larger transaction.
		PERFORM set_config('buildos.project_hierarchy_write', 'on', true);
		UPDATE public.onto_projects SET parent_project_id = NULL WHERE id = p_project_id;
		PERFORM set_config('buildos.project_hierarchy_write', '', true);
		RETURN jsonb_build_object(
			'project_id', p_project_id,
			'parent_project_id', NULL,
			'previous_parent_project_id', v_child.parent_project_id,
			'shared_folder_document_id', NULL
		);
	END IF;

	SELECT
		project.id,
		project.parent_project_id,
		project.deleted_at,
		project.archived_at,
		project.shared_folder_document_id,
		project.doc_structure
	INTO v_parent
	FROM public.onto_projects AS project
	WHERE project.id = p_parent_project_id;
	IF NOT FOUND OR v_parent.deleted_at IS NOT NULL OR v_parent.archived_at IS NOT NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'project_parent_not_found';
	END IF;

	-- The guard trigger enforces these too; checking here gives the caller the
	-- same messages before any write.
	IF p_parent_project_id = p_project_id THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_parent_self';
	END IF;
	IF v_parent.parent_project_id IS NOT NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_parent_is_a_child';
	END IF;
	IF EXISTS (
		SELECT 1 FROM public.onto_projects AS c
		WHERE c.parent_project_id = p_project_id AND c.deleted_at IS NULL
	) THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_has_children';
	END IF;

	PERFORM set_config('buildos.project_hierarchy_write', 'on', true);
	UPDATE public.onto_projects
	SET parent_project_id = p_parent_project_id
	WHERE id = p_project_id;
	PERFORM set_config('buildos.project_hierarchy_write', '', true);

	-- Reuse the folder while it is live in the parent; otherwise make a new one.
	v_folder := v_parent.shared_folder_document_id;
	IF v_folder IS NOT NULL AND NOT EXISTS (
		SELECT 1
		FROM public.onto_documents AS d
		WHERE d.id = v_folder
			AND d.project_id = p_parent_project_id
			AND d.deleted_at IS NULL
			AND d.archived_at IS NULL
			AND d.state_key::text <> 'archived'
	) THEN
		v_folder := NULL;
	END IF;

	IF v_folder IS NULL THEN
		INSERT INTO public.onto_documents (
			project_id, title, type_key, state_key, description, content, created_by, props
		) VALUES (
			p_parent_project_id,
			v_folder_title,
			'document.default',
			'ready',
			v_folder_description,
			'Put docs here that every sub-project should see: brand, offers, templates, shared context.',
			v_actor,
			jsonb_build_object('role', 'shared_with_sub_projects')
		)
		RETURNING id INTO v_folder;

		v_structure := CASE
			WHEN jsonb_typeof(v_parent.doc_structure) = 'object' THEN v_parent.doc_structure
			ELSE jsonb_build_object('version', 1, 'root', '[]'::jsonb)
		END;
		v_version := CASE
			WHEN jsonb_typeof(v_structure->'version') = 'number'
				AND (v_structure->>'version') ~ '^[0-9]+$'
				THEN (v_structure->>'version')::integer
			ELSE 1
		END;
		v_root := CASE
			WHEN jsonb_typeof(v_structure->'root') = 'array' THEN v_structure->'root'
			ELSE '[]'::jsonb
		END;
		v_next := v_structure || jsonb_build_object(
			'version', v_version + 1,
			'root',
			jsonb_build_array(jsonb_build_object(
				'id', v_folder,
				'order', 0,
				'title', v_folder_title,
				'description', v_folder_description,
				'is_public', false,
				'public_slug', NULL,
				'public_url_path', NULL,
				'public_status', 'not_public'
			)) || coalesce((
				SELECT jsonb_agg(node.value || jsonb_build_object('order', node.ordinality) ORDER BY node.ordinality)
				FROM jsonb_array_elements(v_root) WITH ORDINALITY AS node(value, ordinality)
			), '[]'::jsonb)
		);

		PERFORM public.onto_project_doc_structure_update_atomic(
			p_parent_project_id, v_version, v_next, 'create', v_actor, '[]'::jsonb
		);

		PERFORM set_config('buildos.project_hierarchy_write', 'on', true);
		UPDATE public.onto_projects
		SET shared_folder_document_id = v_folder
		WHERE id = p_parent_project_id;
		PERFORM set_config('buildos.project_hierarchy_write', '', true);
	END IF;

	RETURN jsonb_build_object(
		'project_id', p_project_id,
		'parent_project_id', p_parent_project_id,
		'previous_parent_project_id', v_child.parent_project_id,
		'shared_folder_document_id', v_folder
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_project_set_parent_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_project_set_parent_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_project_set_parent_atomic(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.onto_project_set_parent_atomic(uuid, uuid) IS
	'Nest a project under a parent (admin on both) or detach it (admin on the child or on its current parent). Errors: project_parent_admin_required, project_parent_access_denied.';

-- ---------------------------------------------------------------------------
-- 2. A project's family, filtered to what the actor can read. Unchanged except
--    for can_detach on the parent and on each child.

CREATE OR REPLACE FUNCTION public.onto_project_family_v1(
	p_project_id uuid,
	p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_actor uuid;
	v_project record;
	v_parent record;
	v_parent_json jsonb;
	v_shelf jsonb := '[]'::jsonb;
	v_children jsonb := '[]'::jsonb;
	v_admin_here boolean;
BEGIN
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_family_invalid_arguments';
	END IF;

	IF coalesce(auth.role(), '') = 'service_role' THEN
		v_actor := p_actor_id;
	ELSIF auth.uid() IS NOT NULL THEN
		v_actor := public.current_actor_id();
	END IF;
	IF v_actor IS NULL
		OR NOT public.actor_has_project_member_access(v_actor, p_project_id, 'read') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_family_access_denied';
	END IF;

	SELECT project.id, project.parent_project_id, project.shared_folder_document_id
	INTO v_project
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id AND project.deleted_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'project_not_found';
	END IF;

	v_admin_here := public.actor_has_project_member_access(v_actor, p_project_id, 'admin');

	IF v_project.parent_project_id IS NOT NULL THEN
		SELECT
			project.id,
			project.name,
			project.state_key,
			project.shared_folder_document_id,
			project.doc_structure
		INTO v_parent
		FROM public.onto_projects AS project
		WHERE project.id = v_project.parent_project_id
			AND project.deleted_at IS NULL
			AND project.archived_at IS NULL;

		IF FOUND AND public.actor_has_project_member_access(v_actor, v_parent.id, 'read') THEN
			v_parent_json := jsonb_build_object(
				'id', v_parent.id,
				'name', v_parent.name,
				'state_key', v_parent.state_key,
				'can_write', public.actor_has_project_member_access(v_actor, v_parent.id, 'write'),
				'can_detach', v_admin_here
					OR public.actor_has_project_member_access(v_actor, v_parent.id, 'admin'),
				'shared_folder_document_id', v_parent.shared_folder_document_id,
				-- All children count toward "shown in N projects"; only readable ones are named.
				'child_count', (
					SELECT count(*) FROM public.onto_projects AS c
					WHERE c.parent_project_id = v_parent.id AND c.deleted_at IS NULL
				)
			);

			IF v_parent.shared_folder_document_id IS NOT NULL THEN
				WITH RECURSIVE tree AS (
					SELECT
						node.value->>'id' AS id,
						NULL::text AS parent_id,
						node.value->'children' AS children,
						ARRAY[node.ordinality]::bigint[] AS path
					FROM jsonb_array_elements(
						CASE WHEN jsonb_typeof(v_parent.doc_structure->'root') = 'array'
							THEN v_parent.doc_structure->'root' ELSE '[]'::jsonb END
					) WITH ORDINALITY AS node(value, ordinality)
					UNION ALL
					SELECT
						child.value->>'id',
						tree.id,
						child.value->'children',
						tree.path || child.ordinality
					FROM tree
					CROSS JOIN LATERAL jsonb_array_elements(
						CASE WHEN jsonb_typeof(tree.children) = 'array'
							THEN tree.children ELSE '[]'::jsonb END
					) WITH ORDINALITY AS child(value, ordinality)
					WHERE array_length(tree.path, 1) < 24
				),
				folder AS (
					SELECT tree.path FROM tree
					WHERE tree.id = v_parent.shared_folder_document_id::text
					LIMIT 1
				)
				SELECT coalesce(jsonb_agg(jsonb_build_object(
					'id', doc.id,
					'title', doc.title,
					'description', doc.description,
					'type_key', doc.type_key,
					'state_key', doc.state_key,
					'updated_at', doc.updated_at,
					'tree_parent_id', CASE
						WHEN tree.parent_id = v_parent.shared_folder_document_id::text THEN NULL
						ELSE tree.parent_id
					END,
					'depth', array_length(tree.path, 1) - array_length(folder.path, 1) - 1
				) ORDER BY tree.path), '[]'::jsonb)
				INTO v_shelf
				FROM tree
				CROSS JOIN folder
				JOIN public.onto_documents AS doc
					ON doc.id::text = tree.id
					AND doc.project_id = v_parent.id
					AND doc.deleted_at IS NULL
					AND doc.archived_at IS NULL
					AND doc.state_key::text <> 'archived'
				WHERE array_length(tree.path, 1) > array_length(folder.path, 1)
					AND tree.path[1:array_length(folder.path, 1)] = folder.path;
			END IF;
		END IF;
	END IF;

	SELECT coalesce(jsonb_agg(jsonb_build_object(
		'id', c.id,
		'name', c.name,
		'state_key', c.state_key,
		'next_step_short', c.next_step_short,
		'updated_at', c.updated_at,
		'can_detach', v_admin_here
			OR public.actor_has_project_member_access(v_actor, c.id, 'admin')
	) ORDER BY c.updated_at DESC), '[]'::jsonb)
	INTO v_children
	FROM public.onto_projects AS c
	WHERE c.parent_project_id = p_project_id
		AND c.deleted_at IS NULL
		AND c.archived_at IS NULL
		AND public.actor_has_project_member_access(v_actor, c.id, 'read');

	RETURN jsonb_build_object(
		'project_id', p_project_id,
		'parent', v_parent_json,
		'shelf', v_shelf,
		'children', v_children,
		'own_shared_folder_document_id', v_project.shared_folder_document_id,
		'child_count', (
			SELECT count(*) FROM public.onto_projects AS c
			WHERE c.parent_project_id = p_project_id AND c.deleted_at IS NULL
		)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_project_family_v1(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_project_family_v1(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_project_family_v1(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_project_family_v1(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Restoring a project keeps one level of nesting.
--
-- Fires after trg_onto_projects_guard_hierarchy (BEFORE triggers run in name
-- order: "guard" < "restore"), so the guard sees the row as the caller wrote
-- it and this trigger only ever clears a parent pointer, which cannot break
-- the nesting rule. SECURITY DEFINER: the restorer may not be able to read
-- the parent row under RLS, and the check must see it.
--
-- The parent row is read FOR KEY SHARE. onto_project_set_parent_atomic locks
-- its rows FOR UPDATE, so a concurrent nest of the parent either commits first
-- (and this read sees its new parent) or waits for this restore to commit (and
-- then sees the restored child and refuses with project_has_children).

CREATE OR REPLACE FUNCTION private.onto_projects_restore_keeps_one_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_grandparent uuid;
BEGIN
	IF OLD.deleted_at IS NULL OR NEW.deleted_at IS NOT NULL OR NEW.parent_project_id IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT parent.parent_project_id INTO v_grandparent
	FROM public.onto_projects AS parent
	WHERE parent.id = NEW.parent_project_id
	FOR KEY SHARE;

	IF v_grandparent IS NOT NULL OR EXISTS (
		SELECT 1 FROM public.onto_projects AS c
		WHERE c.parent_project_id = NEW.id AND c.deleted_at IS NULL
	) THEN
		NEW.parent_project_id := NULL;
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.onto_projects_restore_keeps_one_level() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_projects_restore_hierarchy ON public.onto_projects;
CREATE TRIGGER trg_onto_projects_restore_hierarchy
	BEFORE UPDATE OF deleted_at ON public.onto_projects
	FOR EACH ROW
	WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.parent_project_id IS NOT NULL)
	EXECUTE FUNCTION private.onto_projects_restore_keeps_one_level();

COMMIT;
