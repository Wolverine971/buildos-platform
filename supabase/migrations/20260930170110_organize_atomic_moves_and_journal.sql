-- supabase/migrations/20260930170110_organize_atomic_moves_and_journal.sql
-- Organize phase 2. Service-only batch APIs take an explicit authenticated user.
-- All preview/apply paths authorize before reading, then lock projects in UUID order.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT USAGE ON SCHEMA private TO service_role;
-- Schema-first rollout: the deployed worker must recognize the new calendar
-- payload and web asset access must accept the immutable storage anchor before
-- those move types are enabled. Only the database operator can change readiness.
CREATE TABLE private.organize_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  calendar_sync_ready boolean NOT NULL DEFAULT false,
  asset_access_ready boolean NOT NULL DEFAULT false
);
INSERT INTO private.organize_rollout(singleton) VALUES (true);
ALTER TABLE private.organize_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.organize_rollout FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.organize_rollout TO service_role;
-- Legacy trigger helpers use unqualified table names; pin their lookup path.
ALTER FUNCTION public.onto_comment_validate_target(uuid,text,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_onto_asset_link_project_match() SET search_path = public, pg_temp;

-- The physical object stays put when its logical owner changes. Deliberately no
-- second project FK: it would make existing PostgREST project embeds ambiguous.
ALTER TABLE public.onto_assets ADD COLUMN storage_project_id uuid;
UPDATE public.onto_assets SET storage_project_id = project_id;
ALTER TABLE public.onto_assets ALTER COLUMN storage_project_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_onto_asset_storage_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.storage_project_id := coalesce(NEW.storage_project_id, NEW.project_id);
    IF NEW.storage_project_id <> NEW.project_id THEN
      RAISE EXCEPTION 'asset_storage_owner_mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.storage_project_id IS DISTINCT FROM OLD.storage_project_id
    OR (NEW.project_id IS DISTINCT FROM OLD.project_id AND
      NOT coalesce(nullif(current_setting('buildos.organize_assets', true),''), '[]')::jsonb ? OLD.id::text) THEN
    RAISE EXCEPTION 'onto_assets storage location is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.storage_bucket IS DISTINCT FROM 'onto-assets' OR NEW.storage_path IS NULL
    OR left(NEW.storage_path, length('projects/' || NEW.storage_project_id || '/assets/' || NEW.id || '/'))
       <> 'projects/' || NEW.storage_project_id || '/assets/' || NEW.id || '/'
    OR position('..' IN NEW.storage_path) > 0 THEN
    RAISE EXCEPTION 'invalid_asset_storage_path' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Read/delete authorization follows the asset row, never the former owner in
-- its path. Uploads require a pre-created asset row (the upload API already does this).
-- Keep schema-only environments without managed storage compatible as well.
DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS onto_assets_storage_read ON storage.objects;
    DROP POLICY IF EXISTS onto_assets_storage_delete ON storage.objects;
    DROP POLICY IF EXISTS onto_assets_storage_upload ON storage.objects;
    CREATE POLICY onto_assets_storage_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'onto-assets' AND EXISTS (SELECT 1 FROM public.onto_assets a
        WHERE a.storage_bucket = bucket_id AND a.storage_path = name AND a.deleted_at IS NULL
          AND public.current_actor_has_project_member_access(a.project_id, 'read')));
    CREATE POLICY onto_assets_storage_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'onto-assets' AND EXISTS (SELECT 1 FROM public.onto_assets a
        WHERE a.storage_bucket = bucket_id AND a.storage_path = name
          AND public.current_actor_has_project_member_access(a.project_id, 'write')));
    CREATE POLICY onto_assets_storage_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'onto-assets' AND EXISTS (SELECT 1 FROM public.onto_assets a
        WHERE a.storage_bucket = bucket_id AND a.storage_path = name AND a.deleted_at IS NULL
          AND a.project_id = a.storage_project_id
          AND public.current_actor_has_project_member_access(a.project_id, 'write')));
  END IF;
END $$;
CREATE INDEX onto_assets_storage_location_idx ON public.onto_assets(storage_bucket, storage_path);

