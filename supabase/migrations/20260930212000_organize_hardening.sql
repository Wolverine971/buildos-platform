-- supabase/migrations/20260930212000_organize_hardening.sql
--
-- Fix-forward for 20260930170110_organize_atomic_moves_and_journal.sql (applied)
-- after its adversarial review. Runs after 20260930210000 (guard lock order);
-- it does not touch private.organize_dependent_guard.
--
-- 1. Confirmation token covers only what the move touches. The old digest hashed
--    ~15 tables across both whole projects, so any unrelated write between
--    preview and confirm (an embedding upsert, a comment being read, a member
--    change, an edit to some other task, a calendar sync status) changed the
--    token and the move asked for confirmation forever. It now hashes the moved
--    entities, their dependents (edges, comments, attachments, public pages,
--    proposals, assignees, events) and, for document moves, the trees, plus the
--    impact the preview reported. Embeddings and read states are not user
--    visible and are left out; no vector is ever serialized. The plan's
--    project updated_at values are no longer part of the token.
-- 2. Dependent scans filter by project and entity ids, so they use the
--    existing indexes instead of scanning comments/read states/embeddings
--    table-wide while both projects are locked.
-- 3. Preview authorizes without locking. Apply recomputes the token under the
--    ordered project locks and refuses a mismatch, so a lock-free preview
--    cannot confirm anything stale.
-- 4. A retry of the same calendar job reclaims its own lease (the worker now
--    passes the queue row id as the token). A different job still waits.
-- 5. Privacy purge keeps moved files: an object under an expired project's
--    path is kept while an asset in another project still uses it; a moved
--    asset's file goes when that asset or its current project expires; and a
--    project is not held back (or purged early) because of moved files.
-- 6. Organize tree writes go through onto_project_doc_structure_update_atomic:
--    a history row ('move'), child caches, and other top-level keys preserved,
--    so "restore version" sees the Organize move as its own version.
-- 7. Deleting a project removes Organize journal batches that reference it
--    (the journal copies detached edges, assignees and finished proposals).
--    Account deletion already removes the mover's batches (user_id sweep and
--    ON DELETE CASCADE from users).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 3. Authorization with an optional lock.

DROP FUNCTION IF EXISTS private.organize_authorize(uuid, uuid[], uuid);
CREATE FUNCTION private.organize_authorize(
  p_user uuid, p_projects uuid[], p_allow_archived_source uuid DEFAULT NULL, p_lock boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor uuid; pid uuid;
BEGIN
  SELECT id INTO actor FROM public.onto_actors WHERE user_id = p_user LIMIT 1;
  IF p_user IS NULL OR actor IS NULL OR p_projects IS NULL OR cardinality(p_projects) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'organize_access_denied' USING ERRCODE = '42501';
  END IF;
  FOREACH pid IN ARRAY p_projects LOOP
    IF NOT public.actor_has_project_member_access(actor, pid, 'write') THEN
      RAISE EXCEPTION 'organize_access_denied' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF p_lock THEN
    IF public.onto_lock_projects_for_write(p_projects) <> cardinality(p_projects) THEN
      RAISE EXCEPTION 'organize_project_missing' USING ERRCODE = 'P0002';
    END IF;
  ELSIF (SELECT count(*) FROM public.onto_projects WHERE id = ANY(p_projects) AND deleted_at IS NULL)
      <> cardinality(p_projects) THEN
    RAISE EXCEPTION 'organize_project_missing' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.onto_projects WHERE id = ANY(p_projects) AND archived_at IS NOT NULL AND id IS DISTINCT FROM p_allow_archived_source) THEN
    RAISE EXCEPTION 'organize_project_archived' USING ERRCODE = 'P0001';
  END IF;
  IF p_lock THEN
    -- Access can change while waiting for the locks.
    FOREACH pid IN ARRAY p_projects LOOP
      IF NOT public.actor_has_project_member_access(actor, pid, 'write') THEN
        RAISE EXCEPTION 'organize_access_denied' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  RETURN actor;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Scoped fingerprint. p_refs are the moved entities ({kind,id}); trees are
--    hashed only for p_tree_projects (projects a document move touches).

