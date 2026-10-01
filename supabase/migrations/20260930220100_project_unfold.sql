-- supabase/migrations/20260930220100_project_unfold.sql
--
-- Project hierarchy, phase 3 ("Combine"), database foundation, part 2 of 2:
-- unfold. Moves a fold's records back to the source, conservatively, from the
-- manifest written by 20260930220000_project_fold_foundation.sql.
--
-- What comes back: every record the fold moved that is still in the
-- destination and unchanged since the fold (fingerprints exclude machine
-- columns: caches, sync status, counters), together with everything that
-- follows it (comments, read states, embeddings, attachments, public pages,
-- assignees, links). Items come back with everything they are linked to: if any
-- item in a linked group was edited, moved, deleted, gained a pending proposal,
-- or was linked to destination work after the fold, the whole group stays in
-- the destination and is listed. Nothing is cut and no newer work is
-- overwritten. Members the fold added stay (listed); connector grants were
-- never copied.
--
-- public.onto_project_unfold_preview / public.onto_project_unfold_apply are
-- service only, re-check admin on both projects for the given user, lock both
-- projects in UUID order then documents and tasks, recompute the token under
-- the locks, and are idempotent by fold id (one unfold per fold).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- What a link end means for the linked-group rule: a node now in the
-- destination (its id), "stays in the destination" (the zero uuid: a project
-- end the fold did not repoint, or a live non-task event), the task a live task
-- event belongs to (the event is rebuilt with its task), or nothing (ends that
-- are not destination nodes: legacy kinds, deleted events, stale ids).
CREATE FUNCTION private.project_unfold_edge_end(p_dest_nodes jsonb, p_dest uuid, p_project_edges jsonb, p_edge uuid, p_kind text, p_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
	SELECT CASE
		WHEN p_dest_nodes ? p_id::text THEN p_id
		WHEN p_kind = 'project' AND p_id = p_dest AND NOT (coalesce(p_project_edges, '[]'::jsonb) ? p_edge::text)
			THEN '00000000-0000-0000-0000-000000000000'::uuid
		WHEN p_kind = 'event' THEN (SELECT CASE
				WHEN ev.deleted_at IS NOT NULL THEN NULL
				WHEN ev.owner_entity_type = 'task' AND p_dest_nodes ? ev.owner_entity_id::text THEN ev.owner_entity_id
				ELSE '00000000-0000-0000-0000-000000000000'::uuid END
			FROM public.onto_events ev WHERE ev.id = p_id)
		ELSE NULL
	END;
$$;

-- ---------------------------------------------------------------------------
-- Plan: who comes back, who stays and why, and the trees.

CREATE FUNCTION private.project_unfold_prepare(p_user uuid, p_fold_id uuid, p_lock boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	m public.onto_project_fold_manifests;
	v_actor uuid;
	v_source uuid;
	v_dest uuid;
	src public.onto_projects;
	dst public.onto_projects;
	v_rollout record;
	tbl text;
	fps jsonb;
	status jsonb;
	cand jsonb := '{}';        -- {id: table} unchanged and still in the destination
	reasons jsonb := '{}';     -- {id: {table, reason}} for everything that stays
	dest_nodes jsonb;          -- {id: kind} of every node now in the destination
	ret jsonb;                 -- {id: table} after the linked-group rule
	pair_a uuid[] := '{}';
	pair_b uuid[] := '{}';
	pinned uuid[];
	ret_docs uuid[];
	ret_tasks uuid[];
	ret_assets uuid[];
	v_live_docs uuid[];
	v_source_tree jsonb;
	v_dest_root jsonb;
	v_dest_tree jsonb;
	v_folder uuid;
	v_folder_removed boolean := false;
	v_keep uuid[];
	blockers text[] := '{}';
	counts jsonb := '{}';
	staying jsonb;
	repoint_back jsonb := '{}';
	v_dated integer;
	v_parent uuid;
	v_parent_ok boolean := false;
	impact jsonb;
BEGIN
	IF p_user IS NULL OR p_fold_id IS NULL THEN
		RAISE EXCEPTION 'project_fold_invalid_arguments' USING ERRCODE = '22023';
	END IF;
	SELECT * INTO m FROM public.onto_project_fold_manifests WHERE id = p_fold_id;
	IF NOT FOUND THEN RAISE EXCEPTION 'project_unfold_not_found' USING ERRCODE = 'P0002'; END IF;
	IF m.unfolded_at IS NOT NULL THEN RAISE EXCEPTION 'project_unfold_already_done' USING ERRCODE = 'P0001'; END IF;
	v_source := m.source_project_id;
	v_dest := m.destination_project_id;
	v_actor := private.project_fold_authorize(p_user, v_source, v_dest, p_lock, true);
	IF p_lock THEN
		PERFORM 1 FROM public.onto_documents WHERE project_id = v_dest
			AND id = ANY(ARRAY(SELECT jsonb_object_keys(m.manifest->'nodes'->'onto_documents'))::uuid[]) ORDER BY id FOR UPDATE;
		PERFORM 1 FROM public.onto_tasks WHERE project_id = v_dest
			AND id = ANY(ARRAY(SELECT jsonb_object_keys(m.manifest->'nodes'->'onto_tasks'))::uuid[]) ORDER BY id FOR UPDATE;
	END IF;
	SELECT * INTO src FROM public.onto_projects WHERE id = v_source;
	SELECT * INTO dst FROM public.onto_projects WHERE id = v_dest;
	SELECT coalesce(bool_or(calendar_sync_ready), false) AS calendar, coalesce(bool_or(asset_access_ready), false) AS assets
		INTO v_rollout FROM private.organize_rollout WHERE singleton;

	-- 1. Each recorded node: still here and unchanged?
	FOR tbl, fps IN SELECT key, value FROM jsonb_each(m.manifest->'nodes') LOOP
		EXECUTE format($q$
			SELECT coalesce(jsonb_object_agg(k.id, CASE
				WHEN t.id IS NULL THEN 'deleted'
				WHEN t.project_id <> $1 THEN 'moved_since_fold'
				WHEN c.value IS DISTINCT FROM ($2->>k.id) THEN 'edited_since_fold'
				ELSE 'ok' END), '{}'::jsonb)
			FROM jsonb_object_keys($2) AS k(id)
			LEFT JOIN public.%I t ON t.id = k.id::uuid
			LEFT JOIN jsonb_each_text(private.project_fold_fps(%L, ARRAY(SELECT jsonb_object_keys($2))::uuid[])) c ON c.key = k.id
		$q$, tbl, tbl) INTO status USING v_dest, fps;
		SELECT cand || coalesce(jsonb_object_agg(s.key, tbl) FILTER (WHERE s.value = 'ok'), '{}'::jsonb),
			reasons || coalesce(jsonb_object_agg(s.key, jsonb_build_object('table', tbl, 'reason', s.value)) FILTER (WHERE s.value <> 'ok'), '{}'::jsonb)
		INTO cand, reasons FROM jsonb_each_text(status) s;
	END LOOP;

	-- Per-item conditions that keep an unchanged item where it is.
	SELECT reasons || coalesce(jsonb_object_agg(x.id, jsonb_build_object('table', cand->>x.id::text, 'reason', x.reason)), '{}'::jsonb),
		cand - coalesce(array_agg(x.id::text), '{}')
	INTO reasons, cand
	FROM (
		SELECT DISTINCT ON (y.id) y.id, y.reason FROM (
			SELECT p.document_id AS id, 'pending_document_proposal' AS reason FROM public.onto_document_proposals p
			WHERE p.status = 'pending' AND cand ? p.document_id::text
			UNION ALL
			SELECT a.task_id, 'assignee_cannot_open_source' FROM public.onto_task_assignees a
			WHERE cand ? a.task_id::text AND NOT public.actor_has_project_member_access(a.assignee_actor_id, v_source, 'read')
			UNION ALL
			SELECT c.entity_id, 'comment_by_someone_outside_source' FROM public.onto_comments c
			WHERE c.project_id = v_dest AND cand ? c.entity_id::text AND c.created_by IS NOT NULL
				AND NOT public.actor_has_project_member_access(c.created_by, v_source, 'read')
		) y ORDER BY y.id, y.reason
	) x;

	-- 2. Linked groups move together. Pairs of node ids that must share a
	--    project; the sentinel stands for "stays in the destination".
	dest_nodes := private.project_fold_node_ids(v_dest);
	SELECT pair_a || coalesce(array_agg(x.a), '{}'), pair_b || coalesce(array_agg(x.b), '{}') INTO pair_a, pair_b
	FROM (
		SELECT DISTINCT
			private.project_unfold_edge_end(dest_nodes, v_dest, m.manifest->'project_edges', e.id, e.src_kind, e.src_id) AS a,
			private.project_unfold_edge_end(dest_nodes, v_dest, m.manifest->'project_edges', e.id, e.dst_kind, e.dst_id) AS b
		FROM public.onto_edges e WHERE e.project_id = v_dest
	) x WHERE x.a IS NOT NULL AND x.b IS NOT NULL;
	-- Task links kept in props, and attachments.
	SELECT pair_a || coalesce(array_agg(t.id), '{}'), pair_b || coalesce(array_agg((t.props->>k)::uuid), '{}') INTO pair_a, pair_b
	FROM public.onto_tasks t CROSS JOIN unnest(ARRAY['goal_id', 'plan_id', 'supporting_milestone_id']) AS k
	WHERE t.project_id = v_dest
		AND (t.props->>k) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		AND dest_nodes ? (t.props->>k);
	SELECT pair_a || coalesce(array_agg(l.asset_id), '{}'), pair_b || coalesce(array_agg(l.entity_id), '{}') INTO pair_a, pair_b
	FROM public.onto_asset_links l WHERE l.project_id = v_dest AND dest_nodes ? l.entity_id::text;

	ret := cand;
	LOOP
		SELECT array_agg(DISTINCT x) INTO pinned FROM (
			SELECT p.a AS x FROM unnest(pair_a, pair_b) AS p(a, b) WHERE ret ? p.a::text AND NOT ret ? p.b::text
			UNION ALL
			SELECT p.b FROM unnest(pair_a, pair_b) AS p(a, b) WHERE ret ? p.b::text AND NOT ret ? p.a::text
		) z;
		EXIT WHEN pinned IS NULL;
		reasons := reasons || (SELECT jsonb_object_agg(x, jsonb_build_object('table', ret->>x::text, 'reason', 'linked_to_item_that_stays'))
			FROM unnest(pinned) x);
		ret := ret - pinned::text[];
	END LOOP;

	ret_docs := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = 'onto_documents' ORDER BY 1);
	ret_tasks := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = 'onto_tasks' ORDER BY 1);
	ret_assets := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = 'onto_assets' ORDER BY 1);

	-- 3. Trees. Source: its tree at fold time, holding what comes back (plus
	--    anything filed in the archived source since). Destination: returning
	--    documents leave; their staying children take their place; the
	--    "From <source>" folder goes when it is empty and unedited.
	v_live_docs := ARRAY(SELECT id FROM public.onto_documents WHERE id = ANY(ret_docs)
		AND deleted_at IS NULL AND archived_at IS NULL AND state_key::text <> 'archived');
	v_source_tree := private.project_fold_file_tree(m.source_state->'doc_structure_root', v_live_docs)
		|| private.project_fold_prune(CASE WHEN jsonb_typeof(src.doc_structure->'root') = 'array' THEN src.doc_structure->'root' ELSE '[]'::jsonb END,
			ARRAY(SELECT id FROM public.onto_documents WHERE project_id = v_source AND deleted_at IS NULL));
	v_dest_root := CASE WHEN jsonb_typeof(dst.doc_structure->'root') = 'array' THEN dst.doc_structure->'root' ELSE '[]'::jsonb END;
	v_folder := m.folder_document_id;
	v_keep := ARRAY(SELECT n.id FROM private.organize_nodes(v_dest_root) n WHERE NOT (n.id = ANY(ret_docs)));
	v_dest_tree := private.project_fold_prune(v_dest_root, v_keep);
	IF v_folder IS NOT NULL
		AND EXISTS (SELECT 1 FROM private.organize_nodes(v_dest_tree) n WHERE n.id = v_folder AND jsonb_array_length(coalesce(n.node->'children', '[]')) = 0)
		AND EXISTS (SELECT 1 FROM public.onto_documents d WHERE d.id = v_folder AND d.project_id = v_dest AND d.deleted_at IS NULL)
		AND private.project_fold_fps('onto_documents', ARRAY[v_folder])->>v_folder::text = m.manifest->'folder'->>'fp'
		AND NOT EXISTS (SELECT 1 FROM public.onto_comments c WHERE c.entity_id = v_folder)
		AND NOT EXISTS (SELECT 1 FROM public.onto_edges e WHERE e.src_id = v_folder OR e.dst_id = v_folder) THEN
		v_folder_removed := true;
		v_dest_tree := private.project_fold_prune(v_dest_tree, array_remove(v_keep, v_folder));
	END IF;

	-- 4. Repointed references come back when untouched since the fold.
	FOR tbl, fps IN SELECT key, value FROM jsonb_each(m.manifest->'repointed') LOOP
		EXECUTE format($q$
			SELECT coalesce(jsonb_agg(k.id ORDER BY k.id), '[]'::jsonb)
			FROM jsonb_object_keys($2) AS k(id)
			JOIN public.%I t ON t.id = k.id::uuid AND t.%I = $1
			JOIN jsonb_each_text(private.project_fold_fps(%L, ARRAY(SELECT jsonb_object_keys($2))::uuid[])) c ON c.key = k.id
			WHERE c.value = $2->>k.id
		$q$, tbl, CASE tbl WHEN 'chat_sessions' THEN 'entity_id' ELSE 'project_id' END, tbl)
		INTO status USING v_dest, fps;
		repoint_back := repoint_back || jsonb_build_object(tbl, status);
	END LOOP;

	-- 5. Source project: un-archive, unmerge, re-attach to its hub when the
	--    one-level rule still allows it and the user administers the hub.
	v_parent := (m.source_state->>'parent_project_id')::uuid;
	IF v_parent IS NOT NULL THEN
		v_parent_ok := EXISTS (SELECT 1 FROM public.onto_projects p WHERE p.id = v_parent AND p.deleted_at IS NULL
				AND p.archived_at IS NULL AND p.parent_project_id IS NULL)
			AND NOT EXISTS (SELECT 1 FROM public.onto_projects c WHERE c.parent_project_id = v_source AND c.deleted_at IS NULL)
			AND public.actor_has_project_member_access(v_actor, v_parent, 'admin');
	END IF;

	-- 6. Blockers.
	SELECT count(*) INTO v_dated FROM public.onto_tasks t WHERE t.id = ANY(ret_tasks) AND t.deleted_at IS NULL AND t.archived_at IS NULL
		AND (t.start_at IS NOT NULL OR t.due_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.onto_events ev WHERE ev.project_id = v_dest
			AND ev.deleted_at IS NULL AND ev.owner_entity_type = 'task' AND ev.owner_entity_id = t.id));
	IF v_dated > 0 AND NOT v_rollout.calendar THEN blockers := array_append(blockers, 'calendar_sync_not_deployed'); END IF;
	IF cardinality(ret_assets) > 0 AND NOT v_rollout.assets THEN blockers := array_append(blockers, 'asset_access_not_deployed'); END IF;
	IF ret = '{}'::jsonb THEN blockers := array_append(blockers, 'nothing_can_return'); END IF;
	IF EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()) THEN blockers := array_append(blockers, 'table_policy_incomplete'); END IF;

	SELECT coalesce(jsonb_object_agg(r.tbl, r.n), '{}') INTO counts
	FROM (SELECT value AS tbl, count(*) AS n FROM jsonb_each_text(ret) GROUP BY value) r;
	SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.key, 'table', r.value->>'table', 'reason', r.value->>'reason',
			'title', coalesce(d.title, t.title)) ORDER BY r.value->>'table', r.key), '[]')
	INTO staying FROM jsonb_each(reasons) r
	LEFT JOIN public.onto_documents d ON r.value->>'table' = 'onto_documents' AND d.id = r.key::uuid
	LEFT JOIN public.onto_tasks t ON r.value->>'table' = 'onto_tasks' AND t.id = r.key::uuid;

	impact := jsonb_build_object(
		'fold_id', p_fold_id,
		'source', jsonb_build_object('id', src.id, 'name', src.name),
		'destination', jsonb_build_object('id', dst.id, 'name', dst.name),
		'returning', counts,
		'staying', staying,
		'documents_filed_in_source', cardinality(v_live_docs),
		'folder_removed', v_folder_removed,
		'demotions_reversed', (SELECT count(*) FROM jsonb_array_elements(m.manifest->'demoted') d WHERE ret ? (d.value->>'id')),
		'repointed_back', (SELECT coalesce(jsonb_object_agg(k.key, jsonb_array_length(k.value)), '{}') FROM jsonb_each(repoint_back) k),
		'members_added_by_fold_stay', m.manifest->'members_added',
		'tasks_to_reconcile', v_dated,
		'source_restore', jsonb_build_object('unarchive', src.archived_at IS NOT DISTINCT FROM (m.source_state->>'archived_at')::timestamptz
				AND m.source_state->>'archived_at_before' IS NULL,
			'parent_project_id', CASE WHEN v_parent_ok THEN v_parent END, 'parent_not_restored', v_parent IS NOT NULL AND NOT v_parent_ok),
		'blockers', to_jsonb(blockers)
	);
	RETURN jsonb_build_object(
		'token', md5(concat_ws('|', 'unfold-v1', p_user::text, p_fold_id::text, ret::text,
			private.organize_tree(v_dest_tree)::text, private.organize_tree(v_source_tree)::text, impact::text)),
		'impact', impact,
		'plan', jsonb_build_object('returning', ret, 'source_tree', v_source_tree, 'dest_tree', v_dest_tree,
			'folder_removed', v_folder_removed, 'repoint_back', repoint_back, 'parent_ok', v_parent_ok),
		'actor_id', v_actor
	);