CREATE TABLE public.onto_organize_batches (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_ids uuid[] NOT NULL,
  inverse_of uuid REFERENCES public.onto_organize_batches(id),
  request_hash text NOT NULL,
  plan jsonb NOT NULL,
  manifest jsonb NOT NULL,
  effects jsonb NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX onto_organize_one_inverse_idx ON public.onto_organize_batches(inverse_of)
  WHERE inverse_of IS NOT NULL;
CREATE INDEX onto_organize_user_history_idx ON public.onto_organize_batches(user_id, created_at DESC);
ALTER TABLE public.onto_organize_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onto_organize_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.onto_organize_batches TO service_role;

-- Canonical trees contain only identity and ordered children. Display metadata
-- is rebuilt in TS; SQL independently replays every step against current rows.
CREATE FUNCTION private.organize_tree(p_nodes jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n jsonb; result jsonb := '[]';
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(coalesce(p_nodes, '[]')) LOOP
    result := result || jsonb_build_array(jsonb_build_object('id', (n->>'id')::uuid,
      'children', private.organize_tree(n->'children')));
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION private.organize_nodes(p_nodes jsonb)
RETURNS TABLE(id uuid, parent_id uuid, sibling_index integer, node jsonb)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH RECURSIVE tree AS (
    SELECT (n.value->>'id')::uuid id, NULL::uuid parent_id, (n.ordinality-1)::int sibling_index, n.value node
    FROM jsonb_array_elements(p_nodes) WITH ORDINALITY n
    UNION ALL
    SELECT (n.value->>'id')::uuid, t.id, (n.ordinality-1)::int, n.value
    FROM tree t CROSS JOIN LATERAL jsonb_array_elements(t.node->'children') WITH ORDINALITY n
  ) SELECT * FROM tree;
$$;
CREATE FUNCTION private.organize_prune(p_nodes jsonb, p_live uuid[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n jsonb; kids jsonb; result jsonb := '[]';
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(coalesce(p_nodes, '[]')) LOOP
    kids := private.organize_prune(n->'children', p_live);
    IF (n->>'id')::uuid = ANY(p_live) THEN
      result := result || jsonb_build_array(jsonb_build_object('id', (n->>'id')::uuid, 'children', kids));
    ELSE result := result || kids;
    END IF;
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION private.organize_remove(p_nodes jsonb, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n jsonb; result jsonb := '[]';
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    IF (n->>'id')::uuid <> p_id THEN
      result := result || jsonb_build_array(jsonb_set(n, '{children}', private.organize_remove(n->'children', p_id)));
    END IF;
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION private.organize_insert(p_nodes jsonb, p_node jsonb, p_parent uuid, p_position int) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n jsonb; result jsonb := '[]'; i integer := 0;
BEGIN
  IF p_parent IS NULL AND (p_position < 0 OR p_position > jsonb_array_length(p_nodes)) THEN
    RAISE EXCEPTION 'organize_invalid_position' USING ERRCODE = '22023';
  END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    IF p_parent IS NULL AND i = p_position THEN result := result || jsonb_build_array(p_node); END IF;
    IF (n->>'id')::uuid = p_parent THEN
      n := jsonb_set(n, '{children}', private.organize_insert(n->'children', p_node, NULL, p_position));
    ELSIF p_parent IS NOT NULL THEN
      n := jsonb_set(n, '{children}', private.organize_insert(n->'children', p_node, p_parent, p_position));
    END IF;
    result := result || jsonb_build_array(n); i := i + 1;
  END LOOP;
  IF p_parent IS NULL AND i = p_position THEN result := result || jsonb_build_array(p_node); END IF;
  RETURN result;
END $$;

CREATE FUNCTION private.organize_authorize(p_user uuid, p_projects uuid[], p_allow_archived_source uuid DEFAULT NULL) RETURNS uuid
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
  IF public.onto_lock_projects_for_write(p_projects) <> cardinality(p_projects) THEN
    RAISE EXCEPTION 'organize_project_missing' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.onto_projects WHERE id = ANY(p_projects) AND archived_at IS NOT NULL AND id IS DISTINCT FROM p_allow_archived_source) THEN
    RAISE EXCEPTION 'organize_project_archived' USING ERRCODE = 'P0001';
  END IF;
  FOREACH pid IN ARRAY p_projects LOOP
    IF NOT public.actor_has_project_member_access(actor,pid,'write') THEN RAISE EXCEPTION 'organize_access_denied' USING ERRCODE='42501'; END IF;
  END LOOP;
  RETURN actor;
END $$;

CREATE FUNCTION private.organize_compile(p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE p jsonb; m jsonb; pid uuid; src uuid; dst uuid; eid uuid; parent uuid; pos int;
  trees jsonb := '{}'; owners jsonb := '{}'; original jsonb; touched jsonb := '{}';
  live uuid[]; ids uuid[]; root jsonb; sr jsonb; dr jsonb; loc record; kid uuid;
  steps jsonb := '[]'; refs jsonb; before_loc jsonb; after_loc jsonb; row_key text;
BEGIN
  IF jsonb_typeof(p_plan->'moves') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'moves') NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'organize_invalid_plan' USING ERRCODE = '22023';
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(p_plan->'projects') LOOP
    pid := (p->>'id')::uuid;
    IF trees ? pid::text THEN RAISE EXCEPTION 'organize_duplicate_project'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id=pid AND updated_at=(p->>'updated_at')::timestamptz) THEN
      RAISE EXCEPTION 'organize_stale_preview' USING ERRCODE = 'P0001';
    END IF;
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO live FROM public.onto_documents
      WHERE project_id=pid AND deleted_at IS NULL AND state_key <> 'archived';
    SELECT private.organize_prune(doc_structure->'root', live) INTO root FROM public.onto_projects WHERE id=pid;
    IF (SELECT count(*) <> count(DISTINCT id) FROM private.organize_nodes(root)) THEN
      RAISE EXCEPTION 'organize_duplicate_document';
    END IF;
    FOREACH eid IN ARRAY live LOOP
      IF NOT EXISTS (SELECT 1 FROM private.organize_nodes(root) WHERE id=eid) THEN
        root := root || jsonb_build_array(jsonb_build_object('id', eid, 'children', '[]'::jsonb));
      END IF;
      owners := owners || jsonb_build_object('document:'||eid, pid);
    END LOOP;
    FOR eid IN SELECT id FROM public.onto_tasks WHERE project_id=pid AND deleted_at IS NULL AND archived_at IS NULL LOOP
      owners := owners || jsonb_build_object('task:'||eid, pid);
    END LOOP;
    trees := trees || jsonb_build_object(pid::text, root);
  END LOOP;
  original := owners;
  FOR m IN SELECT value FROM jsonb_array_elements(p_plan->'moves') LOOP
    src := (m->>'project_id')::uuid; dst := (m->>'destination_project_id')::uuid;
    eid := (m->>'id')::uuid; parent := (m->>'parent_id')::uuid; pos := (m->>'position')::int;
    IF NOT trees ? src::text OR NOT trees ? dst::text OR pos IS NULL OR pos < 0
      OR m->>'kind' NOT IN ('task','document') OR eid IS NULL
      OR owners->>(m->>'kind'||':'||eid) IS DISTINCT FROM src::text THEN
      RAISE EXCEPTION 'organize_invalid_move' USING ERRCODE = '22023';
    END IF;
    before_loc := jsonb_build_object('project_id',src,'parent_id',NULL,'position',0);
    after_loc := jsonb_build_object('project_id',dst,'parent_id',NULL,'position',0);
    IF m->>'kind' = 'task' THEN
      IF src=dst OR parent IS NOT NULL OR pos<>0 THEN RAISE EXCEPTION 'organize_invalid_task_move'; END IF;
      ids := ARRAY[eid];
    ELSE
      sr := trees->src::text; dr := trees->dst::text;
      SELECT * INTO loc FROM private.organize_nodes(sr) WHERE id=eid;
      IF NOT FOUND THEN RAISE EXCEPTION 'organize_document_missing'; END IF;
      root := loc.node;
      SELECT array_agg(id ORDER BY id) INTO ids FROM private.organize_nodes(jsonb_build_array(root));
      IF EXISTS (SELECT 1 FROM public.onto_documents d WHERE d.id=ANY(ids)
          AND (d.type_key IN ('document.context.project','document.context.thinking_log')
            OR EXISTS (SELECT 1 FROM public.onto_projects WHERE shared_folder_document_id=d.id))) THEN
        RAISE EXCEPTION 'organize_protected_document' USING ERRCODE = '22023';
      END IF;
      IF parent = ANY(ids) OR (parent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM private.organize_nodes(dr) WHERE id=parent)) THEN
        RAISE EXCEPTION 'organize_invalid_parent' USING ERRCODE = '22023';
      END IF;
      before_loc := jsonb_build_object('project_id',src,'parent_id',loc.parent_id,'position',loc.sibling_index);
      IF src=dst AND parent IS NOT DISTINCT FROM loc.parent_id AND pos>loc.sibling_index THEN pos:=pos-1; END IF;
      IF src=dst AND parent IS NOT DISTINCT FROM loc.parent_id AND pos=loc.sibling_index THEN RAISE EXCEPTION 'organize_no_change'; END IF;
      sr := private.organize_remove(sr, eid);
      IF src=dst THEN dr:=sr; END IF;
      dr := private.organize_insert(dr,root,parent,pos);
      trees := trees || jsonb_build_object(src::text,sr) || jsonb_build_object(dst::text,dr);
      after_loc := jsonb_build_object('project_id',dst,'parent_id',parent,'position',pos);
    END IF;
    FOREACH kid IN ARRAY ids LOOP
      row_key:=m->>'kind'||':'||kid;
      owners:=owners||jsonb_build_object(row_key,dst);
      touched:=touched||jsonb_build_object(row_key,true);
    END LOOP;
    steps:=steps||jsonb_build_array(jsonb_build_object('kind',m->>'kind','id',eid,
      'before',before_loc,'after',after_loc,'subtree',CASE WHEN m->>'kind'='document' THEN root ELSE NULL END));
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(touched)) > 200 THEN RAISE EXCEPTION 'organize_too_many_entities'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(p_plan->'trees') LOOP
    IF private.organize_tree(p->'root') IS DISTINCT FROM trees->(p->>'project_id') THEN
      RAISE EXCEPTION 'organize_tree_mismatch' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'project_id') FROM jsonb_array_elements(p_plan->'trees'))
     <> (SELECT count(*) FROM jsonb_object_keys(trees)) THEN RAISE EXCEPTION 'organize_tree_mismatch'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',split_part(k,':',1),'id',split_part(k,':',2),
    'source',original->>k,'destination',owners->>k) ORDER BY k),'[]') INTO refs
    FROM jsonb_object_keys(touched) k WHERE original->>k IS DISTINCT FROM owners->>k;
  RETURN jsonb_build_object('refs',refs,'steps',steps,'trees',trees);