DROP FUNCTION IF EXISTS private.organize_fingerprint(uuid[]);
CREATE FUNCTION private.organize_fingerprint(p_projects uuid[], p_refs jsonb, p_tree_projects uuid[])
RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE docs uuid[]; tasks uuid[]; ids uuid[]; assets uuid[]; parts text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT (r->>'id')::uuid) FILTER (WHERE r->>'kind' = 'document'), '{}'),
         coalesce(array_agg(DISTINCT (r->>'id')::uuid) FILTER (WHERE r->>'kind' = 'task'), '{}')
    INTO docs, tasks FROM jsonb_array_elements(coalesce(p_refs, '[]')) r;
  ids := docs || tasks;
  SELECT coalesce(array_agg(DISTINCT l.asset_id), '{}') INTO assets FROM public.onto_asset_links l
    WHERE l.entity_kind IN ('document', 'task') AND l.entity_id = ANY(ids)
      AND private.organize_has(p_refs, l.entity_kind, l.entity_id);

  parts := ARRAY[
    -- Project status and (for document moves) the canonical tree: ids and order only.
    (SELECT string_agg(md5(jsonb_build_array(p.id, p.archived_at, p.deleted_at, p.shared_folder_document_id,
        CASE WHEN p.id = ANY(coalesce(p_tree_projects, '{}')) THEN private.organize_tree(
          CASE WHEN jsonb_typeof(p.doc_structure->'root') = 'array' THEN p.doc_structure->'root' ELSE '[]'::jsonb END) END)::text),
        '' ORDER BY p.id)
      FROM public.onto_projects p WHERE p.id = ANY(p_projects)),
    (SELECT string_agg(md5(jsonb_build_array(d.id, d.project_id, d.type_key, d.state_key, d.deleted_at, d.archived_at)::text), '' ORDER BY d.id)
      FROM public.onto_documents d WHERE d.id = ANY(docs)),
    (SELECT string_agg(md5(jsonb_build_array(t.id, t.project_id, t.state_key, t.deleted_at, t.archived_at, t.start_at, t.due_at)::text), '' ORDER BY t.id)
      FROM public.onto_tasks t WHERE t.id = ANY(tasks)),
    (SELECT string_agg(md5(to_jsonb(e)::text), '' ORDER BY e.id)
      FROM public.onto_edges e
      WHERE e.project_id = ANY(p_projects)
        AND ((e.src_kind IN ('document', 'task') AND e.src_id = ANY(ids))
          OR (e.dst_kind IN ('document', 'task') AND e.dst_id = ANY(ids)))),
    (SELECT string_agg(md5(to_jsonb(c)::text), '' ORDER BY c.id)
      FROM public.onto_comments c
      WHERE c.project_id = ANY(p_projects) AND c.entity_type IN ('document', 'task') AND c.entity_id = ANY(ids)
        AND private.organize_has(p_refs, c.entity_type, c.entity_id)),
    (SELECT string_agg(md5(to_jsonb(l)::text), '' ORDER BY l.id)
      FROM public.onto_asset_links l
      WHERE (l.entity_kind IN ('document', 'task') AND l.entity_id = ANY(ids)) OR l.asset_id = ANY(assets)),
    (SELECT string_agg(md5(jsonb_build_array(a.id, a.project_id, a.storage_project_id, a.storage_bucket, a.storage_path, a.deleted_at)::text), '' ORDER BY a.id)
      FROM public.onto_assets a WHERE a.id = ANY(assets)),
    (SELECT string_agg(md5(jsonb_build_array(pp.id, pp.project_id, pp.document_id, pp.slug, pp.status, pp.public_status, pp.visibility, pp.deleted_at, pp.live_sync_enabled)::text), '' ORDER BY pp.id)
      FROM public.onto_public_pages pp WHERE pp.document_id = ANY(docs)),
    (SELECT string_agg(md5(jsonb_build_array(ra.id, ra.project_id, ra.status, ra.admin_decision)::text), '' ORDER BY ra.id)
      FROM public.onto_public_page_review_attempts ra WHERE ra.document_id = ANY(docs)),
    (SELECT string_agg(md5(jsonb_build_array(dp.id, dp.project_id, dp.status, dp.updated_at)::text), '' ORDER BY dp.id)
      FROM public.onto_document_proposals dp WHERE dp.document_id = ANY(docs)),
    (SELECT string_agg(md5(to_jsonb(ta)::text), '' ORDER BY ta.id)
      FROM public.onto_task_assignees ta WHERE ta.task_id = ANY(tasks)),
    -- Calendar sync status/timestamps are machine churn and are left out.
    (SELECT string_agg(md5(jsonb_build_array(ev.id, ev.project_id, ev.owner_entity_type, ev.owner_entity_id,
        ev.props->>'task_id', ev.deleted_at, ev.start_at, ev.end_at, ev.recurrence)::text), '' ORDER BY ev.id)
      FROM public.onto_events ev
      WHERE ev.project_id = ANY(p_projects) AND cardinality(tasks) > 0
        AND ((ev.owner_entity_type = 'task' AND ev.owner_entity_id = ANY(tasks))
          OR ev.props->>'task_id' = ANY(tasks::text[])))
  ];
  RETURN md5(array_to_string(parts, '|', '-'));
END $$;

-- ---------------------------------------------------------------------------
-- 1+2. Impact: id-scoped predicates; no embedding count (not user visible,
--      and it made the token churn on every re-embed).