END $$;

CREATE FUNCTION public.onto_project_unfold_preview(p_user_id uuid, p_fold_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prepared jsonb;
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role' THEN
		RAISE EXCEPTION 'project_fold_service_only' USING ERRCODE = '42501';
	END IF;
	prepared := private.project_unfold_prepare(p_user_id, p_fold_id, false);
	RETURN jsonb_build_object('confirmation_token', prepared->'token', 'impact', prepared->'impact');
END $$;

-- ---------------------------------------------------------------------------
-- Apply.

CREATE FUNCTION public.onto_project_unfold_apply(p_user_id uuid, p_fold_id uuid, p_confirmation_token text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	v_started timestamptz := clock_timestamp();
	v_now timestamptz := now();
	m public.onto_project_fold_manifests;
	prepared jsonb;
	plan jsonb;
	impact jsonb;
	v_actor uuid;
	v_source uuid;
	v_dest uuid;
	ret jsonb;
	ret_map jsonb;
	ret_docs uuid[];
	ret_tasks uuid[];
	ret_assets uuid[];
	ids uuid[];
	tbl text;
	n integer;
	moved jsonb := '{}';
	removed_events jsonb := '[]';
	v_targets jsonb;
	v_jobs integer := 0;
	t uuid;
	v_request_hash text;
	v_receipt jsonb;
	d jsonb;
	v_start_here_kept boolean;
	v_restored jsonb := '{}';
	v_parent uuid;
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role' THEN
		RAISE EXCEPTION 'project_fold_service_only' USING ERRCODE = '42501';
	END IF;
	IF p_fold_id IS NULL OR p_confirmation_token IS NULL OR p_user_id IS NULL THEN
		RAISE EXCEPTION 'project_fold_invalid_arguments' USING ERRCODE = '22023';
	END IF;
	PERFORM set_config('lock_timeout', '5s', true);
	v_request_hash := md5('unfold|' || p_confirmation_token);
	PERFORM pg_advisory_xact_lock(hashtextextended('project_fold:' || p_fold_id::text, 0));
	SELECT * INTO m FROM public.onto_project_fold_manifests WHERE id = p_fold_id;
	IF NOT FOUND THEN RAISE EXCEPTION 'project_unfold_not_found' USING ERRCODE = 'P0002'; END IF;
	IF m.unfolded_at IS NOT NULL THEN
		IF m.unfold_receipt->>'request_hash' IS DISTINCT FROM v_request_hash OR m.unfold_receipt->>'user_id' IS DISTINCT FROM p_user_id::text THEN
			RAISE EXCEPTION 'project_unfold_already_done' USING ERRCODE = 'P0001';
		END IF;
		RETURN (m.unfold_receipt - 'request_hash' - 'user_id') || jsonb_build_object('replayed', true);
	END IF;

	prepared := private.project_unfold_prepare(p_user_id, p_fold_id, true);
	IF prepared->>'token' IS DISTINCT FROM p_confirmation_token THEN
		RAISE EXCEPTION 'project_unfold_stale_preview' USING ERRCODE = 'P0001';
	END IF;
	impact := prepared->'impact';
	IF jsonb_array_length(impact->'blockers') > 0 THEN
		RAISE EXCEPTION 'project_unfold_blocked: %', impact->'blockers' USING ERRCODE = 'P0001';
	END IF;
	plan := prepared->'plan';
	ret := plan->'returning';
	v_actor := (prepared->>'actor_id')::uuid;
	v_source := m.source_project_id;
	v_dest := m.destination_project_id;
	ret_docs := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = 'onto_documents' ORDER BY 1);
	ret_tasks := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = 'onto_tasks' ORDER BY 1);
	ret_assets := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = 'onto_assets' ORDER BY 1);
	ret_map := (SELECT coalesce(jsonb_object_agg(key, 'node'), '{}') FROM jsonb_each_text(ret));

	-- 1. Task events in the destination go; the calendar job rebuilds them in
	--    the source (same path as the fold).
	WITH gone AS (
		UPDATE public.onto_events e SET deleted_at = v_now, sync_status = 'pending'
		WHERE e.project_id = v_dest AND e.deleted_at IS NULL
			AND ((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(ret_tasks)) OR e.props->>'task_id' = ANY(ret_tasks::text[]))
		RETURNING e.id, e.project_id, CASE WHEN e.owner_entity_type = 'task' THEN e.owner_entity_id::text ELSE e.props->>'task_id' END AS task_id
	)
	SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'project_id', g.project_id, 'task_id', g.task_id) ORDER BY g.id), '[]')
	INTO removed_events FROM gone g;
	DELETE FROM public.onto_edges e WHERE e.project_id = v_dest AND (
		(e.src_kind = 'event' AND e.src_id = ANY(SELECT (r->>'id')::uuid FROM jsonb_array_elements(removed_events) r))
		OR (e.dst_kind = 'event' AND e.dst_id = ANY(SELECT (r->>'id')::uuid FROM jsonb_array_elements(removed_events) r)));

	-- 2. Records back to the source, ids intact.
	n := private.project_fold_relocate_guarded('onto_documents', 'document', ret_docs, v_source);
	moved := moved || jsonb_build_object('onto_documents', n);
	n := private.project_fold_relocate_guarded('onto_tasks', 'task', ret_tasks, v_source);
	moved := moved || jsonb_build_object('onto_tasks', n);
	FOREACH tbl IN ARRAY ARRAY['onto_goals', 'onto_plans', 'onto_milestones', 'onto_risks', 'onto_requirements',
		'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources'] LOOP
		ids := ARRAY(SELECT key::uuid FROM jsonb_each_text(ret) WHERE value = tbl);
		EXECUTE format('UPDATE public.%I SET project_id = $1 WHERE id = ANY($2) AND project_id = $3', tbl) USING v_source, ids, v_dest;
		GET DIAGNOSTICS n = ROW_COUNT;
		moved := moved || jsonb_build_object(tbl, n);
	END LOOP;
	moved := moved || jsonb_build_object('assets_and_links', private.project_fold_relocate_assets(ret_assets, v_source, ret_map));
	UPDATE public.onto_public_pages SET project_id = v_source WHERE project_id = v_dest AND document_id = ANY(ret_docs);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_public_pages', n);
	UPDATE public.onto_public_page_review_attempts SET project_id = v_source WHERE project_id = v_dest AND document_id = ANY(ret_docs);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_public_page_review_attempts', n);
	UPDATE public.onto_public_page_slug_history h SET project_id = v_source WHERE h.project_id = v_dest
		AND h.public_page_id IN (SELECT p.id FROM public.onto_public_pages p WHERE p.document_id = ANY(ret_docs));
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_public_page_slug_history', n);
	SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', c.entity_type, 'id', c.entity_id)), '[]') INTO v_targets
	FROM public.onto_comments c WHERE c.project_id = v_dest AND c.entity_type NOT IN ('project', 'event')
		AND (ret ? c.entity_id::text OR (c.entity_type = 'metric_point' AND EXISTS (SELECT 1 FROM public.onto_metric_points mp
			WHERE mp.id = c.entity_id AND ret ? mp.metric_id::text)));
	moved := moved || jsonb_build_object('onto_comments', private.project_fold_relocate_comments(v_dest, v_source, v_targets));
	UPDATE public.onto_comment_read_states s SET project_id = v_source WHERE s.project_id = v_dest
		AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_targets) r WHERE r->>'kind' = s.entity_type AND (r->>'id')::uuid = s.entity_id);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_comment_read_states', n);
	UPDATE public.onto_embeddings SET project_id = v_source WHERE project_id = v_dest AND entity_type NOT IN ('project', 'event')
		AND ret ? entity_id::text;
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_embeddings', n);
	-- Links: every node end returning, a destination project end only when the
	-- fold repointed it, and at least something of the fold's in it.
	WITH m2 AS (
		UPDATE public.onto_edges e SET project_id = v_source,
			src_id = CASE WHEN e.src_kind = 'project' AND e.src_id = v_dest THEN v_source ELSE e.src_id END,
			dst_id = CASE WHEN e.dst_kind = 'project' AND e.dst_id = v_dest THEN v_source ELSE e.dst_id END
		WHERE e.project_id = v_dest
			AND private.project_fold_endpoint_ok(ret_map, e.src_kind, e.src_id)
			AND private.project_fold_endpoint_ok(ret_map, e.dst_kind, e.dst_id)
			AND (ret ? e.src_id::text OR ret ? e.dst_id::text OR m.manifest->'edges' ? e.id::text)
			AND NOT ((e.src_kind = 'project' OR e.dst_kind = 'project') AND NOT (m.manifest->'project_edges' ? e.id::text))
		RETURNING e.id
	)
	SELECT count(*) INTO n FROM m2;
	moved := moved || jsonb_build_object('onto_edges', n);
	UPDATE public.onto_task_assignees SET project_id = v_source WHERE project_id = v_dest AND task_id = ANY(ret_tasks);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_task_assignees', n);
	-- Assignees the fold removed come back when they can open the source and
	-- nobody took their place.
	INSERT INTO public.onto_task_assignees
	SELECT (jsonb_populate_record(NULL::public.onto_task_assignees, a.value)).*
	FROM jsonb_array_elements(m.manifest->'removed_assignees') a
	WHERE (a.value->>'task_id')::uuid = ANY(ret_tasks)
		AND public.actor_has_project_member_access((a.value->>'assignee_actor_id')::uuid, v_source, 'read')
	ON CONFLICT DO NOTHING;
	GET DIAGNOSTICS n = ROW_COUNT; v_restored := v_restored || jsonb_build_object('assignees', n);

	-- 3. Demoted documents get their role back (unless the source has a new one).
	FOR d IN SELECT value FROM jsonb_array_elements(m.manifest->'demoted') WHERE ret ? (value->>'id') LOOP
		v_start_here_kept := NOT EXISTS (SELECT 1 FROM public.onto_documents x WHERE x.project_id = v_source AND x.deleted_at IS NULL
			AND x.id <> (d->>'id')::uuid AND x.type_key = d->>'type_key' AND d->>'type_key' IN ('document.context.project', 'document.context.thinking_log'));
		UPDATE public.onto_documents x SET
			type_key = CASE WHEN v_start_here_kept THEN d->>'type_key' ELSE x.type_key END,
			props = (x.props - 'former_role' - 'folded_from_project_id')
				|| CASE WHEN v_start_here_kept AND d->'props' ? 'origin' THEN jsonb_build_object('origin', d->'props'->'origin') ELSE '{}'::jsonb END
				|| CASE WHEN d->'props' ? 'role' THEN jsonb_build_object('role', d->'props'->'role') ELSE '{}'::jsonb END
		WHERE x.id = (d->>'id')::uuid;
		v_restored := v_restored || jsonb_build_object('role_' || (d->>'former_role'), v_start_here_kept);
	END LOOP;
	INSERT INTO public.onto_edges
	SELECT (jsonb_populate_record(NULL::public.onto_edges, e.value)).*
	FROM jsonb_array_elements(m.manifest->'dropped_edges') e
	WHERE e.value->>'rel' = 'has_context_document' AND ret ? (e.value->>'dst_id')
		AND EXISTS (SELECT 1 FROM public.onto_documents x WHERE x.id = (e.value->>'dst_id')::uuid AND x.type_key = 'document.context.project')
		AND NOT EXISTS (SELECT 1 FROM public.onto_edges x WHERE x.src_kind = 'project' AND x.src_id = v_source
			AND x.dst_kind = 'document' AND x.rel = 'has_context_document')
	ON CONFLICT DO NOTHING;

	-- 4. Repointed references.
	UPDATE public.chat_sessions SET entity_id = v_source WHERE context_type = 'project' AND entity_id = v_dest
		AND id = ANY(ARRAY(SELECT jsonb_array_elements_text(plan->'repoint_back'->'chat_sessions'))::uuid[]);
	GET DIAGNOSTICS n = ROW_COUNT; v_restored := v_restored || jsonb_build_object('chat_sessions', n);
	UPDATE public.chat_sessions_projects s SET project_id = v_source WHERE s.project_id = v_dest
		AND s.id = ANY(ARRAY(SELECT jsonb_array_elements_text(plan->'repoint_back'->'chat_sessions_projects'))::uuid[])
		AND NOT EXISTS (SELECT 1 FROM public.chat_sessions_projects o WHERE o.chat_session_id = s.chat_session_id AND o.project_id = v_source);
	GET DIAGNOSTICS n = ROW_COUNT; v_restored := v_restored || jsonb_build_object('chat_sessions_projects', n);
	INSERT INTO public.chat_sessions_projects
	SELECT (jsonb_populate_record(NULL::public.chat_sessions_projects, l.value)).*
	FROM jsonb_array_elements(m.manifest->'dropped_links') l
	WHERE EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = (l.value->>'chat_session_id')::uuid)
	ON CONFLICT DO NOTHING;
	UPDATE public.user_contact_links SET project_id = v_source WHERE project_id = v_dest
		AND id = ANY(ARRAY(SELECT jsonb_array_elements_text(plan->'repoint_back'->'user_contact_links'))::uuid[]);
	GET DIAGNOSTICS n = ROW_COUNT; v_restored := v_restored || jsonb_build_object('user_contact_links', n);

	-- 5. Trees, then the empty folder.
	PERFORM private.organize_write_tree(v_source, plan->'source_tree', v_actor);
	PERFORM private.organize_write_tree(v_dest, plan->'dest_tree', v_actor);
	IF (plan->>'folder_removed')::boolean THEN
		UPDATE public.onto_documents SET deleted_at = v_now WHERE id = m.folder_document_id AND deleted_at IS NULL;
	END IF;

	-- 6. The source comes back: un-archived (unless it was archived before the
	--    fold), unmerged, re-attached, its shared folder pointer restored.
	v_parent := CASE WHEN (plan->>'parent_ok')::boolean THEN (m.source_state->>'parent_project_id')::uuid END;
	PERFORM set_config('buildos.project_hierarchy_write', 'on', true);
	UPDATE public.onto_projects p SET
		archived_at = CASE WHEN p.archived_at IS NOT DISTINCT FROM (m.source_state->>'archived_at')::timestamptz
			THEN (m.source_state->>'archived_at_before')::timestamptz ELSE p.archived_at END,
		merged_into_project_id = NULL,
		parent_project_id = coalesce(p.parent_project_id, v_parent),
		shared_folder_document_id = CASE WHEN ret ? (m.source_state->>'shared_folder_document_id')
			THEN (m.source_state->>'shared_folder_document_id')::uuid ELSE p.shared_folder_document_id END
	WHERE p.id = v_source;
	PERFORM set_config('buildos.project_hierarchy_write', '', true);

	-- 7. Calendar jobs for returning dated tasks (the worker reconciles each
	--    task against its current project).
	FOR t IN SELECT id FROM public.onto_tasks WHERE id = ANY(ret_tasks) AND deleted_at IS NULL AND archived_at IS NULL
		AND ((start_at IS NOT NULL OR due_at IS NOT NULL)
			OR id::text = ANY(SELECT r->>'task_id' FROM jsonb_array_elements(removed_events) r)) ORDER BY id LOOP
		PERFORM public.add_queue_job(p_user_id, 'sync_calendar', jsonb_build_object('kind', 'onto_organize_task_sync',
			'taskId', t, 'sourceProjectId', v_dest, 'destinationProjectId', v_source,
			'removedEvents', (SELECT coalesce(jsonb_agg(r), '[]') FROM jsonb_array_elements(removed_events) r WHERE r->>'task_id' = t::text)),
			5, now(), 'project-unfold-task-sync:' || t || ':' || p_fold_id);
		v_jobs := v_jobs + 1;
	END LOOP;

	v_receipt := jsonb_build_object('status', 'unfolded', 'fold_id', p_fold_id,
		'source_project_id', v_source, 'destination_project_id', v_dest,
		'moved_back', moved, 'restored', v_restored, 'staying', impact->'staying',
		'folder_removed', (plan->>'folder_removed')::boolean,
		'members_added_by_fold_stay', impact->'members_added_by_fold_stay',
		'calendar_sync', CASE WHEN v_jobs > 0 THEN 'queued' ELSE 'not_needed' END, 'calendar_jobs', v_jobs,
		'parent_restored', v_parent IS NOT NULL,
		'duration_ms', round(extract(epoch FROM clock_timestamp() - v_started) * 1000),
		'replayed', false);
	UPDATE public.onto_project_fold_manifests SET unfolded_at = v_now,
		unfold_receipt = v_receipt || jsonb_build_object('request_hash', v_request_hash, 'user_id', p_user_id)
	WHERE id = p_fold_id;
	INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, after_data, changed_by, change_source)
	VALUES
		(v_source, 'project', v_source, 'updated', jsonb_build_object('unfolded_fold_id', p_fold_id, 'moved_back', moved), p_user_id, 'form'),
		(v_dest, 'project', v_dest, 'updated', jsonb_build_object('unfolded_fold_id', p_fold_id, 'moved_out_to', v_source), p_user_id, 'form');
	RETURN v_receipt;
END $$;

DO $$ DECLARE f record; BEGIN
	FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE (n.nspname = 'private' AND p.proname IN ('project_unfold_prepare', 'project_unfold_edge_end'))
			OR (n.nspname = 'public' AND p.proname IN ('onto_project_unfold_preview', 'onto_project_unfold_apply')) LOOP
		EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
	END LOOP;
END $$;

COMMENT ON FUNCTION public.onto_project_unfold_preview(uuid, uuid) IS
	'Service only. What an unfold would move back and what stays (with reasons), plus a confirmation token. Errors: project_unfold_not_found, project_unfold_already_done, project_unfold_source_changed, project_fold_access_denied.';
COMMENT ON FUNCTION public.onto_project_unfold_apply(uuid, uuid, text) IS
	'Service only. Moves unedited items of a fold back (idempotent by fold id). Errors: as preview, plus project_unfold_stale_preview, project_unfold_blocked: [...].';

COMMIT;
