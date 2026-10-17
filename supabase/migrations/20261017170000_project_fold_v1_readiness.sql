-- supabase/migrations/20261017170000_project_fold_v1_readiness.sql
--
-- Project fold ("Combine") v1 readiness. Companion to
-- 20260930220000_project_fold_foundation.sql and 20260930220100_project_unfold.sql,
-- which were written on 2026-10-01 and never applied. Apply those two first, one at
-- a time, then this file. Migration files are immutable once written (CI ledger
-- check), so every change to the fold lands here.
--
-- 1. Coverage drift since 10-01. 20261007120000_task_entities.sql added
--    onto_task_entities.project_id and onto_task_entity_state.project_id. Their rows
--    already follow their task: trg_onto_tasks_extract_entities
--    (public.enqueue_task_entity_extraction, SECURITY DEFINER) rewrites project_id for
--    every row of a task whose project_id changes, before its title/description digest
--    gate, so a fold or unfold (which never edits title or description) queues no
--    extract_task_entities job. Classified move; private.project_fold_implemented()
--    lists them. The rehearsal against production's schema on 2026-10-17 found no
--    other unclassified project column.
-- 2. The events rule (DJ, 2026-10-17). Before: any live standalone (non-task) event in
--    the source blocked the fold (standalone_events_not_supported). Now, in
--    private.project_fold_prepare:
--      - an ended standalone event (coalesce(end_at, start_at) < now(), not
--        recurring) stays with the archived source as history, Google mapping and all.
--        Nothing about it moves and no calendar call is made. The impact reports
--        counts.past_events_left_with_source and lists up to 10 {id, title, start_at}
--        (most recent first) in past_events_left_with_source;
--      - an upcoming, under-way or recurring standalone event still blocks
--        (standalone_events_not_supported) and is listed (up to 25, soonest first) in
--        upcoming_standalone_events, so a chat card can name it. Recurring events also
--        keep recurring_event_not_supported;
--      - task events are unchanged: soft-deleted and rebuilt in the destination by the
--        Organize calendar job, gated by calendar_sync_ready;
--      - an ended event may stay only when nothing that moves points at it. A link to
--        it (other than a rebuilt task event's, which apply drops), an attachment on
--        it, or a moving plan/goal that owns it blocks with event_links_not_supported
--        (counts.past_event_links / past_event_attachments /
--        past_events_owned_by_moving_items). Apply would otherwise carry the link into
--        the destination and leave the event behind (private.project_fold_endpoint_ok
--        treats 'event' as a non-node kind). Production on 2026-10-17 has no such link:
--        all 146 links touching events are task -> task-event has_event links, and no
--        attachment is on an event. Blocking keeps onto_project_fold_apply and unfold
--        exactly as written; keeping such links with the source can be built when one
--        exists.
--    The token is unchanged in shape: the split follows the clock, but no clock value
--    is part of it, so an unchanged project previews to the same token until an event
--    crosses its end.
--
-- Replaced (CREATE OR REPLACE, so owner, SECURITY INVOKER, search_path = '' and
-- service-only grants are kept; re-asserted below): private.project_fold_implemented,
-- private.project_fold_prepare. Both are copied verbatim from
-- 20260930220000_project_fold_foundation.sql with the edits above.
--
-- Rehearse:
--   pnpm db:rehearse supabase/migrations/20260930220000_project_fold_foundation.sql \
--     supabase/migrations/20260930220100_project_unfold.sql \
--     supabase/migrations/20261017170000_project_fold_v1_readiness.sql \
--     --check supabase/tests/20260930220000_project_fold.check.sql \
--     --check supabase/tests/20261017170000_project_fold_v1_readiness.check.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NULL
		OR to_regprocedure('public.onto_project_unfold_apply(uuid, uuid, text)') IS NULL THEN
		RAISE EXCEPTION 'project_fold_v1_readiness: apply 20260930220000_project_fold_foundation.sql and 20260930220100_project_unfold.sql first';
	END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Coverage: task entities follow their task.

INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason) VALUES
	('public', 'onto_task_entities', 'project_id', 'move',
		'Task entities follow their task: trg_onto_tasks_extract_entities rewrites project_id for every row of a task whose project changes (fold and unfold alike); title and description are unchanged, so no extraction is queued.'),
	('public', 'onto_task_entity_state', 'project_id', 'move',
		'Extraction state follows its task through the same trigger (trg_onto_tasks_extract_entities); no re-read is queued because the task text is unchanged.');