CREATE OR REPLACE FUNCTION private.organize_impact(p_source uuid, p_dest uuid, p_refs jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE docs uuid[]; tasks uuid[]; ids uuid[]; assets uuid[]; blockers jsonb := '[]'; edges jsonb;
  assignees jsonb; proposals jsonb; links jsonb; events jsonb; result jsonb;
  tasks_to_reconcile integer;
BEGIN
  SELECT coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='document'),'{}'),
         coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='task'),'{}')
    INTO docs,tasks FROM jsonb_array_elements(p_refs) r;
  ids := docs || tasks;
  IF EXISTS (SELECT 1 FROM public.onto_document_proposals WHERE document_id=ANY(docs) AND status='pending') THEN
    blockers:=blockers||jsonb_build_array('pending_document_proposal');
  END IF;
  IF EXISTS (SELECT 1 FROM public.onto_tasks WHERE id=ANY(tasks) AND (
    nullif(btrim(props->>'series_id'),'') IS NOT NULL OR coalesce(props->'series','null')<>'null'
    OR coalesce(props->'recurrence','null')<>'null' OR nullif(btrim(props->>'recurrence_pattern'),'') IS NOT NULL
    OR nullif(btrim(props->>'recurrence_rrule'),'') IS NOT NULL OR props->>'task_type'='recurring')) THEN
    blockers:=blockers||jsonb_build_array('recurring_task_not_supported');
  END IF;
  SELECT coalesce(array_agg(DISTINCT asset_id),'{}') INTO assets FROM public.onto_asset_links
    WHERE project_id=p_source AND entity_kind IN ('document','task') AND entity_id=ANY(ids)
      AND private.organize_has(p_refs,entity_kind,entity_id);
  IF EXISTS (SELECT 1 FROM public.onto_asset_links WHERE asset_id=ANY(assets)
      AND NOT private.organize_has(p_refs,entity_kind,entity_id)) THEN
    blockers:=blockers||jsonb_build_array('shared_asset_requires_joint_move');
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') INTO edges FROM public.onto_edges e
    WHERE e.project_id=p_source
      AND ((e.src_kind IN ('document','task') AND e.src_id=ANY(ids)) OR (e.dst_kind IN ('document','task') AND e.dst_id=ANY(ids)))
      AND (private.organize_has(p_refs,e.src_kind,e.src_id) <> private.organize_has(p_refs,e.dst_kind,e.dst_id));
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO assignees FROM public.onto_task_assignees a
    WHERE a.task_id=ANY(tasks) AND NOT EXISTS (SELECT 1 FROM public.onto_projects p WHERE p.id=p_dest AND p.created_by=a.assignee_actor_id)
    AND NOT EXISTS (SELECT 1 FROM public.onto_project_members m WHERE m.project_id=p_dest AND m.actor_id=a.assignee_actor_id AND m.removed_at IS NULL);
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') INTO proposals FROM public.onto_document_proposals p
    WHERE p.document_id=ANY(docs) AND p.status<>'pending';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'props',jsonb_strip_nulls(jsonb_build_object(
    'goal_id',props->'goal_id','supporting_milestone_id',props->'supporting_milestone_id','plan_id',props->'plan_id'))) ORDER BY id),'[]')
    INTO links FROM public.onto_tasks WHERE id=ANY(tasks);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'project_id',project_id,'task_id',CASE WHEN owner_entity_type='task' THEN owner_entity_id::text ELSE props->>'task_id' END) ORDER BY id),'[]') INTO events
    FROM public.onto_events WHERE project_id=p_source AND deleted_at IS NULL AND cardinality(tasks)>0
      AND ((owner_entity_type='task' AND owner_entity_id=ANY(tasks)) OR props->>'task_id'=ANY(tasks::text[]));
  IF EXISTS (SELECT 1 FROM public.onto_events WHERE id=ANY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(events) e)
      AND recurrence IS NOT NULL AND recurrence<>'{}' AND recurrence<>'null') THEN
    blockers:=blockers||jsonb_build_array('recurring_event_not_supported');
  END IF;
  SELECT count(*) INTO tasks_to_reconcile FROM public.onto_tasks WHERE id=ANY(tasks)
    AND (start_at IS NOT NULL OR due_at IS NOT NULL OR id::text=ANY(SELECT e->>'task_id' FROM jsonb_array_elements(events) e));
  IF tasks_to_reconcile>0 AND NOT coalesce((SELECT calendar_sync_ready FROM private.organize_rollout WHERE singleton),false) THEN
    blockers:=blockers||jsonb_build_array('calendar_sync_not_deployed');
  END IF;
  IF cardinality(assets)>0 AND NOT coalesce((SELECT asset_access_ready FROM private.organize_rollout WHERE singleton),false) THEN
    blockers:=blockers||jsonb_build_array('asset_access_not_deployed');
  END IF;
  result:=jsonb_build_object('source_project_id',p_source,'destination_project_id',p_dest,'refs',p_refs,
    'tasks_to_reconcile',tasks_to_reconcile,
    'blockers',blockers,'detached_edges',edges,'removed_assignees',assignees,'finished_proposals',proposals,
    'task_links',links,'removed_events',events,'asset_ids',to_jsonb(assets),
    'comments_to_move',(SELECT count(*) FROM public.onto_comments WHERE project_id=p_source
      AND entity_type IN ('document','task') AND entity_id=ANY(ids) AND private.organize_has(p_refs,entity_type,entity_id)),
    'public_pages_to_move',(SELECT count(*) FROM public.onto_public_pages WHERE document_id=ANY(docs)),
    'relationships_to_move',(SELECT count(*) FROM public.onto_edges WHERE project_id=p_source
      AND src_kind IN ('document','task') AND src_id=ANY(ids) AND dst_kind IN ('document','task') AND dst_id=ANY(ids)
      AND private.organize_has(p_refs,src_kind,src_id) AND private.organize_has(p_refs,dst_kind,dst_id)));
  RETURN result;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The mover, with project/entity-scoped dependent updates. Otherwise as in
--    20260930170110.

