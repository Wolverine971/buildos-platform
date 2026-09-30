-- supabase/migrations/20260930210000_organize_guard_lock_order.sql
--
-- Hotfix for 20260930170110_organize_atomic_moves_and_journal.sql.
--
-- private.organize_dependent_guard() locked the dependent row's project
-- (FOR UPDATE on onto_projects) on every INSERT, UPDATE and DELETE of twelve
-- tables. That put a project lock AFTER entity writes: a plain task update that
-- syncs assignees (no relationship plan, so no lock-first) bumps the project's
-- context version, then the assignee write took the project lock, the reverse
-- of every lock-first RPC (20260925020000_project_write_lock_first.sql), which
-- hold the project and then bump the version. That is the tasker 105 deadlock.
-- It also serialized embedding upserts, read states and public-page view
-- counts on one exclusive project-row lock.
--
-- The guard only needs to serialize with the Organize mover, and the mover
-- locks every moved document and task FOR UPDATE (documents, then tasks, each
-- in id order) before it changes project_id. So the guard now takes FOR KEY
-- SHARE on the referenced document/task rows in that same order and checks the
-- entity's current project. FOR KEY SHARE waits for the mover's FOR UPDATE and
-- then sees the moved row, but does not conflict with ordinary entity updates
-- (FOR NO KEY UPDATE). It is the lock a foreign-key check already takes.
--
-- DELETE needs no check or lock. onto_assets and onto_project_members never
-- referenced an entity, so the guard only locked the project there; their
-- triggers are dropped.
--
-- The probe (scripts/migration-rehearsal/concurrent-write-probe.mjs,
-- task-update-assignees+task-creates) showed the assignee path deadlocking
-- before 20260930170110 too: assignee rows take FOR KEY SHARE on the project
-- through their project_id foreign key after the task update has bumped the
-- context version. onto_task_update_with_relationships_atomic now locks first
-- whenever it syncs assignees, as it already did for relationship plans.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION private.organize_dependent_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data jsonb; pid uuid; docs uuid[]; tasks uuid[]; mismatched boolean;
BEGIN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  row_data:=to_jsonb(NEW);
  pid:=(row_data->>'project_id')::uuid;
  WITH refs(kind,eid) AS (
    SELECT row_data->>'src_kind',(row_data->>'src_id')::uuid WHERE TG_TABLE_NAME='onto_edges'
    UNION ALL SELECT row_data->>'dst_kind',(row_data->>'dst_id')::uuid WHERE TG_TABLE_NAME='onto_edges'
    UNION ALL SELECT 'document',(row_data->>'document_id')::uuid WHERE TG_TABLE_NAME IN ('onto_public_pages','onto_public_page_review_attempts','onto_document_proposals')
    UNION ALL SELECT 'task',(row_data->>'task_id')::uuid WHERE TG_TABLE_NAME='onto_task_assignees'
    UNION ALL SELECT row_data->>'entity_type',(row_data->>'entity_id')::uuid WHERE TG_TABLE_NAME IN ('onto_comments','onto_comment_read_states','onto_embeddings')
    UNION ALL SELECT row_data->>'owner_entity_type',(row_data->>'owner_entity_id')::uuid WHERE TG_TABLE_NAME='onto_events' AND row_data->>'deleted_at' IS NULL
    UNION ALL SELECT row_data->>'entity_kind',(row_data->>'entity_id')::uuid WHERE TG_TABLE_NAME='onto_asset_links'
  )
  SELECT coalesce(array_agg(DISTINCT eid) FILTER (WHERE kind='document'),'{}'),
         coalesce(array_agg(DISTINCT eid) FILTER (WHERE kind='task'),'{}')
    INTO docs,tasks FROM refs;
  IF cardinality(docs)=0 AND cardinality(tasks)=0 THEN RETURN NEW; END IF;

  -- Same order as private.onto_move_entity_set: documents, then tasks, by id.
  PERFORM 1 FROM public.onto_documents WHERE id=ANY(docs) ORDER BY id FOR KEY SHARE;
  PERFORM 1 FROM public.onto_tasks WHERE id=ANY(tasks) ORDER BY id FOR KEY SHARE;

  -- A reference to a missing entity counts as a mismatch, as before.
  SELECT EXISTS (
      SELECT 1 FROM unnest(docs) AS ref(id)
      LEFT JOIN public.onto_documents AS doc ON doc.id=ref.id
      WHERE doc.project_id IS DISTINCT FROM pid)
    OR EXISTS (
      SELECT 1 FROM unnest(tasks) AS ref(id)
      LEFT JOIN public.onto_tasks AS task ON task.id=ref.id
      WHERE task.project_id IS DISTINCT FROM pid)
    INTO mismatched;
  IF mismatched THEN
    RAISE EXCEPTION 'organize_dependent_project_mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.organize_dependent_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS organize_lock_and_check ON public.onto_assets;