-- ---------------------------------------------------------------------------
-- 2. The events rule.

UPDATE private.project_fold_table_policy SET reason =
	'Task events are soft-deleted in the source and recreated in the destination by the calendar job (Organize''s path; calendar_sync_ready). '
	|| 'Standalone events that have ended (coalesce(end_at, start_at) < now(), not recurring) stay with the archived source with their Google mapping and no calendar call; the preview counts and lists them. '
	|| 'Upcoming, under-way or recurring standalone events block the fold until a calendar re-home job exists, and so does any link, attachment or moving owner that ties an ended event to moved work.'
WHERE table_schema = 'public' AND table_name = 'onto_events' AND column_name = 'project_id';

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM private.project_fold_table_policy
		WHERE table_schema = 'public' AND table_name = 'onto_events' AND column_name = 'project_id' AND action = 'rebuild'
			AND reason LIKE '%Standalone events that have ended%') THEN
		RAISE EXCEPTION 'project_fold_v1_readiness: onto_events policy row missing';
	END IF;
END $$;

-- The move/repoint columns the fold implements (adds the two task-entity rows).
CREATE OR REPLACE FUNCTION private.project_fold_implemented()
RETURNS TABLE (table_schema text, table_name text, column_name text, action text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
	SELECT 'public', t, c, a FROM (VALUES
		('onto_documents', 'project_id', 'move'), ('onto_tasks', 'project_id', 'move'),
		('onto_goals', 'project_id', 'move'), ('onto_plans', 'project_id', 'move'),
		('onto_milestones', 'project_id', 'move'), ('onto_risks', 'project_id', 'move'),
		('onto_requirements', 'project_id', 'move'), ('onto_metrics', 'project_id', 'move'),
		('onto_insights', 'project_id', 'move'), ('onto_signals', 'project_id', 'move'),
		('onto_sources', 'project_id', 'move'), ('onto_assets', 'project_id', 'move'),
		('onto_asset_links', 'project_id', 'move'), ('onto_edges', 'project_id', 'move'),
		('onto_comments', 'project_id', 'move'), ('onto_comment_read_states', 'project_id', 'move'),
		('onto_embeddings', 'project_id', 'move'), ('onto_public_pages', 'project_id', 'move'),
		('onto_public_page_review_attempts', 'project_id', 'move'),
		('onto_public_page_slug_history', 'project_id', 'move'),
		('onto_task_assignees', 'project_id', 'move'),
		-- 20261017170000: moved by trg_onto_tasks_extract_entities when their task moves.
		('onto_task_entities', 'project_id', 'move'), ('onto_task_entity_state', 'project_id', 'move'),
		('chat_sessions', 'entity_id', 'repoint'), ('chat_sessions_projects', 'project_id', 'repoint'),
		('user_contact_links', 'project_id', 'repoint')
	) AS v(t, c, a);
$$;


-- ---------------------------------------------------------------------------
-- 3. Prepare with the events rule (verbatim from the foundation file except the
--    standalone-event split, the event-link blocker, the two impact lists and
--    info.task_entities_moved).

CREATE OR REPLACE FUNCTION private.project_fold_prepare(p_user uuid, p_source uuid, p_dest uuid, p_additions uuid[], p_lock boolean)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	v_actor uuid;
	src public.onto_projects;
	dst public.onto_projects;
	v_additions uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_additions, '{}'::uuid[])) x WHERE x IS NOT NULL ORDER BY x);
	v_rollout record;
	blockers text[] := '{}';
	members jsonb;
	missing uuid[];
	counts jsonb := '{}';
	tbl text;
	n bigint;
	v_entities bigint;
	v_docs bigint;
	v_dependents bigint;
	v_widest integer;
	v_embeddings bigint;
	v_dated bigint;
	v_task_events bigint;
	v_other_events bigint;
	v_upcoming_events bigint;
	v_past_event_ids uuid[];
	v_past_events jsonb;
	v_upcoming_list jsonb;
	v_event_edges bigint;
	v_event_attachments bigint;
	v_event_owners bigint;
	v_assets bigint;
	demoted jsonb;
	impact jsonb;
	info jsonb := '{}';
	left_counts jsonb := '{}';
	pol record;
	v_task_ids uuid[];
	v_task_event_ids uuid[];
	v_nodes_map jsonb;