CREATE OR REPLACE FUNCTION private.onto_move_entity_set(p_source uuid,p_dest uuid,p_refs jsonb,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE impact jsonb; docs uuid[]; tasks uuid[]; ids uuid[]; assets uuid[]; t uuid; moved_ref jsonb; event_ids jsonb;
  previous_refs text:=current_setting('buildos.organize_refs',true);
  previous_assets text:=current_setting('buildos.organize_assets',true);
BEGIN
  PERFORM private.organize_authorize(p_user,ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_source,p_dest]) x ORDER BY x),p_source);
  IF p_source=p_dest THEN RAISE EXCEPTION 'organize_same_project'; END IF;
  SELECT coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='document'),'{}'),
         coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='task'),'{}')
    INTO docs,tasks FROM jsonb_array_elements(p_refs) r;
  ids := docs || tasks;
  PERFORM 1 FROM public.onto_documents WHERE id=ANY(docs) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.onto_tasks WHERE id=ANY(tasks) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.onto_documents WHERE id=ANY(docs) AND project_id=p_source AND deleted_at IS NULL AND state_key<>'archived')<>cardinality(docs)
    OR (SELECT count(*) FROM public.onto_tasks WHERE id=ANY(tasks) AND project_id=p_source AND deleted_at IS NULL AND archived_at IS NULL)<>cardinality(tasks)
    OR EXISTS (SELECT 1 FROM public.onto_documents d WHERE id=ANY(docs) AND (type_key IN ('document.context.project','document.context.thinking_log')
      OR EXISTS (SELECT 1 FROM public.onto_projects WHERE shared_folder_document_id=d.id))) THEN
    RAISE EXCEPTION 'organize_entity_conflict' USING ERRCODE='P0001';
  END IF;
  impact:=private.organize_impact(p_source,p_dest,p_refs);
  IF jsonb_array_length(impact->'blockers')>0 THEN RAISE EXCEPTION 'organize_blocked: %',impact->'blockers'; END IF;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO assets FROM jsonb_array_elements_text(impact->'asset_ids');
  PERFORM set_config('buildos.organize_refs',p_refs::text,true);
  PERFORM set_config('buildos.organize_assets',to_jsonb(assets)::text,true);
  DELETE FROM public.onto_document_proposals WHERE document_id=ANY(docs);
  DELETE FROM public.onto_edges WHERE id=ANY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(impact->'detached_edges') e);
  DELETE FROM public.onto_task_assignees WHERE id=ANY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(impact->'removed_assignees') e);
  -- Soft-delete old events so their external calendar mappings survive until
  -- the durable sync job removes them. Calendar work is never part of a preview.
  UPDATE public.onto_events SET deleted_at=now(),sync_status='pending' WHERE id=ANY(
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(impact->'removed_events') e);
  DELETE FROM public.onto_edges WHERE (src_kind='event' AND src_id=ANY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(impact->'removed_events') e))
    OR (dst_kind='event' AND dst_id=ANY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(impact->'removed_events') e));
  UPDATE public.onto_documents SET project_id=p_dest WHERE id=ANY(docs);
  UPDATE public.onto_tasks SET project_id=p_dest,props=props-'goal_id'-'supporting_milestone_id'-'plan_id' WHERE id=ANY(tasks);
  UPDATE public.onto_edges SET project_id=p_dest WHERE project_id=p_source
    AND src_kind IN ('document','task') AND src_id=ANY(ids) AND dst_kind IN ('document','task') AND dst_id=ANY(ids)
    AND private.organize_has(p_refs,src_kind,src_id) AND private.organize_has(p_refs,dst_kind,dst_id);
  UPDATE public.onto_task_assignees SET project_id=p_dest WHERE task_id=ANY(tasks);
  UPDATE public.onto_comments SET project_id=p_dest WHERE project_id=p_source
    AND entity_type IN ('document','task') AND entity_id=ANY(ids) AND private.organize_has(p_refs,entity_type,entity_id);
  UPDATE public.onto_comment_read_states SET project_id=p_dest WHERE project_id=p_source
    AND entity_type IN ('document','task') AND entity_id=ANY(ids) AND private.organize_has(p_refs,entity_type,entity_id);
  UPDATE public.onto_embeddings SET project_id=p_dest WHERE project_id=p_source AND (
    (entity_type IN ('document','task') AND entity_id=ANY(ids) AND private.organize_has(p_refs,entity_type,entity_id))
    OR (entity_type='image' AND entity_id=ANY(assets)));
  UPDATE public.onto_public_pages SET project_id=p_dest WHERE document_id=ANY(docs);
  UPDATE public.onto_public_page_review_attempts SET project_id=p_dest WHERE document_id=ANY(docs);
  UPDATE public.onto_assets SET project_id=p_dest WHERE id=ANY(assets);
  UPDATE public.onto_asset_links SET project_id=p_dest WHERE asset_id=ANY(assets);
  PERFORM set_config('buildos.organize_refs',coalesce(previous_refs,''),true);
  PERFORM set_config('buildos.organize_assets',coalesce(previous_assets,''),true);
  -- The sync job reconciles against the task's CURRENT project on retry.
  event_ids:=impact->'removed_events';
  FOREACH t IN ARRAY tasks LOOP
    IF NOT EXISTS(SELECT 1 FROM public.onto_tasks WHERE id=t AND (start_at IS NOT NULL OR due_at IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(event_ids) e WHERE e->>'task_id'=t::text) THEN CONTINUE; END IF;
    PERFORM public.add_queue_job(p_user,'sync_calendar',jsonb_build_object('kind','onto_organize_task_sync',
      'taskId',t,'sourceProjectId',p_source,'destinationProjectId',p_dest,'removedEvents',(SELECT coalesce(jsonb_agg(e),'[]') FROM jsonb_array_elements(event_ids) e WHERE e->>'task_id'=t::text)),5,now(),
      'organize-task-sync:'||t||':'||gen_random_uuid());
  END LOOP;
  FOR moved_ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
    INSERT INTO public.onto_project_logs(project_id,entity_type,entity_id,action,before_data,after_data,changed_by,change_source)
      SELECT project,moved_ref->>'kind',(moved_ref->>'id')::uuid,'updated',jsonb_build_object('project_id',p_source),
        jsonb_build_object('project_id',p_dest,'moved_from_project_id',p_source),p_user,'form'
      FROM unnest(ARRAY[p_source,p_dest]) project;
  END LOOP;
  RETURN impact;
END $$;

-- ---------------------------------------------------------------------------
-- 1+3. Prepare: lock only when applying; scoped token.

DROP FUNCTION IF EXISTS private.organize_prepare(uuid, jsonb, uuid);
CREATE FUNCTION private.organize_prepare(p_user uuid, p_plan jsonb, p_inverse uuid, p_lock boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE pids uuid[]; tree_pids uuid[]; compiled jsonb; g record; impacts jsonb:='[]'; impact jsonb; token text; trees jsonb;
BEGIN
  SELECT array_agg(DISTINCT (p->>'id')::uuid ORDER BY (p->>'id')::uuid) INTO pids
    FROM jsonb_array_elements(p_plan->'projects') p;
  PERFORM private.organize_authorize(p_user,pids,NULL,p_lock);
  IF p_inverse IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.onto_organize_batches
    WHERE id=p_inverse AND user_id=p_user AND project_ids <@ pids) THEN
    RAISE EXCEPTION 'organize_batch_access_denied' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.onto_organize_batches WHERE inverse_of=p_inverse) THEN
    RAISE EXCEPTION 'organize_already_undone' USING ERRCODE='P0001';
  END IF;
  compiled:=private.organize_compile(p_plan);
  FOR g IN SELECT (r->>'source')::uuid src,(r->>'destination')::uuid dst,jsonb_agg(r ORDER BY r->>'id') refs
    FROM jsonb_array_elements(compiled->'refs') r GROUP BY r->>'source',r->>'destination' ORDER BY r->>'source',r->>'destination' LOOP
    impact:=private.organize_impact(g.src,g.dst,g.refs);
    impacts:=impacts||jsonb_build_array(impact);
  END LOOP;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO tree_pids
    FROM jsonb_array_elements(p_plan->'moves') m
    CROSS JOIN LATERAL unnest(ARRAY[(m->>'project_id')::uuid,(m->>'destination_project_id')::uuid]) x
    WHERE m->>'kind'='document';
  -- Final trees by identity and order (display metadata and the snapshot's
  -- project updated_at values are not part of the promise).
  SELECT coalesce(jsonb_agg(jsonb_build_array(t->>'project_id',private.organize_tree(t->'root')) ORDER BY t->>'project_id'),'[]')
    INTO trees FROM jsonb_array_elements(p_plan->'trees') t;
  token:=md5(concat_ws('|',p_user::text,coalesce(p_inverse::text,''),(p_plan->'moves')::text,trees::text,
    private.organize_fingerprint(pids,compiled->'refs',tree_pids),impacts::text));
  RETURN jsonb_build_object('token',token,'compiled',compiled,'impacts',impacts,'project_ids',to_jsonb(pids));
