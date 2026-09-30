-- supabase/migrations/20260930130000_project_hierarchy_shared_shelf.sql
--
-- Project hierarchy, phase 1 (plan: ~/.claude/plans/whimsical-chasing-sunrise.md;
-- research: docs/research/project-structure-search-eval-2026-09-29/).
--
-- A project can sit under one parent project (Wayne Strategies → its client
-- projects). The parent's "Shared with sub-projects" folder is a document in
-- its tree; everything under that folder shows as a read-only shelf in each
-- child. The shelf and the parent line show only to people who can already
-- read the parent. Nothing moves between projects in this phase.
--
-- v1 allows one level: a child cannot also be a parent. Queries below walk
-- any depth, so relaxing that is a trigger change.
--
-- The three new columns change only through the functions here: a guard
-- trigger rejects direct writes unless the transaction-local setting
-- buildos.project_hierarchy_write is on. Clearing a pointer whose target row
-- no longer exists (ON DELETE SET NULL) is always allowed.

ALTER TABLE public.onto_projects
	ADD COLUMN IF NOT EXISTS parent_project_id uuid
		REFERENCES public.onto_projects (id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS shared_folder_document_id uuid
		REFERENCES public.onto_documents (id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS merged_into_project_id uuid
		REFERENCES public.onto_projects (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.onto_projects.parent_project_id IS
	'Parent project (one level in v1). Set only by onto_project_set_parent_atomic.';
COMMENT ON COLUMN public.onto_projects.shared_folder_document_id IS
	'The "Shared with sub-projects" folder document in this project''s tree; its descendants show in every child.';
COMMENT ON COLUMN public.onto_projects.merged_into_project_id IS
	'Reserved for project combine (phase 3): the project this one was folded into.';

CREATE INDEX IF NOT EXISTS onto_projects_parent_project_id_idx
	ON public.onto_projects (parent_project_id)
	WHERE parent_project_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Guard: protected columns and the one-level rule.

CREATE OR REPLACE FUNCTION private.onto_projects_guard_hierarchy_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
	v_allowed boolean := coalesce(current_setting('buildos.project_hierarchy_write', true), '') = 'on';
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NOT v_allowed AND (
			NEW.parent_project_id IS NOT NULL
			OR NEW.shared_folder_document_id IS NOT NULL
			OR NEW.merged_into_project_id IS NOT NULL
		) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_hierarchy_columns_protected';
		END IF;
		RETURN NEW;
	END IF;

	IF NOT v_allowed THEN
		-- A pointer may be cleared when its target is gone (ON DELETE SET NULL).
		IF NEW.parent_project_id IS DISTINCT FROM OLD.parent_project_id
			AND NOT (
				NEW.parent_project_id IS NULL
				AND NOT EXISTS (
					SELECT 1 FROM public.onto_projects AS p WHERE p.id = OLD.parent_project_id
				)
			) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_hierarchy_columns_protected';
		END IF;
		IF NEW.shared_folder_document_id IS DISTINCT FROM OLD.shared_folder_document_id
			AND NOT (
				NEW.shared_folder_document_id IS NULL
				AND NOT EXISTS (
					SELECT 1 FROM public.onto_documents AS d WHERE d.id = OLD.shared_folder_document_id
				)
			) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_hierarchy_columns_protected';
		END IF;
		IF NEW.merged_into_project_id IS DISTINCT FROM OLD.merged_into_project_id
			AND NOT (
				NEW.merged_into_project_id IS NULL
				AND NOT EXISTS (
					SELECT 1 FROM public.onto_projects AS p WHERE p.id = OLD.merged_into_project_id
				)
			) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'project_hierarchy_columns_protected';
		END IF;
	END IF;

	IF NEW.parent_project_id IS NOT NULL
		AND NEW.parent_project_id IS DISTINCT FROM OLD.parent_project_id THEN
		IF NEW.parent_project_id = NEW.id THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_parent_self';
		END IF;
		IF EXISTS (
			SELECT 1 FROM public.onto_projects AS p
			WHERE p.id = NEW.parent_project_id AND p.parent_project_id IS NOT NULL
		) THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_parent_is_a_child';
		END IF;
		IF EXISTS (
			SELECT 1 FROM public.onto_projects AS c
			WHERE c.parent_project_id = NEW.id AND c.deleted_at IS NULL
		) THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'project_has_children';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onto_projects_guard_hierarchy ON public.onto_projects;
CREATE TRIGGER trg_onto_projects_guard_hierarchy
	BEFORE INSERT OR UPDATE ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION private.onto_projects_guard_hierarchy_columns();

-- ---------------------------------------------------------------------------
-- Lock several projects in one stable order (ascending id), so two writers
-- touching the same pair cannot deadlock. Same access rule as the single lock.

CREATE OR REPLACE FUNCTION public.onto_lock_projects_for_write(p_project_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
	v_id uuid;
	v_locked integer := 0;
BEGIN
	FOR v_id IN
		SELECT DISTINCT ids.id
		FROM unnest(coalesce(p_project_ids, ARRAY[]::uuid[])) AS ids(id)
		WHERE ids.id IS NOT NULL
		ORDER BY ids.id
	LOOP
		IF public.onto_lock_project_for_write(v_id) THEN
			v_locked := v_locked + 1;
		END IF;
	END LOOP;
	RETURN v_locked;
END;
$$;

REVOKE ALL ON FUNCTION public.onto_lock_projects_for_write(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_lock_projects_for_write(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_lock_projects_for_write(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_lock_projects_for_write(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- Set or clear a project's parent. Needs admin on the child and write on the
-- parent. Creates the parent's shared folder on first use (pinned first in
-- its tree) and returns its id.

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
	v_child record;
	v_parent record;
	v_folder uuid;
	v_structure jsonb;
	v_root jsonb;
	v_version integer;
	v_next jsonb;
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

	-- Denied callers learn nothing about either project.
	IF NOT public.current_actor_has_project_member_access(p_project_id, 'admin')
		OR (
			p_parent_project_id IS NOT NULL
			AND NOT public.current_actor_has_project_member_access(p_parent_project_id, 'write')
		) THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'project_parent_access_denied';
	END IF;

	PERFORM public.onto_lock_projects_for_write(ARRAY[p_project_id, p_parent_project_id]);

	SELECT project.id, project.parent_project_id, project.deleted_at
	INTO v_child
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id;
	IF NOT FOUND OR v_child.deleted_at IS NOT NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'project_not_found';
	END IF;

	IF p_parent_project_id IS NULL THEN
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

-- ---------------------------------------------------------------------------
-- A project's family, filtered to what the actor can read:
--   parent   the parent (null when there is none or the actor can't read it)
--   shelf    live documents under the parent's shared folder, in tree order
--   children this project's sub-projects the actor can read
--   own_shared_folder_document_id / child_count  for a hub's own Docs tab
-- Signed-in callers use their own actor; the service role passes one (chat).

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
		'updated_at', c.updated_at
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
