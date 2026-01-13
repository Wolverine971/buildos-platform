-- packages/shared-types/src/functions/apply_graph_reorg_changes.sql
-- apply_graph_reorg_changes(uuid, jsonb, jsonb, jsonb)
-- Apply graph reorganization changes
-- Source: supabase/migrations/20260308000000_add_graph_reorg_rpc.sql

CREATE OR REPLACE FUNCTION apply_graph_reorg_changes(
  p_project_id uuid,
  p_deletes jsonb,
  p_updates jsonb,
  p_inserts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_deletes jsonb := coalesce(p_deletes, '[]'::jsonb);
  v_updates jsonb := coalesce(p_updates, '[]'::jsonb);
  v_inserts jsonb := coalesce(p_inserts, '[]'::jsonb);
  v_delete_count integer := 0;
  v_update_count integer := 0;
  v_insert_count integer := 0;
  v_expected_deletes integer := 0;
  v_expected_updates integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::text));

  IF jsonb_array_length(v_deletes) > 0 THEN
    WITH del AS (
      SELECT *
      FROM jsonb_to_recordset(v_deletes)
        AS d(id uuid, src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)
    ), deleted AS (
      DELETE FROM onto_edges e
      USING del d
      WHERE e.id = d.id
        AND e.project_id = p_project_id
        AND e.src_kind = d.src_kind
        AND e.src_id = d.src_id
        AND e.rel = d.rel
        AND e.dst_kind = d.dst_kind
        AND e.dst_id = d.dst_id
        AND e.props = coalesce(d.props, '{}'::jsonb)
      RETURNING e.id
    )
    SELECT count(*) INTO v_delete_count FROM deleted;

    SELECT count(*) INTO v_expected_deletes FROM jsonb_array_elements(v_deletes);

    IF v_delete_count <> v_expected_deletes THEN
      RAISE EXCEPTION 'Graph reorg conflict: delete mismatch (expected %, deleted %)', v_expected_deletes, v_delete_count
        USING errcode = '40001';
    END IF;
  END IF;

  IF jsonb_array_length(v_updates) > 0 THEN
    WITH upd AS (
      SELECT *
      FROM jsonb_to_recordset(v_updates)
        AS u(
          id uuid,
          src_kind text,
          src_id uuid,
          rel text,
          dst_kind text,
          dst_id uuid,
          props jsonb,
          expected_props jsonb
        )
    ), updated AS (
      UPDATE onto_edges e
      SET props = coalesce(u.props, '{}'::jsonb)
      FROM upd u
      WHERE e.id = u.id
        AND e.project_id = p_project_id
        AND e.src_kind = u.src_kind
        AND e.src_id = u.src_id
        AND e.rel = u.rel
        AND e.dst_kind = u.dst_kind
        AND e.dst_id = u.dst_id
        AND e.props = coalesce(u.expected_props, '{}'::jsonb)
      RETURNING e.id
    )
    SELECT count(*) INTO v_update_count FROM updated;

    SELECT count(*) INTO v_expected_updates FROM jsonb_array_elements(v_updates);

    IF v_update_count <> v_expected_updates THEN
      RAISE EXCEPTION 'Graph reorg conflict: update mismatch (expected %, updated %)', v_expected_updates, v_update_count
        USING errcode = '40001';
    END IF;
  END IF;

  IF jsonb_array_length(v_inserts) > 0 THEN
    WITH ins AS (
      SELECT *
      FROM jsonb_to_recordset(v_inserts)
        AS i(src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)
    ), to_insert AS (
      SELECT i.*
      FROM ins i
      LEFT JOIN onto_edges e
        ON e.project_id = p_project_id
        AND e.src_kind = i.src_kind
        AND e.src_id = i.src_id
        AND e.rel = i.rel
        AND e.dst_kind = i.dst_kind
        AND e.dst_id = i.dst_id
      WHERE e.id IS NULL
    ), inserted AS (
      INSERT INTO onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)
      SELECT p_project_id, src_kind, src_id, rel, dst_kind, dst_id, coalesce(props, '{}'::jsonb)
      FROM to_insert
      RETURNING id
    )
    SELECT count(*) INTO v_insert_count FROM inserted;
  END IF;

  RETURN jsonb_build_object(
    'deleted', v_delete_count,
    'updated', v_update_count,
    'inserted', v_insert_count
  );
END;
$$;