BEGIN
	v_actor := private.project_fold_authorize(p_user, p_source, p_dest, p_lock);
	IF p_lock THEN
		-- The Organize mover's entity order: documents, then tasks, by id.
		PERFORM 1 FROM public.onto_documents WHERE project_id = p_source ORDER BY id FOR UPDATE;
		PERFORM 1 FROM public.onto_tasks WHERE project_id = p_source ORDER BY id FOR UPDATE;
	END IF;
	SELECT * INTO src FROM public.onto_projects WHERE id = p_source;
	SELECT * INTO dst FROM public.onto_projects WHERE id = p_dest;
	SELECT coalesce(bool_or(calendar_sync_ready), false) AS calendar, coalesce(bool_or(asset_access_ready), false) AS assets
		INTO v_rollout FROM private.organize_rollout WHERE singleton;

	IF EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()) THEN
		blockers := array_append(blockers, 'table_policy_incomplete');
	END IF;
	-- v1: one level of nesting. Folding a hub would strand its sub-projects, and
	-- folding a project into its own child needs the hub folded. The destination
	-- keeps its place in the hierarchy.
	IF EXISTS (SELECT 1 FROM public.onto_projects c WHERE c.parent_project_id = p_source AND c.deleted_at IS NULL) THEN
		blockers := array_append(blockers, 'source_has_sub_projects');
	END IF;

	-- Members: everyone who can open the source must be able to open the
	-- destination, or be named for addition (added with their source role).
	WITH source_members AS (
		SELECT m.actor_id, m.role_key, m.access FROM public.onto_project_members m
		WHERE m.project_id = p_source AND m.removed_at IS NULL
		UNION ALL
		SELECT src.created_by, 'owner', 'admin'
		WHERE src.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.onto_project_members m
			WHERE m.project_id = p_source AND m.actor_id = src.created_by AND m.removed_at IS NULL)
	), rated AS (
		SELECT s.*, a.name,
			CASE WHEN public.actor_has_project_member_access(s.actor_id, p_dest, 'admin') THEN 'admin'
				WHEN public.actor_has_project_member_access(s.actor_id, p_dest, 'write') THEN 'write'
				WHEN public.actor_has_project_member_access(s.actor_id, p_dest, 'read') THEN 'read' END AS destination_access
		FROM source_members s LEFT JOIN public.onto_actors a ON a.id = s.actor_id
	)
	SELECT coalesce(jsonb_agg(jsonb_build_object('actor_id', r.actor_id, 'name', r.name, 'role_key', r.role_key,
			'access', r.access, 'destination_access', r.destination_access,
			'named_for_addition', r.actor_id = ANY(v_additions)) ORDER BY r.actor_id), '[]'::jsonb),
		coalesce(array_agg(r.actor_id) FILTER (WHERE r.destination_access IS NULL), '{}')
	INTO members, missing FROM rated r;
	IF EXISTS (SELECT 1 FROM unnest(v_additions) x WHERE NOT (x = ANY(missing))) THEN
		RAISE EXCEPTION 'project_fold_invalid_member_addition' USING ERRCODE = '22023',
			DETAIL = 'Only source members the destination lacks can be named.';
	END IF;
	IF EXISTS (SELECT 1 FROM unnest(missing) x WHERE NOT (x = ANY(v_additions))) THEN
		blockers := array_append(blockers, 'members_missing');
	END IF;

	-- Counts of what moves (part of the token; no machine-churned tables).
	FOREACH tbl IN ARRAY ARRAY['onto_documents', 'onto_tasks', 'onto_goals', 'onto_plans', 'onto_milestones', 'onto_risks',
		'onto_requirements', 'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources', 'onto_assets', 'onto_asset_links',
		'onto_edges', 'onto_public_pages', 'onto_public_page_review_attempts', 'onto_public_page_slug_history', 'onto_task_assignees'] LOOP
		EXECUTE format('SELECT count(*) FROM public.%I WHERE project_id = $1', tbl) INTO n USING p_source;
		counts := counts || jsonb_build_object(tbl, n);
	END LOOP;
	v_nodes_map := private.project_fold_node_ids(p_source);
	v_task_ids := ARRAY(SELECT id FROM public.onto_tasks WHERE project_id = p_source);
	v_task_event_ids := ARRAY(SELECT e.id FROM public.onto_events e WHERE e.project_id = p_source AND e.deleted_at IS NULL
		AND ((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(v_task_ids)) OR e.props->>'task_id' = ANY(v_task_ids::text[])));
	counts := counts || jsonb_build_object(
		'onto_edges', (SELECT count(*) FROM public.onto_edges e WHERE e.project_id = p_source
			AND private.project_fold_endpoint_ok(v_nodes_map, e.src_kind, e.src_id)
			AND private.project_fold_endpoint_ok(v_nodes_map, e.dst_kind, e.dst_id)
			AND NOT (e.src_kind = 'event' AND e.src_id = ANY(v_task_event_ids))
			AND NOT (e.dst_kind = 'event' AND e.dst_id = ANY(v_task_event_ids))
			AND NOT (e.src_kind = 'project' AND e.src_id = p_source AND e.dst_kind = 'document' AND e.rel = 'has_context_document')),
		'task_event_links_dropped', (SELECT count(*) FROM public.onto_edges e WHERE e.project_id = p_source
			AND ((e.src_kind = 'event' AND e.src_id = ANY(v_task_event_ids)) OR (e.dst_kind = 'event' AND e.dst_id = ANY(v_task_event_ids)))),
		'stale_links_left_with_source', (SELECT count(*) FROM public.onto_edges e WHERE e.project_id = p_source
			AND NOT (private.project_fold_endpoint_ok(v_nodes_map, e.src_kind, e.src_id)
				AND private.project_fold_endpoint_ok(v_nodes_map, e.dst_kind, e.dst_id))),
		'onto_comments', (SELECT count(*) FROM public.onto_comments WHERE project_id = p_source AND entity_type NOT IN ('project', 'event')),
		'comments_left_with_source', (SELECT count(*) FROM public.onto_comments WHERE project_id = p_source AND entity_type IN ('project', 'event')),
		'finished_proposals_left_with_source', (SELECT count(*) FROM public.onto_document_proposals WHERE project_id = p_source AND status <> 'pending'),
		'pending_proposals', (SELECT count(*) FROM public.onto_document_proposals WHERE project_id = p_source AND status = 'pending'),
		'documents_filed', (SELECT count(*) FROM public.onto_documents WHERE project_id = p_source
			AND deleted_at IS NULL AND archived_at IS NULL AND state_key::text <> 'archived'),
		'project_edges_repointed', (SELECT count(*) FROM public.onto_edges WHERE project_id = p_source
			AND ((src_kind = 'project' AND src_id = p_source) OR (dst_kind = 'project' AND dst_id = p_source))
			AND NOT (src_kind = 'project' AND dst_kind = 'document' AND rel = 'has_context_document')),
		'context_document_links_dropped', (SELECT count(*) FROM public.onto_edges WHERE project_id = p_source
			AND src_kind = 'project' AND src_id = p_source AND dst_kind = 'document' AND rel = 'has_context_document'),
		'assignees_removed', (SELECT count(*) FROM public.onto_task_assignees a WHERE a.project_id = p_source
			AND NOT public.actor_has_project_member_access(a.assignee_actor_id, p_dest, 'read')
			AND NOT (a.assignee_actor_id = ANY(v_additions)))
	);

	SELECT count(*) INTO v_dated FROM public.onto_tasks t WHERE t.project_id = p_source AND t.deleted_at IS NULL
		AND t.archived_at IS NULL AND (t.start_at IS NOT NULL OR t.due_at IS NOT NULL);
	SELECT count(*) FILTER (WHERE x.task_event), count(*) FILTER (WHERE NOT x.task_event)
	INTO v_task_events, v_other_events
	FROM public.onto_events e
	CROSS JOIN LATERAL (SELECT coalesce((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(v_task_ids))
		OR e.props->>'task_id' = ANY(v_task_ids::text[]), false) AS task_event) x
	WHERE e.project_id = p_source AND e.deleted_at IS NULL;
	counts := counts || jsonb_build_object('dated_tasks', v_dated, 'task_events_rebuilt', v_task_events, 'other_live_events', v_other_events);
	-- Standalone (non-task) events (20261017170000). One that has ended, by
	-- coalesce(end_at, start_at) < now(), and does not recur stays with the archived
	-- source as history, Google mapping included: nothing moves and no calendar call is
	-- made. One still to come (or under way, or recurring) blocks until a calendar
	-- re-home job exists; the impact names it. The split follows the clock (apply
	-- re-runs it under its locks) but the clock itself is never part of the token.
	WITH standalone AS (
		SELECT e.id, e.title, e.start_at,
			coalesce(coalesce(e.end_at, e.start_at) < now()
				AND NOT (e.recurrence IS NOT NULL AND e.recurrence <> '{}' AND e.recurrence <> 'null'), false) AS past
		FROM public.onto_events e
		WHERE e.project_id = p_source AND e.deleted_at IS NULL
			AND NOT coalesce((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(v_task_ids))
				OR e.props->>'task_id' = ANY(v_task_ids::text[]), false)
	)
	SELECT coalesce(array_agg(s.id ORDER BY s.id) FILTER (WHERE s.past), '{}'),
		count(*) FILTER (WHERE NOT s.past),
		coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'start_at', p.start_at) ORDER BY p.start_at DESC, p.id)
			FROM (SELECT * FROM standalone WHERE past ORDER BY start_at DESC, id LIMIT 10) p), '[]'::jsonb),
		coalesce((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'title', u.title, 'start_at', u.start_at) ORDER BY u.start_at, u.id)
			FROM (SELECT * FROM standalone WHERE NOT past ORDER BY start_at, id LIMIT 25) u), '[]'::jsonb)
	INTO v_past_event_ids, v_upcoming_events, v_past_events, v_upcoming_list
	FROM standalone s;
	-- An ended event stays only when nothing that moves points at it: a link (other
	-- than a rebuilt task event's, which is dropped), an attachment, or a moving
	-- plan/goal that owns it. Apply would carry those across and leave the event
	-- behind, so they block instead (production 2026-10-17: none; every link to an
	-- event is a task -> task-event has_event link).
	SELECT count(*) INTO v_event_edges FROM public.onto_edges e WHERE e.project_id = p_source
		AND ((e.src_kind = 'event' AND e.src_id = ANY(v_past_event_ids)) OR (e.dst_kind = 'event' AND e.dst_id = ANY(v_past_event_ids)))
		AND NOT ((e.src_kind = 'event' AND e.src_id = ANY(v_task_event_ids)) OR (e.dst_kind = 'event' AND e.dst_id = ANY(v_task_event_ids)));
	SELECT count(*) INTO v_event_attachments FROM public.onto_asset_links l WHERE l.project_id = p_source
		AND l.entity_kind = 'event' AND l.entity_id = ANY(v_past_event_ids);
	SELECT count(*) INTO v_event_owners FROM public.onto_events e WHERE e.id = ANY(v_past_event_ids)
		AND e.owner_entity_type IN (SELECT k.kind FROM private.project_fold_node_kinds() k)
		AND v_nodes_map ? e.owner_entity_id::text;
	counts := counts || jsonb_build_object('past_events_left_with_source', cardinality(v_past_event_ids),
		'upcoming_standalone_events', v_upcoming_events, 'past_event_links', v_event_edges,
		'past_event_attachments', v_event_attachments, 'past_events_owned_by_moving_items', v_event_owners);
	v_assets := (counts->>'onto_assets')::bigint;

	IF (counts->>'pending_proposals')::int > 0 THEN blockers := array_append(blockers, 'pending_document_proposal'); END IF;
	IF EXISTS (SELECT 1 FROM public.onto_tasks WHERE project_id = p_source AND deleted_at IS NULL AND (
		nullif(btrim(props->>'series_id'), '') IS NOT NULL OR coalesce(props->'series', 'null') <> 'null'
		OR coalesce(props->'recurrence', 'null') <> 'null' OR nullif(btrim(props->>'recurrence_pattern'), '') IS NOT NULL
		OR nullif(btrim(props->>'recurrence_rrule'), '') IS NOT NULL OR props->>'task_type' = 'recurring')) THEN
		blockers := array_append(blockers, 'recurring_task_not_supported');
	END IF;
	IF EXISTS (SELECT 1 FROM public.onto_events WHERE project_id = p_source AND deleted_at IS NULL
		AND recurrence IS NOT NULL AND recurrence <> '{}' AND recurrence <> 'null') THEN
		blockers := array_append(blockers, 'recurring_event_not_supported');
	END IF;
	IF v_upcoming_events > 0 THEN blockers := array_append(blockers, 'standalone_events_not_supported'); END IF;
	IF v_event_edges + v_event_attachments + v_event_owners > 0 THEN blockers := array_append(blockers, 'event_links_not_supported'); END IF;
	IF (v_dated > 0 OR v_task_events > 0) AND NOT v_rollout.calendar THEN blockers := array_append(blockers, 'calendar_sync_not_deployed'); END IF;
	IF v_assets > 0 AND NOT v_rollout.assets THEN blockers := array_append(blockers, 'asset_access_not_deployed'); END IF;

	-- Limits: a fold is one transaction holding both projects; keep it short.
	-- PostgREST runs it under the authenticator's statement_timeout (8 s in production).
	-- DJ's largest real project (2026-10-01: 54 documents, ~250 entities, ~360 embeddings)
	-- folds and unfolds in ~0.3 s locally. At 2x these caps (2000 entities, 9490
	-- relationships, 4000 embeddings) fold took 4.8 s and unfold 5.4 s; every moved
	-- embedding re-enters the HNSW index (~0.8 ms each). These caps keep both near 2.5 s.
	v_entities := (SELECT sum(value::bigint) FROM jsonb_each_text(counts) WHERE key IN ('onto_documents', 'onto_tasks', 'onto_goals',
		'onto_plans', 'onto_milestones', 'onto_risks', 'onto_requirements', 'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources', 'onto_assets'));
	v_docs := (counts->>'onto_documents')::bigint;
	v_dependents := (SELECT sum(value::bigint) FROM jsonb_each_text(counts) WHERE key IN ('onto_edges', 'onto_comments',
		'onto_asset_links', 'onto_public_pages', 'onto_task_assignees'));
	IF v_entities > 1000 THEN blockers := array_append(blockers, 'too_many_entities'); END IF;
	IF v_docs > 300 THEN blockers := array_append(blockers, 'too_many_documents'); END IF;
	IF v_dependents > 5000 THEN blockers := array_append(blockers, 'too_many_relationships'); END IF;
	v_embeddings := (SELECT count(*) FROM public.onto_embeddings WHERE project_id = p_source);
	IF v_embeddings > 2000 THEN
		blockers := array_append(blockers, 'too_many_embeddings');
	END IF;
	-- The folder holds the source's top level. A document's children cache sits in a btree
	-- index (idx_onto_documents_has_children) that overflows at ~60 direct children with
	-- random ids, so block wide folders with a reason instead of failing on the index.
	-- Production max on 2026-10-01: 17 top-level documents, 11 children under any document.
	WITH filed AS (
		SELECT private.project_fold_file_tree(
			CASE WHEN jsonb_typeof(src.doc_structure->'root') = 'array' THEN src.doc_structure->'root' ELSE '[]'::jsonb END,
			ARRAY(SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_source
				AND d.deleted_at IS NULL AND d.archived_at IS NULL AND d.state_key::text <> 'archived')) AS tree)
	SELECT greatest(jsonb_array_length(f.tree), coalesce((SELECT max(jsonb_array_length(n.node->'children'))
		FROM private.organize_nodes(f.tree) n WHERE jsonb_typeof(n.node->'children') = 'array'), 0))
	INTO v_widest FROM filed f;
	IF v_widest > 50 THEN blockers := array_append(blockers, 'too_many_documents_in_one_folder'); END IF;

	SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'type_key', d.type_key,
		'former_role', CASE WHEN d.id = src.shared_folder_document_id THEN 'shared_with_sub_projects'
			WHEN d.type_key = 'document.context.project' THEN 'start_here' ELSE 'thinking_log' END) ORDER BY d.id), '[]'::jsonb)
	INTO demoted FROM public.onto_documents d
	WHERE d.project_id = p_source AND (d.type_key IN ('document.context.project', 'document.context.thinking_log')
		OR d.id = src.shared_folder_document_id);

	impact := jsonb_build_object(
		'source', jsonb_build_object('id', src.id, 'name', src.name, 'archived', src.archived_at IS NOT NULL,
			'parent_project_id', src.parent_project_id),
		'destination', jsonb_build_object('id', dst.id, 'name', dst.name),
		'folder_title', left('From ' || coalesce(nullif(btrim(src.name), ''), 'combined project'), 200),
		'counts', counts,
		'demoted_documents', demoted,
		'past_events_left_with_source', v_past_events,
		'upcoming_standalone_events', v_upcoming_list,
		'members', members,
		'members_missing', to_jsonb(missing),
		'member_additions', to_jsonb(v_additions),
		'connector_grants_not_copied', jsonb_build_object(
			'project_permissions', (SELECT count(*) FROM public.external_agent_project_permissions
				WHERE project_id = p_source AND revoked_at IS NULL),
			'oauth_grants_naming_source', (SELECT count(*) FROM public.agent_oauth_grants
				WHERE jsonb_typeof(allowed_project_ids) = 'array' AND allowed_project_ids ? p_source::text)),
		'rebuild_after_commit', (SELECT coalesce(jsonb_agg(p.table_schema || '.' || p.table_name ORDER BY p.table_schema, p.table_name), '[]')
			FROM private.project_fold_table_policy p WHERE p.action = 'rebuild'),
		'limits', jsonb_build_object('entities', v_entities, 'max_entities', 1000, 'documents', v_docs, 'max_documents', 300,
			'relationships', v_dependents, 'max_relationships', 5000,
			'widest_folder', v_widest, 'max_widest_folder', 50),
		'blockers', to_jsonb(blockers)
	);

	-- Informational only (machine-churned, not promised by the token).
	FOR pol IN SELECT p.* FROM private.project_fold_table_policy p
		JOIN pg_catalog.pg_attribute a ON a.attname = p.column_name AND a.attnum > 0 AND NOT a.attisdropped
			AND a.attrelid = to_regclass(format('%I.%I', p.table_schema, p.table_name))
		WHERE p.action IN ('leave_behind', 'rebuild') AND a.atttypid = 'uuid'::regtype
			AND NOT (p.table_name = 'onto_projects') AND p.table_name <> 'onto_project_fold_manifests'
		ORDER BY p.table_schema, p.table_name, p.column_name LOOP
		EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', pol.table_schema, pol.table_name, pol.column_name) INTO n USING p_source;
		IF n > 0 THEN
			left_counts := left_counts || jsonb_build_object(pol.table_name || CASE WHEN pol.column_name <> 'project_id' THEN '.' || pol.column_name ELSE '' END, n);
		END IF;
	END LOOP;
	info := jsonb_build_object(
		'embeddings_moved', (SELECT count(*) FROM public.onto_embeddings WHERE project_id = p_source AND entity_type NOT IN ('project', 'event')),
		'embeddings', v_embeddings, 'max_embeddings', 2000,
		'read_states_moved', (SELECT count(*) FROM public.onto_comment_read_states WHERE project_id = p_source AND entity_type NOT IN ('project', 'event')),
		'task_entities_moved', (SELECT count(*) FROM public.onto_task_entities WHERE task_id = ANY(v_task_ids)),
		'repointed', jsonb_build_object(
			'chat_sessions', (SELECT count(*) FROM public.chat_sessions WHERE context_type = 'project' AND entity_id = p_source),
			'chat_sessions_projects', (SELECT count(*) FROM public.chat_sessions_projects WHERE project_id = p_source),
			'user_contact_links', (SELECT count(*) FROM public.user_contact_links WHERE project_id = p_source)),
		'left_with_source', left_counts,
		'source_calendar', EXISTS (SELECT 1 FROM public.project_calendars WHERE project_id = p_source)
	);

	RETURN jsonb_build_object(
		'token', md5(concat_ws('|', 'fold-v1', p_user::text, p_source::text, p_dest::text, v_additions::text,
			private.project_fold_source_digest(p_source, p_dest), impact::text)),
		'impact', impact,
		'info', info,
		'actor_id', v_actor
	);
END $$;

-- Same grants as the foundation file: server-only.
REVOKE ALL ON FUNCTION private.project_fold_implemented() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_fold_implemented() TO service_role;
REVOKE ALL ON FUNCTION private.project_fold_prepare(uuid, uuid, uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_fold_prepare(uuid, uuid, uuid, uuid[], boolean) TO service_role;

COMMIT;