END $$;

-- Stable initial-state digest, including dependents without updated_at columns.
-- Conservative invalidation is intentional: no stale impact can be confirmed.
-- Omit bulky vectors/raw text; their hashes/updated_at remain in the digest.
CREATE FUNCTION private.organize_fingerprint(p_projects uuid[]) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE tbl text; parts text := ''; digest text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['onto_projects','onto_documents','onto_tasks','onto_edges',
    'onto_comments','onto_comment_read_states','onto_embeddings','onto_assets','onto_asset_links',
    'onto_public_pages','onto_public_page_review_attempts','onto_document_proposals','onto_task_assignees','onto_events','onto_project_members'] LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-ARRAY[''search_vector'',''content'',''embedding'',''content_text'',''extracted_text'',''published_content''])::text), '''' ORDER BY id), '''')) FROM public.%I t WHERE %I = ANY($1)',
      tbl, CASE WHEN tbl='onto_projects' THEN 'id' ELSE 'project_id' END) INTO digest USING p_projects;
    parts:=parts||tbl||digest;
  END LOOP;
  RETURN md5(parts);
END $$;

CREATE FUNCTION private.organize_has(p_refs jsonb, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_refs @> jsonb_build_array(jsonb_build_object('kind',p_kind,'id',p_id));
$$;
CREATE FUNCTION private.organize_impact(p_source uuid, p_dest uuid, p_refs jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE docs uuid[]; tasks uuid[]; assets uuid[]; blockers jsonb := '[]'; edges jsonb;
  assignees jsonb; proposals jsonb; links jsonb; events jsonb; result jsonb;
  tasks_to_reconcile integer;
BEGIN
  SELECT coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='document'),'{}'),
         coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='task'),'{}')
    INTO docs,tasks FROM jsonb_array_elements(p_refs) r;
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
    WHERE project_id=p_source AND private.organize_has(p_refs,entity_kind,entity_id);
  IF EXISTS (SELECT 1 FROM public.onto_asset_links WHERE asset_id=ANY(assets)
      AND NOT private.organize_has(p_refs,entity_kind,entity_id)) THEN
    blockers:=blockers||jsonb_build_array('shared_asset_requires_joint_move');
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') INTO edges FROM public.onto_edges e
    WHERE e.project_id=p_source AND
      (private.organize_has(p_refs,e.src_kind,e.src_id) <> private.organize_has(p_refs,e.dst_kind,e.dst_id));
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO assignees FROM public.onto_task_assignees a
    WHERE a.task_id=ANY(tasks) AND NOT EXISTS (SELECT 1 FROM public.onto_projects p WHERE p.id=p_dest AND p.created_by=a.assignee_actor_id)
    AND NOT EXISTS (SELECT 1 FROM public.onto_project_members m WHERE m.project_id=p_dest AND m.actor_id=a.assignee_actor_id AND m.removed_at IS NULL);
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') INTO proposals FROM public.onto_document_proposals p
    WHERE p.document_id=ANY(docs) AND p.status<>'pending';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'props',jsonb_strip_nulls(jsonb_build_object(
    'goal_id',props->'goal_id','supporting_milestone_id',props->'supporting_milestone_id','plan_id',props->'plan_id'))) ORDER BY id),'[]')
    INTO links FROM public.onto_tasks WHERE id=ANY(tasks);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'project_id',project_id,'task_id',CASE WHEN owner_entity_type='task' THEN owner_entity_id::text ELSE props->>'task_id' END) ORDER BY id),'[]') INTO events
    FROM public.onto_events WHERE project_id=p_source AND deleted_at IS NULL
      AND ((owner_entity_type='task' AND owner_entity_id=ANY(tasks)) OR props->>'task_id'=ANY(SELECT t::text FROM unnest(tasks) t));
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
    'comments_to_move',(SELECT count(*) FROM public.onto_comments WHERE private.organize_has(p_refs,entity_type,entity_id)),
    'public_pages_to_move',(SELECT count(*) FROM public.onto_public_pages WHERE document_id=ANY(docs)),
    'embeddings_to_move',(SELECT count(*) FROM public.onto_embeddings WHERE private.organize_has(p_refs,entity_type,entity_id)),
    'relationships_to_move',(SELECT count(*) FROM public.onto_edges WHERE project_id=p_source
      AND private.organize_has(p_refs,src_kind,src_id) AND private.organize_has(p_refs,dst_kind,dst_id)));
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.onto_comments_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE moving boolean := NEW.project_id IS DISTINCT FROM OLD.project_id;
BEGIN
  IF moving AND NOT (
    (coalesce(nullif(current_setting('buildos.organize_refs', true),''),'[]')::jsonb
      @> jsonb_build_array(jsonb_build_object('kind',OLD.entity_type,'id',OLD.entity_id)))
    AND public.onto_comment_validate_target(NEW.project_id,NEW.entity_type,NEW.entity_id)
  ) THEN RAISE EXCEPTION 'Immutable comment fields cannot be changed'; END IF;
  IF NEW.entity_type<>OLD.entity_type OR NEW.entity_id<>OLD.entity_id
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.root_id<>OLD.root_id
    OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.body_format<>OLD.body_format THEN
    RAISE EXCEPTION 'Immutable comment fields cannot be changed';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN NEW.edited_at:=now(); END IF;
  IF NOT moving THEN NEW.updated_at:=now(); END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION private.onto_move_entity_set(p_source uuid,p_dest uuid,p_refs jsonb,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE impact jsonb; docs uuid[]; tasks uuid[]; assets uuid[]; t uuid; moved_ref jsonb; event_ids jsonb;
  previous_refs text:=current_setting('buildos.organize_refs',true);
  previous_assets text:=current_setting('buildos.organize_assets',true);
BEGIN
  PERFORM private.organize_authorize(p_user,ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_source,p_dest]) x ORDER BY x),p_source);
  IF p_source=p_dest THEN RAISE EXCEPTION 'organize_same_project'; END IF;
  SELECT coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='document'),'{}'),
         coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='task'),'{}')
    INTO docs,tasks FROM jsonb_array_elements(p_refs) r;
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
    AND private.organize_has(p_refs,src_kind,src_id) AND private.organize_has(p_refs,dst_kind,dst_id);
  UPDATE public.onto_task_assignees SET project_id=p_dest WHERE task_id=ANY(tasks);
  UPDATE public.onto_comments SET project_id=p_dest WHERE private.organize_has(p_refs,entity_type,entity_id);
  UPDATE public.onto_comment_read_states SET project_id=p_dest WHERE private.organize_has(p_refs,entity_type,entity_id);
  UPDATE public.onto_embeddings SET project_id=p_dest WHERE private.organize_has(p_refs,entity_type,entity_id)
    OR (entity_type='image' AND entity_id=ANY(assets));
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