END $$;

CREATE OR REPLACE FUNCTION public.onto_organize_preview(p_user_id uuid,p_plan jsonb,p_inverse_of uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prepared jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organize_service_only' USING ERRCODE='42501'; END IF;
  -- No project locks: apply recomputes this token under its locks.
  prepared:=private.organize_prepare(p_user_id,p_plan,p_inverse_of,false);
  RETURN jsonb_build_object('confirmation_token',prepared->'token',
    'impact',private.organize_public_impact(prepared->'impacts'),
    'manifest',prepared->'compiled'->'steps');
END $$;

-- ---------------------------------------------------------------------------
-- 6. Tree writes with history, child caches and other top-level keys kept.

CREATE FUNCTION private.organize_write_tree(p_project uuid, p_root jsonb, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE cur jsonb; v integer; children jsonb;
BEGIN
  SELECT doc_structure INTO cur FROM public.onto_projects WHERE id=p_project;
  IF jsonb_typeof(cur) IS DISTINCT FROM 'object' THEN cur:='{}'::jsonb; END IF;
  v:=CASE WHEN jsonb_typeof(cur->'version')='number' AND (cur->>'version') ~ '^[0-9]+$'
    THEN (cur->>'version')::integer ELSE 1 END;
  -- Same cache shape as doc-structure.service buildChangedDocumentChildren.
  SELECT coalesce(jsonb_agg(jsonb_build_object('document_id',n.id,'children',k.kids) ORDER BY n.id),'[]'::jsonb)
    INTO children
    FROM private.organize_nodes(p_root) n
    CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.value->>'id','order',
          CASE WHEN jsonb_typeof(c.value->'order')='number' THEN c.value->'order' ELSE to_jsonb(c.ordinality-1) END)
        ORDER BY c.ordinality),'[]'::jsonb) AS kids
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.node->'children')='array' THEN n.node->'children' ELSE '[]'::jsonb END)
        WITH ORDINALITY c
    ) k
    JOIN public.onto_documents d ON d.id=n.id AND d.project_id=p_project
    WHERE d.children IS DISTINCT FROM jsonb_build_object('children',k.kids);
  PERFORM public.onto_project_doc_structure_update_atomic(
    p_project, v, cur || jsonb_build_object('version',v+1,'root',p_root), 'move', p_actor, children);
END $$;

