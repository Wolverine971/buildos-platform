-- supabase/migrations/20260930035703_chat_cleanup_archive_conflicts_and_failure_receipts.sql
-- Tasker 114: archive concurrency guards and a server-owned failed partial receipt.
-- No production rows are rewritten. Existing terminal CAS fences remain intact.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.onto_document_archive_review_snapshot(
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
  -- Bind topology and node attributes, but exclude incidental sibling order.
  -- Canonical removals renumber siblings and children. That alone does not
  -- change what was reviewed. Parent moves and any descendant change do.
  WITH RECURSIVE nodes AS (
    SELECT node, NULL::uuid AS parent_id, ARRAY[]::uuid[] AS ancestors
    FROM jsonb_array_elements(coalesce(v_tree->'root', '[]'::jsonb)) node
    UNION ALL
    SELECT child, (nodes.node->>'id')::uuid, nodes.ancestors || (nodes.node->>'id')::uuid
    FROM nodes, LATERAL jsonb_array_elements(coalesce(nodes.node->'children', '[]'::jsonb)) child
  )
  SELECT jsonb_agg(jsonb_build_object(
    'node', node - 'order' - 'children', 'parent_id', parent_id
  ) ORDER BY node->>'id') INTO v_target_tree
    FROM nodes WHERE (node->>'id')::uuid = p_document_id OR p_document_id = ANY(ancestors);
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

REVOKE ALL ON FUNCTION public.onto_document_archive_review_snapshot(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onto_document_archive_review_snapshot(uuid, uuid, text) TO service_role;

-- Only the harness can construct this metadata. Failed model prefixes still
-- cannot become conversation history. Keep the failed/uncertain terminal.
CREATE FUNCTION public.agentic_chat_failed_partial_receipt_valid(
  p_status text, p_failure_code text, p_text text, p_metadata jsonb
) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public
AS $fn$
  SELECT coalesce(
    p_status = 'failed' AND p_failure_code = 'uncertain_external_commit'
    AND length(p_text) > 0
    AND p_metadata->>'completion_status' = 'failed'
    AND p_metadata->>'answer_source' = 'harness'
    AND p_metadata->'failure_disclosure_version' = '1'::jsonb
    AND p_metadata->'completion_receipt'->'version' = '1'::jsonb
    AND p_metadata->'completion_receipt'->'request'->>'disposition' = 'request_uncertain'
    AND (jsonb_path_exists(p_metadata, 'strict $.completion_receipt.unreviewedWriteCallIds[*]', '{}'::jsonb, true)
      OR jsonb_path_exists(p_metadata, 'strict $.completion_receipt.stages[*].executedCallIds[*]', '{}'::jsonb, true)),
    false);
$fn$;
REVOKE ALL ON FUNCTION public.agentic_chat_failed_partial_receipt_valid(text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_failed_partial_receipt_valid(text,text,text,jsonb) TO service_role;

-- Patch the current definitions, preserving all generation/owner fencing,
-- terminal replay logic, service-role checks, and subsequent timing repairs.
-- Exact anchors fail closed if the deployed definition has changed.
DO $migration$
DECLARE
  v_definition text;
  v_next text;
  v_base regprocedure := 'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'::regprocedure;
  v_failure regprocedure := 'public.finalize_agentic_chat_turn_with_failure_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,text,uuid,jsonb,uuid)'::regprocedure;
BEGIN
  v_definition := pg_get_functiondef(v_base);
  v_next := replace(v_definition,
    $old$v_should_persist_message := p_status = 'completed'
		OR (p_status = 'cancelled' AND p_assistant_text <> '');$old$,
    $new$v_should_persist_message := p_status = 'completed'
		OR (p_status = 'cancelled' AND p_assistant_text <> '')
		OR public.agentic_chat_failed_partial_receipt_valid(p_status, p_failure_code, p_assistant_text, p_assistant_metadata);$new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_message_policy';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    $old$v_terminal_sequence,
		p_assistant_text,
		v_projection,$old$,
    $new$v_terminal_sequence,
		CASE WHEN public.agentic_chat_failed_partial_receipt_valid(p_status, p_failure_code, p_assistant_text, p_assistant_metadata)
			AND coalesce(v_stream.assistant_text, '') <> '' THEN
			CASE WHEN octet_length(v_stream.assistant_text) + octet_length(p_assistant_text) + 2 <= 2097152
				THEN v_stream.assistant_text || E'\n\n' || p_assistant_text ELSE v_stream.assistant_text END
		ELSE p_assistant_text END,
		v_projection,$new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_terminal_stream';
  END IF;
  EXECUTE v_next;

  v_definition := pg_get_functiondef(v_failure);
  v_next := replace(v_definition,
    $old$OR p_assistant_message_id IS NOT NULL$old$,
    $new$OR (p_assistant_message_id IS NOT NULL AND NOT public.agentic_chat_failed_partial_receipt_valid(p_status, p_failure_code, p_assistant_text, p_assistant_metadata))$new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_failure_policy';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    $old$'assistant_persisted_at', NULL,$old$,
    $new$'assistant_persisted_at', CASE WHEN p_assistant_message_id IS NOT NULL THEN v_committed_at ELSE NULL END,$new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_failure_timing';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition, $old$v_request_role text;$old$,
    $new$v_request_role text;
	v_semantic_assistant_text text := p_assistant_text;$new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_failure_declaration';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    $old$v_error_receipt := public.persist_agentic_chat_semantic_event($old$,
    $new$-- Failure events preserve the append-only streamed prefix. Only the
	-- terminal CAS appends the disclosure in stream state and stores only
	-- the server receipt in conversation history.
	IF public.agentic_chat_failed_partial_receipt_valid(p_status, p_failure_code, p_assistant_text, p_assistant_metadata) THEN
		SELECT assistant_text INTO v_semantic_assistant_text FROM public.chat_turn_stream_state
		WHERE turn_run_id = p_turn_run_id;
	END IF;
	v_error_receipt := public.persist_agentic_chat_semantic_event($new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_failure_event';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    'p_error_transition_id, p_assistant_text,', 'p_error_transition_id, v_semantic_assistant_text,');
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_error_stream';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    'p_timing_transition_id, p_assistant_text,', 'p_timing_transition_id, v_semantic_assistant_text,');
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_timing_stream';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    'NULL, p_assistant_text, p_assistant_metadata,', 'p_assistant_message_id, p_assistant_text, p_assistant_metadata,');
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_terminal_message_argument';
  END IF;
  v_definition := v_next;
  v_next := replace(v_definition,
    $old$v_terminal_receipt->'assistant_message_id' IS DISTINCT FROM 'null'::jsonb$old$,
    $new$v_terminal_receipt->'assistant_message_id' IS DISTINCT FROM coalesce(to_jsonb(p_assistant_message_id), 'null'::jsonb)$new$);
  IF v_next = v_definition THEN
    RAISE EXCEPTION 'cleanup_partial_receipt_unexpected_terminal_message_receipt';
  END IF;
  EXECUTE v_next;
END;
$migration$;

COMMIT;