-- Prevent later direct writes from re-introducing a dependent in its former
-- project. All affected writers participate in the project's serialization.
CREATE FUNCTION private.organize_dependent_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data jsonb; old_data jsonb; pid uuid; old_pid uuid; kind text; eid uuid; actual uuid;
BEGIN
  row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  old_data:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  pid:=(row_data->>'project_id')::uuid; old_pid:=(old_data->>'project_id')::uuid;
  PERFORM 1 FROM public.onto_projects WHERE id IN (pid,old_pid) ORDER BY id FOR UPDATE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  FOR kind,eid IN
    SELECT row_data->>'src_kind',(row_data->>'src_id')::uuid WHERE TG_TABLE_NAME='onto_edges'
    UNION ALL SELECT row_data->>'dst_kind',(row_data->>'dst_id')::uuid WHERE TG_TABLE_NAME='onto_edges'
    UNION ALL SELECT 'document',(row_data->>'document_id')::uuid WHERE TG_TABLE_NAME IN ('onto_public_pages','onto_public_page_review_attempts','onto_document_proposals')
    UNION ALL SELECT 'task',(row_data->>'task_id')::uuid WHERE TG_TABLE_NAME='onto_task_assignees'
    UNION ALL SELECT row_data->>'entity_type',(row_data->>'entity_id')::uuid WHERE TG_TABLE_NAME IN ('onto_comments','onto_comment_read_states','onto_embeddings')
    UNION ALL SELECT row_data->>'owner_entity_type',(row_data->>'owner_entity_id')::uuid WHERE TG_TABLE_NAME='onto_events' AND row_data->>'deleted_at' IS NULL
    UNION ALL SELECT row_data->>'entity_kind',(row_data->>'entity_id')::uuid WHERE TG_TABLE_NAME='onto_asset_links'
  LOOP
    actual:=NULL;
    IF kind='document' THEN SELECT project_id INTO actual FROM public.onto_documents WHERE id=eid;
    ELSIF kind='task' THEN SELECT project_id INTO actual FROM public.onto_tasks WHERE id=eid;
    ELSE CONTINUE; END IF;
    IF actual IS DISTINCT FROM pid THEN RAISE EXCEPTION 'organize_dependent_project_mismatch' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['onto_edges','onto_comments','onto_comment_read_states','onto_embeddings',
    'onto_assets','onto_asset_links','onto_public_pages','onto_public_page_review_attempts','onto_document_proposals','onto_task_assignees','onto_project_members','onto_events'] LOOP
    EXECUTE format('CREATE TRIGGER organize_lock_and_check BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.organize_dependent_guard()',tbl);
  END LOOP;