CREATE OR REPLACE FUNCTION public.onto_organize_apply_atomic(p_user_id uuid,p_plan jsonb,p_confirmation_token text,p_batch_id uuid,p_inverse_of uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prepared jsonb; existing public.onto_organize_batches; pids uuid[]; g record; p jsonb; actor uuid;
  effects jsonb:='[]'; restored jsonb:='{}'; receipt jsonb; request_hash text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organize_service_only' USING ERRCODE='42501'; END IF;
  IF p_batch_id IS NULL OR p_confirmation_token IS NULL THEN RAISE EXCEPTION 'organize_invalid_arguments'; END IF;
  request_hash:=md5((p_plan->'moves')::text||p_confirmation_token||coalesce(p_inverse_of::text,''));
  -- A batch id serializes retries even when two HTTP requests arrive together.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_batch_id::text,0));
  SELECT * INTO existing FROM public.onto_organize_batches WHERE id=p_batch_id;
  IF FOUND THEN
    IF existing.user_id<>p_user_id OR existing.request_hash<>request_hash THEN RAISE EXCEPTION 'organize_idempotency_conflict'; END IF;
    PERFORM private.organize_authorize(p_user_id,existing.project_ids);
    RETURN existing.receipt||jsonb_build_object('replayed',true);
  END IF;
  prepared:=private.organize_prepare(p_user_id,p_plan,p_inverse_of,true);
  IF prepared->>'token' IS DISTINCT FROM p_confirmation_token THEN
    RAISE EXCEPTION 'organize_stale_preview' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(prepared->'impacts') i WHERE jsonb_array_length(i->'blockers')>0) THEN
    RAISE EXCEPTION 'organize_blocked';
  END IF;
  SELECT array_agg(value::uuid) INTO pids FROM jsonb_array_elements_text(prepared->'project_ids');
  SELECT id INTO actor FROM public.onto_actors WHERE user_id=p_user_id LIMIT 1;
  FOR g IN SELECT (r->>'source')::uuid src,(r->>'destination')::uuid dst,jsonb_agg(r ORDER BY r->>'id') refs
    FROM jsonb_array_elements(prepared->'compiled'->'refs') r GROUP BY r->>'source',r->>'destination' ORDER BY r->>'source',r->>'destination' LOOP
    effects:=effects||jsonb_build_array(private.onto_move_entity_set(g.src,g.dst,g.refs,p_user_id));
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(p_plan->'trees') ORDER BY value->>'project_id' LOOP
    -- Only trees affected by document moves get rewritten. Task-only batches
    -- cannot incidentally normalize a project's unlinked/stale document nodes.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'moves') m WHERE m->>'kind'='document'
      AND (m->>'project_id'=p->>'project_id' OR m->>'destination_project_id'=p->>'project_id')) THEN
      PERFORM private.organize_write_tree((p->>'project_id')::uuid,p->'root',actor);
      INSERT INTO public.onto_project_logs(project_id,entity_type,entity_id,action,after_data,changed_by,change_source)
        VALUES ((p->>'project_id')::uuid,'project',(p->>'project_id')::uuid,'updated',
          jsonb_build_object('organize_batch_id',p_batch_id),p_user_id,'form');
    END IF;
  END LOOP;
  IF p_inverse_of IS NOT NULL THEN
    SELECT private.organize_restore_effects(b.effects,prepared->'compiled'->'refs') INTO restored FROM public.onto_organize_batches b WHERE b.id=p_inverse_of;
  END IF;
  receipt:=jsonb_build_object('status','applied','batch_id',p_batch_id,'inverse_of',p_inverse_of,
    'operations',jsonb_array_length(p_plan->'moves'),'impact',private.organize_public_impact(effects),
    'restoration',restored,'skipped',coalesce(p_plan->'skipped','[]'::jsonb),'calendar_sync',
    CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(effects) e WHERE (e->>'tasks_to_reconcile')::int>0) THEN 'queued' ELSE 'not_needed' END,'replayed',false);
  INSERT INTO public.onto_organize_batches(id,user_id,project_ids,inverse_of,request_hash,plan,manifest,effects,receipt)
    VALUES(p_batch_id,p_user_id,pids,p_inverse_of,request_hash,p_plan,prepared->'compiled'->'steps',effects,receipt);
  RETURN receipt;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Legacy task move: same contract, scoped token (task, its dependents,
--    and the impact it reported).

