-- supabase/migrations/20260929232842_chat_document_archive_review_guard.sql
-- Tasker 114: the worker reviews server-read archive effects, then compares
-- them again under the canonical project -> documents -> public pages locks.
-- These are server-only helpers. The gateway enforces the requesting user's
-- project write scope; a review snapshot is a concurrency guard, not permission.
BEGIN;

CREATE FUNCTION public.onto_document_archive_review_snapshot(
  p_project_id uuid, p_document_id uuid, p_archive_mode text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_tree jsonb;
  v_affected uuid[];
  v_archived uuid[];
  v_documents jsonb;
  v_pages jsonb;
  v_target_updated_at timestamptz;
  v_target_tree jsonb;
BEGIN
  IF p_archive_mode IS NULL OR p_archive_mode NOT IN ('archive_children', 'promote_children') THEN
    RAISE EXCEPTION 'document_archive_explicit_mode_required' USING ERRCODE = '22023';
  END IF;
  SELECT doc_structure INTO v_tree FROM public.onto_projects
    WHERE id = p_project_id AND deleted_at IS NULL AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_archive_project_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Bind this subtree and its parent, not the whole project's version: other
  -- independent archives in the same reviewed stage may remove sibling nodes.
  WITH RECURSIVE nodes AS (
    SELECT node, NULL::uuid AS parent_id
    FROM jsonb_array_elements(coalesce(v_tree->'root', '[]'::jsonb)) node
    UNION ALL
    SELECT child, (nodes.node->>'id')::uuid
    FROM nodes, LATERAL jsonb_array_elements(coalesce(nodes.node->'children', '[]'::jsonb)) child
  )
  SELECT jsonb_build_object('node', node, 'parent_id', parent_id) INTO v_target_tree
    FROM nodes WHERE (node->>'id')::uuid = p_document_id;
  -- Walk the canonical tree, never the cached document.children column.
  WITH RECURSIVE nodes AS (
    SELECT node, ARRAY[]::uuid[] AS ancestors
    FROM jsonb_array_elements(coalesce(v_tree->'root', '[]'::jsonb)) node
    UNION ALL
    SELECT child, nodes.ancestors || (nodes.node->>'id')::uuid
    FROM nodes, LATERAL jsonb_array_elements(coalesce(nodes.node->'children', '[]'::jsonb)) child
  )
  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_affected FROM (
    SELECT p_document_id AS id
    UNION ALL
    SELECT (node->>'id')::uuid FROM nodes
    WHERE (p_archive_mode = 'archive_children' AND p_document_id = ANY(ancestors))
      OR (p_archive_mode = 'promote_children' AND ancestors[cardinality(ancestors)] = p_document_id)
  ) ids;
  IF cardinality(v_affected) > 100 THEN
    RAISE EXCEPTION 'document_archive_scope_too_large' USING ERRCODE = '22023';
  END IF;
  v_archived := CASE WHEN p_archive_mode = 'archive_children' THEN v_affected ELSE ARRAY[p_document_id] END;
  SELECT updated_at INTO v_target_updated_at FROM public.onto_documents
    WHERE id = p_document_id AND project_id = p_project_id AND deleted_at IS NULL
      AND archived_at IS NULL AND state_key <> 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_archive_target_missing_or_already_archived' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.onto_documents
    WHERE id = ANY(v_archived) AND type_key = 'document.context.project') THEN
    RAISE EXCEPTION 'document_archive_start_here_protected' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'state_key', state_key, 'type_key', type_key,
    'updated_at', updated_at, 'archived_at', archived_at,
    'effect', CASE WHEN id = ANY(v_archived) THEN 'archive' ELSE 'promote' END
  ) ORDER BY id) INTO v_documents FROM public.onto_documents
    WHERE id = ANY(v_affected) AND project_id = p_project_id AND deleted_at IS NULL;
  IF jsonb_array_length(coalesce(v_documents, '[]'::jsonb)) <> cardinality(v_affected) THEN
    RAISE EXCEPTION 'document_archive_document_mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'document_id', document_id, 'slug', slug,
    'status', status, 'public_status', public_status, 'visibility', visibility
  ) ORDER BY id), '[]'::jsonb) INTO v_pages FROM public.onto_public_pages
    WHERE document_id = ANY(v_archived) AND deleted_at IS NULL;
  RETURN jsonb_build_object(
    'project_id', p_project_id, 'document_id', p_document_id, 'archive_mode', p_archive_mode,
    'target_updated_at', v_target_updated_at,
    'tree_fingerprint', md5(coalesce(v_target_tree, 'null'::jsonb)::text),
    'archived_document_ids', to_jsonb(v_archived), 'documents', v_documents, 'public_pages', v_pages
  );
END;
$$;

CREATE FUNCTION public.onto_document_archive_reviewed_atomic(
  p_project_id uuid, p_document_id uuid, p_document_ids uuid[],
  p_expected_updated_at timestamptz, p_expected_structure_version integer,
  p_next_structure jsonb, p_changed_by uuid, p_children_updates jsonb,
  p_archive_mode text, p_expected_review_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_ids uuid[];
BEGIN
  IF p_expected_review_snapshot IS NULL OR jsonb_typeof(p_expected_review_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'document_archive_review_required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.onto_projects WHERE id = p_project_id FOR UPDATE;
  -- FOR UPDATE also blocks new public-page FK references until this archive
  -- commits. Existing page status/slug changes serialize on their row locks.
  PERFORM id FROM public.onto_documents WHERE project_id = p_project_id AND (
    id = ANY(p_document_ids) OR id IN (
      SELECT (item->>'id')::uuid FROM jsonb_array_elements(p_expected_review_snapshot->'documents') item
    )) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.onto_public_pages
    WHERE document_id = ANY(p_document_ids) ORDER BY id FOR UPDATE;
  v_snapshot := public.onto_document_archive_review_snapshot(p_project_id, p_document_id, p_archive_mode);
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM unnest(p_document_ids) id;
  IF v_snapshot IS DISTINCT FROM p_expected_review_snapshot
    OR v_snapshot->'archived_document_ids' IS DISTINCT FROM to_jsonb(v_ids) THEN
    RAISE EXCEPTION 'document_archive_review_changed' USING ERRCODE = '40001';
  END IF;
  RETURN public.onto_document_archive_atomic(
    p_project_id, p_document_id, p_document_ids, p_expected_updated_at,
    p_expected_structure_version, p_next_structure, p_changed_by, p_children_updates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.onto_document_archive_review_snapshot(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onto_document_archive_reviewed_atomic(uuid, uuid, uuid[], timestamptz, integer, jsonb, uuid, jsonb, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onto_document_archive_review_snapshot(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.onto_document_archive_reviewed_atomic(uuid, uuid, uuid[], timestamptz, integer, jsonb, uuid, jsonb, text, jsonb) TO service_role;

COMMIT;