END $$;

CREATE FUNCTION private.organize_entity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND NOT private.organize_has(
    coalesce(nullif(current_setting('buildos.organize_refs',true),''),'[]')::jsonb,
    CASE TG_TABLE_NAME WHEN 'onto_documents' THEN 'document' ELSE 'task' END,OLD.id) THEN
    RAISE EXCEPTION 'organize_use_atomic_mover' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organize_entity_project_guard BEFORE UPDATE OF project_id ON public.onto_documents
  FOR EACH ROW EXECUTE FUNCTION private.organize_entity_guard();
CREATE TRIGGER organize_entity_project_guard BEFORE UPDATE OF project_id ON public.onto_tasks
  FOR EACH ROW EXECUTE FUNCTION private.organize_entity_guard();

CREATE FUNCTION private.organize_prepare(p_user uuid,p_plan jsonb,p_inverse uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE pids uuid[]; compiled jsonb; g record; impacts jsonb:='[]'; impact jsonb; token text;
BEGIN
  SELECT array_agg(DISTINCT (p->>'id')::uuid ORDER BY (p->>'id')::uuid) INTO pids
    FROM jsonb_array_elements(p_plan->'projects') p;
  PERFORM private.organize_authorize(p_user,pids);
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
  token:=md5(p_user::text||coalesce(p_inverse::text,'')||p_plan::text||private.organize_fingerprint(pids)||impacts::text);
  RETURN jsonb_build_object('token',token,'compiled',compiled,'impacts',impacts,'project_ids',to_jsonb(pids));
END $$;
CREATE FUNCTION private.organize_public_impact(p_impacts jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'source_project_id',i->'source_project_id','destination_project_id',i->'destination_project_id',
    'blockers',i->'blockers','items',jsonb_array_length(i->'refs'),
    'relationships_to_detach',jsonb_array_length(i->'detached_edges'),
    'assignees_to_remove',jsonb_array_length(i->'removed_assignees'),
    'finished_proposals_to_remove',jsonb_array_length(i->'finished_proposals'),
    'task_links_to_clear',(SELECT count(*) FROM jsonb_array_elements(i->'task_links') l CROSS JOIN LATERAL jsonb_object_keys(l->'props') k),
    'events_to_rebuild',jsonb_array_length(i->'removed_events'),'tasks_to_reconcile',i->'tasks_to_reconcile',
    'assets_to_move',jsonb_array_length(i->'asset_ids'),'comments_to_move',i->'comments_to_move',
    'public_pages_to_move',i->'public_pages_to_move','relationships_to_move',i->'relationships_to_move')),'[]')
  FROM jsonb_array_elements(p_impacts) i;