CREATE OR REPLACE FUNCTION public.onto_task_move_atomic(p_task_id uuid,p_expected_source_project_id uuid,
  p_destination_project_id uuid,p_confirmation_token text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE task public.onto_tasks; before_task jsonb; impact jsonb; token text; refs jsonb; src jsonb; dst jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'task_move_access_denied' USING ERRCODE='42501'; END IF;
  IF p_expected_source_project_id IS NULL OR p_destination_project_id IS NULL OR p_task_id IS NULL
    OR p_expected_source_project_id=p_destination_project_id THEN RAISE EXCEPTION 'task_move_invalid_arguments'; END IF;
  IF NOT public.current_actor_has_project_member_access(p_expected_source_project_id,'write')
    OR NOT public.current_actor_has_project_member_access(p_destination_project_id,'write') THEN
    RAISE EXCEPTION 'task_move_access_denied' USING ERRCODE='42501'; END IF;
  PERFORM public.onto_lock_projects_for_write(ARRAY[p_expected_source_project_id,p_destination_project_id]);
  SELECT jsonb_build_object('id',id,'name',name) INTO src FROM public.onto_projects WHERE id=p_expected_source_project_id;
  SELECT jsonb_build_object('id',id,'name',name) INTO dst FROM public.onto_projects WHERE id=p_destination_project_id;
  SELECT * INTO task FROM public.onto_tasks WHERE id=p_task_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_move_task_not_found'; END IF;
  IF task.project_id=p_destination_project_id THEN
    RETURN jsonb_build_object('status','already_moved','requires_user_action',false,'task',to_jsonb(task),'source_project',src,'destination_project',dst);
  END IF;
  IF task.project_id<>p_expected_source_project_id THEN RAISE EXCEPTION 'task_move_source_project_mismatch'; END IF;
  PERFORM private.organize_authorize(auth.uid(),ARRAY(SELECT x FROM unnest(ARRAY[p_expected_source_project_id,p_destination_project_id]) x ORDER BY x),p_expected_source_project_id);
  before_task:=to_jsonb(task); refs:=jsonb_build_array(jsonb_build_object('kind','task','id',p_task_id));
  impact:=private.organize_impact(p_expected_source_project_id,p_destination_project_id,refs);
  token:=md5(concat_ws('|',p_task_id::text,p_destination_project_id::text,
    private.organize_fingerprint(ARRAY[p_expected_source_project_id,p_destination_project_id],refs,'{}'::uuid[]),impact::text));
  IF jsonb_array_length(impact->'blockers')>0 THEN
    RETURN jsonb_build_object('status','blocked','requires_user_action',true,'task',before_task,'source_project',src,'destination_project',dst,
      'impact',private.organize_public_impact(jsonb_build_array(impact))->0,'blocker',impact->'blockers'->>0,'message','Move blocked: '||(impact->'blockers')::text);
  END IF;
  IF coalesce(p_confirmation_token,'')<>token AND (
    jsonb_array_length(impact->'detached_edges')>0 OR jsonb_array_length(impact->'removed_assignees')>0
    OR jsonb_array_length(impact->'asset_ids')>0 OR jsonb_array_length(impact->'removed_events')>0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(impact->'task_links') l WHERE l->'props'<>'{}'::jsonb)
    OR task.start_at IS NOT NULL OR task.due_at IS NOT NULL) THEN
    RETURN jsonb_build_object('status','confirmation_required','requires_user_action',true,'task',before_task,'source_project',src,'destination_project',dst,
      'impact',private.organize_public_impact(jsonb_build_array(impact))->0,'confirmation_token',token,
      'message','Ask the user to confirm this move and its impact. Never confirm on the user''s behalf.');
  END IF;
  impact:=private.onto_move_entity_set(p_expected_source_project_id,p_destination_project_id,refs,auth.uid());
  SELECT * INTO task FROM public.onto_tasks WHERE id=p_task_id;
  RETURN jsonb_build_object('status','moved','requires_user_action',false,'task',to_jsonb(task),'task_before',before_task,
    'source_project',src,'destination_project',dst,'impact',private.organize_public_impact(jsonb_build_array(impact))->0,
    'applied',jsonb_build_object('calendar_sync',CASE WHEN (impact->>'tasks_to_reconcile')::int>0 THEN 'queued' ELSE 'not_needed' END,'activity_logged',true));
END $$;

-- ---------------------------------------------------------------------------
-- 4. A job's retries reclaim their own lease; other jobs wait for expiry.