DROP TRIGGER IF EXISTS organize_lock_and_check ON public.onto_project_members;

CREATE OR REPLACE FUNCTION public.onto_task_update_with_relationships_atomic(p_task_id uuid, p_updates jsonb, p_sync_assignees boolean, p_assignee_actor_ids uuid[], p_assigned_by_actor_id uuid, p_relationship_plan jsonb DEFAULT NULL::jsonb, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
	v_result jsonb;
	v_project_id uuid;
	v_relationship_child_id uuid;
	v_relationship_result jsonb := NULL;
	v_mutation jsonb;
BEGIN
	IF p_relationship_plan IS NOT NULL THEN
		IF jsonb_typeof(p_relationship_plan) <> 'object' THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END IF;

		IF jsonb_typeof(p_relationship_plan->'entityContainment') = 'object' THEN
			BEGIN
				v_relationship_child_id :=
					nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid;
			EXCEPTION WHEN invalid_text_representation THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
			END;

			IF p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'task'
				OR v_relationship_child_id IS DISTINCT FROM p_task_id THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
			END IF;
		ELSE
			-- A semantic-only plan is valid only when every mutation is rooted at
			-- this exact task. Requiring at least one mutation keeps an empty or
			-- unrelated plan from being smuggled through the task transaction.
			IF jsonb_typeof(coalesce(p_relationship_plan->'semantic', '[]'::jsonb)) <> 'array'
				OR jsonb_array_length(coalesce(p_relationship_plan->'semantic', '[]'::jsonb)) = 0 THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
			END IF;

			FOR v_mutation IN
				SELECT value
				FROM jsonb_array_elements(p_relationship_plan->'semantic')
			LOOP
				BEGIN
					v_relationship_child_id := nullif(v_mutation->'entity'->>'id', '')::uuid;
				EXCEPTION WHEN invalid_text_representation THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
				END;

				IF v_mutation->'entity'->>'kind' IS DISTINCT FROM 'task'
					OR v_relationship_child_id IS DISTINCT FROM p_task_id THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
				END IF;
			END LOOP;
		END IF;
	END IF;

	-- Lock first (onto_lock_project_for_write) when a later write will lock the
	-- project: the task update bumps the project's context version first. A
	-- relationship plan locks it explicitly; assignee rows take a FOR KEY SHARE
	-- on it through their project_id foreign key, which waits behind a
	-- lock-first writer that is itself waiting for our version row (40P01 in
	-- concurrent-write-probe task-update-assignees+task-creates, 11/25 before).
	-- A plain update with neither takes no project lock and needs none.
	IF p_relationship_plan IS NOT NULL OR coalesce(p_sync_assignees, false) THEN
		PERFORM public.onto_lock_project_for_write((
			SELECT task.project_id FROM public.onto_tasks AS task
			WHERE task.id = p_task_id AND task.deleted_at IS NULL
		));
	END IF;

	v_result := public.onto_task_update_atomic(
		p_task_id,
		p_updates,
		p_sync_assignees,
		p_assignee_actor_ids,
		p_assigned_by_actor_id,
		p_source
	);

	IF p_relationship_plan IS NOT NULL THEN
		BEGIN
			v_project_id := nullif(v_result->'task'->>'project_id', '')::uuid;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END;

		IF v_project_id IS NULL THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END IF;

		v_relationship_result := public.onto_apply_task_update_relationship_plan_atomic(
			v_project_id,
			p_task_id,
			p_relationship_plan
		);
	END IF;

	RETURN v_result || jsonb_build_object('relationships', v_relationship_result);
END;
$function$;

COMMIT;