$$;
CREATE FUNCTION public.onto_organize_preview(p_user_id uuid,p_plan jsonb,p_inverse_of uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prepared jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organize_service_only' USING ERRCODE='42501'; END IF;
  prepared:=private.organize_prepare(p_user_id,p_plan,p_inverse_of);
  RETURN jsonb_build_object('confirmation_token',prepared->'token',
    'impact',private.organize_public_impact(prepared->'impacts'),
    'manifest',prepared->'compiled'->'steps');
END $$;

-- Restore only still-compatible relationships on undo. Never overwrite a newer
-- assignment, local link, proposal, or edge. Skips are included in the receipt.
CREATE FUNCTION private.organize_restore_target(p_refs jsonb,p_kind text,p_id uuid,p_project uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(p_refs) r WHERE r->>'kind'=p_kind AND r->>'id'=p_id::text AND r->>'destination'=p_project::text);
$$;
CREATE FUNCTION private.organize_restore_effects(p_effects jsonb,p_refs jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE i jsonb; r jsonb; pid uuid; n int; restored int:=0; skipped int:=0; k text; v jsonb;
BEGIN
  FOR i IN SELECT value FROM jsonb_array_elements(p_effects) LOOP
    pid:=(i->>'source_project_id')::uuid;
    FOR r IN SELECT value FROM jsonb_array_elements(i->'detached_edges') LOOP
      IF (private.organize_restore_target(p_refs,r->>'src_kind',(r->>'src_id')::uuid,pid)
        OR private.organize_restore_target(p_refs,r->>'dst_kind',(r->>'dst_id')::uuid,pid))
        AND public.onto_relationship_entity_in_project(pid,r->>'src_kind',(r->>'src_id')::uuid)
        AND public.onto_relationship_entity_in_project(pid,r->>'dst_kind',(r->>'dst_id')::uuid)
        AND r->>'rel'<>'has_event' AND NOT EXISTS(SELECT 1 FROM public.onto_edges e
          WHERE e.project_id=pid AND e.src_kind=r->>'src_kind' AND e.src_id=(r->>'src_id')::uuid
            AND e.dst_kind=r->>'dst_kind' AND e.dst_id=(r->>'dst_id')::uuid AND e.rel=r->>'rel') THEN
        INSERT INTO public.onto_edges SELECT (jsonb_populate_record(NULL::public.onto_edges,r)).* ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS n=ROW_COUNT; restored:=restored+n; skipped:=skipped+1-n;
      ELSE skipped:=skipped+1; END IF;
    END LOOP;
    FOR r IN SELECT value FROM jsonb_array_elements(i->'removed_assignees') LOOP
      IF private.organize_restore_target(p_refs,'task',(r->>'task_id')::uuid,pid) AND EXISTS (SELECT 1 FROM public.onto_tasks WHERE id=(r->>'task_id')::uuid AND project_id=pid AND deleted_at IS NULL)
        AND public.actor_has_project_member_access((r->>'assignee_actor_id')::uuid,pid,'read') THEN
        INSERT INTO public.onto_task_assignees SELECT (jsonb_populate_record(NULL::public.onto_task_assignees,r)).* ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS n=ROW_COUNT; restored:=restored+n; skipped:=skipped+1-n;
      ELSE skipped:=skipped+1; END IF;
    END LOOP;
    FOR r IN SELECT value FROM jsonb_array_elements(i->'task_links') LOOP
      FOR k,v IN SELECT key,value FROM jsonb_each(r->'props') LOOP
        IF private.organize_restore_target(p_refs,'task',(r->>'id')::uuid,pid) AND v IS NOT NULL AND jsonb_typeof(v)='string' AND (v#>>'{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' AND public.onto_relationship_entity_in_project(pid,
          CASE k WHEN 'goal_id' THEN 'goal' WHEN 'supporting_milestone_id' THEN 'milestone' ELSE 'plan' END,CASE WHEN (v#>>'{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (v#>>'{}')::uuid ELSE NULL END) THEN
          UPDATE public.onto_tasks SET props=props||jsonb_build_object(k,v)
            WHERE id=(r->>'id')::uuid AND project_id=pid AND deleted_at IS NULL AND NOT props ? k;
          GET DIAGNOSTICS n=ROW_COUNT; restored:=restored+n; skipped:=skipped+1-n;
        ELSE skipped:=skipped+1; END IF;
      END LOOP;
    END LOOP;
    FOR r IN SELECT value FROM jsonb_array_elements(i->'finished_proposals') LOOP
      IF private.organize_restore_target(p_refs,'document',(r->>'document_id')::uuid,pid) AND EXISTS (SELECT 1 FROM public.onto_documents WHERE id=(r->>'document_id')::uuid AND project_id=pid AND deleted_at IS NULL) THEN
        INSERT INTO public.onto_document_proposals SELECT (jsonb_populate_record(NULL::public.onto_document_proposals,r)).* ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS n=ROW_COUNT; restored:=restored+n; skipped:=skipped+1-n;
      ELSE skipped:=skipped+1; END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('restored',restored,'skipped',skipped);
END $$;
CREATE FUNCTION public.onto_organize_apply_atomic(p_user_id uuid,p_plan jsonb,p_confirmation_token text,p_batch_id uuid,p_inverse_of uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prepared jsonb; existing public.onto_organize_batches; pids uuid[]; g record; p jsonb;
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
  prepared:=private.organize_prepare(p_user_id,p_plan,p_inverse_of);
  IF prepared->>'token' IS DISTINCT FROM p_confirmation_token THEN
    RAISE EXCEPTION 'organize_stale_preview' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(prepared->'impacts') i WHERE jsonb_array_length(i->'blockers')>0) THEN
    RAISE EXCEPTION 'organize_blocked';
  END IF;
  SELECT array_agg(value::uuid) INTO pids FROM jsonb_array_elements_text(prepared->'project_ids');
  FOR g IN SELECT (r->>'source')::uuid src,(r->>'destination')::uuid dst,jsonb_agg(r ORDER BY r->>'id') refs
    FROM jsonb_array_elements(prepared->'compiled'->'refs') r GROUP BY r->>'source',r->>'destination' ORDER BY r->>'source',r->>'destination' LOOP
    effects:=effects||jsonb_build_array(private.onto_move_entity_set(g.src,g.dst,g.refs,p_user_id));
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(p_plan->'trees') LOOP
    -- Only trees affected by document moves get rewritten. Task-only batches
    -- cannot incidentally normalize a project's unlinked/stale document nodes.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'moves') m WHERE m->>'kind'='document'
      AND (m->>'project_id'=p->>'project_id' OR m->>'destination_project_id'=p->>'project_id')) THEN
      UPDATE public.onto_projects SET doc_structure=jsonb_build_object('version',coalesce((doc_structure->>'version')::int,0)+1,
        'root',p->'root'),updated_at=clock_timestamp() WHERE id=(p->>'project_id')::uuid;
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

-- Keep the existing web/chat task API contract while using the same mover.
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
  token:=md5(p_task_id::text||p_destination_project_id::text||private.organize_fingerprint(ARRAY[p_expected_source_project_id,p_destination_project_id]));
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

CREATE FUNCTION public.get_document_route_location(p_document_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('project_id',d.project_id,'document_id',d.id)
  FROM public.onto_documents d JOIN public.onto_projects p ON p.id=d.project_id
  WHERE d.id=p_document_id AND d.deleted_at IS NULL AND d.state_key<>'archived'
    AND p.deleted_at IS NULL AND p.archived_at IS NULL AND auth.uid() IS NOT NULL
    AND public.current_actor_has_project_member_access(d.project_id,'read');
$$;
REVOKE ALL ON FUNCTION public.get_document_route_location(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_document_route_location(uuid) TO authenticated,service_role;

-- Calendar jobs for the same task serialize across retries and repeated moves.
CREATE TABLE private.organize_calendar_leases(task_id uuid PRIMARY KEY REFERENCES public.onto_tasks(id) ON DELETE CASCADE, token uuid NOT NULL, expires_at timestamptz NOT NULL);
ALTER TABLE private.organize_calendar_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.organize_calendar_leases FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.organize_calendar_leases TO service_role;
CREATE FUNCTION public.claim_organize_calendar_sync(p_task_id uuid,p_token uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE n int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organize_service_only'; END IF;
  INSERT INTO private.organize_calendar_leases VALUES(p_task_id,p_token,clock_timestamp()+interval '15 minutes')
    ON CONFLICT(task_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
    WHERE organize_calendar_leases.expires_at<clock_timestamp();
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END $$;
CREATE FUNCTION public.release_organize_calendar_sync(p_task_id uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'organize_service_only'; END IF;
  DELETE FROM private.organize_calendar_leases WHERE task_id=p_task_id AND token=p_token;
END $$;

-- A moved file may still carry its uploader as storage.owner_id. Account
-- deletion must respect its current logical project rather than delete it there.
CREATE OR REPLACE FUNCTION "public"."list_account_deletion_storage_objects"("p_user_id" "uuid", "p_libri_library_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS TABLE("bucket_id" "text", "object_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	WITH owned_projects AS (
		SELECT unnest(public.account_deletion_purged_project_ids(p_user_id)) AS id
	),
	known_objects AS (
		SELECT note.storage_bucket AS bucket_id, note.storage_path AS object_name
		FROM public.voice_notes AS note
		WHERE note.user_id = p_user_id

		UNION

		SELECT 'brief-audio'::text, brief.audio_storage_path
		FROM public.ontology_daily_briefs AS brief
		WHERE brief.user_id = p_user_id
			AND brief.audio_storage_path IS NOT NULL

		UNION

		SELECT asset.storage_bucket, asset.storage_path
		FROM public.onto_assets AS asset
		WHERE asset.project_id IN (SELECT id FROM owned_projects)

		UNION

		SELECT attachment.storage_bucket, attachment.storage_path
		FROM public.email_attachments AS attachment
		WHERE attachment.created_by::text = p_user_id::text
	)
	SELECT DISTINCT candidate.bucket_id, candidate.object_name
	FROM (
		SELECT known.bucket_id, known.object_name
		FROM known_objects AS known

		UNION

		-- The user-id prefix covers every bucket keyed that way, including the
		-- data-export zips in user-exports ({user_id}/<export-id>.zip).
		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		WHERE object.owner_id::text = p_user_id::text
			OR object.name LIKE p_user_id::text || '/%'
			OR object.name LIKE 'users/' || p_user_id::text || '/%'

		UNION

		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		JOIN unnest(COALESCE(p_libri_library_ids, '{}'::uuid[])) AS library(id)
			ON object.name LIKE library.id::text || '/%'
		WHERE object.bucket_id = 'libri-assets'
	) AS candidate
	WHERE candidate.bucket_id IS NOT NULL
		AND candidate.object_name IS NOT NULL
		AND candidate.object_name <> ''
		AND NOT EXISTS (SELECT 1 FROM public.onto_assets asset
			WHERE asset.storage_bucket=candidate.bucket_id AND asset.storage_path=candidate.object_name
			AND asset.project_id NOT IN (SELECT id FROM owned_projects));
$$;


-- Explicit grants: no new batch or private helper is callable by a browser.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND (p.proname LIKE 'organize_%' OR p.proname='onto_move_entity_set'))
      OR (n.nspname='public' AND p.proname IN ('onto_organize_preview','onto_organize_apply_atomic','claim_organize_calendar_sync','release_organize_calendar_sync')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
COMMIT;