CREATE OR REPLACE FUNCTION public.claim_organize_calendar_sync(p_task_id uuid,p_token uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE n int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organize_service_only'; END IF;
  IF p_task_id IS NULL OR p_token IS NULL THEN RAISE EXCEPTION 'organize_invalid_arguments'; END IF;
  INSERT INTO private.organize_calendar_leases VALUES(p_task_id,p_token,clock_timestamp()+interval '15 minutes')
    ON CONFLICT(task_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
    WHERE organize_calendar_leases.expires_at<clock_timestamp()
      OR organize_calendar_leases.token=excluded.token;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Privacy purge and moved assets. onto-assets paths are
--    projects/<storage_project_id>/assets/<asset_id>/<file>; storage_project_id
--    stays put when an asset moves, project_id follows the move.

CREATE OR REPLACE FUNCTION public.list_privacy_deleted_asset_objects(
	p_limit integer DEFAULT 200
)
RETURNS TABLE (object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
BEGIN
	RETURN QUERY
	SELECT objects.name
	FROM storage.objects objects
	LEFT JOIN LATERAL (
		SELECT owner.project_id, owner.deleted_at
		FROM (
			SELECT assets.project_id, assets.deleted_at, 0 AS rank
			FROM public.onto_assets assets
			WHERE assets.storage_bucket = objects.bucket_id
				AND assets.storage_path = objects.name
			UNION ALL
			SELECT assets.project_id, assets.deleted_at, 1
			FROM public.onto_assets assets
			WHERE split_part(objects.name, '/', 3) = 'assets'
				-- Cast the path segment (not the column) so the primary key is used.
				AND assets.id = CASE
					WHEN split_part(objects.name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
					THEN split_part(objects.name, '/', 4)::uuid
				END
				AND assets.storage_project_id::text = split_part(objects.name, '/', 2)
		) owner
		ORDER BY owner.rank
		LIMIT 1
	) asset ON true
	WHERE objects.bucket_id = 'onto-assets'
		AND split_part(objects.name, '/', 1) = 'projects'
		AND (
			-- The asset the file belongs to expired.
			asset.deleted_at <= v_cutoff
			-- The project that owns the asset now expired (a moved asset's file
			-- sits under the path of the project it came from).
			OR EXISTS (
				SELECT 1
				FROM public.onto_projects projects
				WHERE projects.id = asset.project_id
					AND projects.deleted_at <= v_cutoff
			)
			-- The project whose path holds the file expired, and no asset that
			-- moved to another project still uses the file.
			OR (
				EXISTS (
					SELECT 1
					FROM public.onto_projects projects
					WHERE projects.id::text = split_part(objects.name, '/', 2)
						AND projects.deleted_at <= v_cutoff
				)
				AND (asset.project_id IS NULL OR asset.project_id::text = split_part(objects.name, '/', 2))
			)
		)
	ORDER BY objects.name
	LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

-- As in 20260924190400, with the storage gate fixed for moved assets:
--   * a file under this project's path that a moved asset (now in another
--     project) still uses does not hold this project back forever;
--   * a file of an asset moved INTO this project sits under another project's
--     path; the project waits until the storage sweep removed it, so the
--     cascade never deletes the asset row and orphans its file.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_projects(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- delete_onto_project() uses unqualified names.
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 25);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_project_id uuid;
	v_purged uuid[] := '{}'::uuid[];
	v_failed integer := 0;
BEGIN
	FOR v_project_id IN
		SELECT projects.id
		FROM public.onto_projects projects
		WHERE projects.deleted_at <= v_cutoff
			AND NOT EXISTS (
				SELECT 1
				FROM storage.objects objects
				WHERE objects.bucket_id = 'onto-assets'
					AND split_part(objects.name, '/', 1) = 'projects'
					AND split_part(objects.name, '/', 2) = projects.id::text
					AND NOT EXISTS (
						SELECT 1
						FROM public.onto_assets moved
						WHERE moved.storage_bucket = objects.bucket_id
							AND moved.storage_path = objects.name
							AND moved.project_id <> projects.id
					)
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.onto_assets moved_in
				JOIN storage.objects objects
					ON objects.bucket_id = moved_in.storage_bucket
					AND objects.name = moved_in.storage_path
				WHERE moved_in.project_id = projects.id
					AND moved_in.storage_project_id <> projects.id
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.privacy_purge_failures failures
				WHERE failures.source_table = 'onto_projects'
					AND failures.row_id = projects.id
					AND failures.last_failed_at > now() - interval '20 hours'
			)
		ORDER BY projects.deleted_at, projects.id
		LIMIT v_batch
		FOR UPDATE OF projects SKIP LOCKED
	LOOP
		BEGIN
			DELETE FROM public.cycle_runs runs
			WHERE runs.project_id = v_project_id
				OR runs.cycle_id IN (
					SELECT cycles.id FROM public.cycles cycles WHERE cycles.project_id = v_project_id
				);
			DELETE FROM public.cycles WHERE project_id = v_project_id;
			DELETE FROM public.onto_project_logs WHERE project_id = v_project_id;
			DELETE FROM public.onto_edges WHERE project_id = v_project_id;
			PERFORM public.delete_onto_project(v_project_id);
			v_purged := array_append(v_purged, v_project_id);
		EXCEPTION WHEN OTHERS THEN
			PERFORM public.record_privacy_purge_failure('onto_projects', v_project_id, SQLSTATE);
			v_failed := v_failed + 1;
		END;
	END LOOP;

	IF cardinality(v_purged) > 0 THEN
		UPDATE public.notification_events events
		SET payload = events.payload - 'project_name'
		WHERE events.payload ? 'project_name'
			AND events.payload->>'project_id' = ANY (v_purged::text[]);

		DELETE FROM public.privacy_purge_failures
		WHERE source_table = 'onto_projects' AND row_id = ANY (v_purged);
	END IF;

	RETURN jsonb_build_object(
		'projects_deleted', cardinality(v_purged),
		'project_purge_failures', v_failed
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. A deleted project takes its Organize journal entries with it (30-day
--    purge, account deletion, any hard delete). An inverse that does not
--    itself reference the project loses only its pointer.

CREATE INDEX IF NOT EXISTS onto_organize_batches_project_ids_idx
  ON public.onto_organize_batches USING gin (project_ids);

CREATE FUNCTION private.organize_forget_deleted_projects() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(old_rows.id), '{}') INTO v_ids FROM old_rows;
  IF cardinality(v_ids) = 0 THEN RETURN NULL; END IF;
  UPDATE public.onto_organize_batches SET inverse_of = NULL
  WHERE NOT (project_ids && v_ids)
    AND inverse_of IN (SELECT b.id FROM public.onto_organize_batches b WHERE b.project_ids && v_ids);
  DELETE FROM public.onto_organize_batches WHERE project_ids && v_ids;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_onto_projects_forget_organize_batches
  AFTER DELETE ON public.onto_projects
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.organize_forget_deleted_projects();

-- ---------------------------------------------------------------------------
-- Grants: nothing here is callable by a browser. Dropped/recreated helpers
-- need their service_role grant back.

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND (p.proname LIKE 'organize_%' OR p.proname='onto_move_entity_set'))
      OR (n.nspname='public' AND p.proname IN ('onto_organize_preview','onto_organize_apply_atomic','claim_organize_calendar_sync','release_organize_calendar_sync')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.organize_forget_deleted_projects() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
