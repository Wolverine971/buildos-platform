-- supabase/tests/document_table_rows.check.sql
-- Functional assertions for 20261004230000_document_table_rows.sql (Tables). Seeds one project
-- with a table document and drives onto_document_table_apply through insert, update (merge,
-- clear, cell_meta reset), delete, restore, move, conflicts and the markdown projection. Run with:
--   pnpm db:rehearse supabase/migrations/20261004230000_document_table_rows.sql \
--     --role-probe --check supabase/tests/document_table_rows.check.sql
DO $$
DECLARE
  v_user uuid := 'a7ab0000-0000-4000-8000-000000000001';
  v_actor uuid := 'a7ab0000-0000-4000-8000-000000000002';
  v_project uuid := 'a7ab0000-0000-4000-8000-000000000003';
  v_table uuid := 'a7ab0000-0000-4000-8000-000000000004';
  v_plain_doc uuid := 'a7ab0000-0000-4000-8000-000000000005';
  v_schema jsonb := jsonb_build_object(
    'format', 1,
    'revision', 0,
    'row_count', 0,
    'columns', jsonb_build_array(
      jsonb_build_object('id', 'c_company', 'name', 'Company', 'type', 'text'),
      jsonb_build_object('id', 'c_status', 'name', 'Status', 'type', 'select'),
      jsonb_build_object('id', 'c_salary', 'name', 'Salary', 'type', 'number'),
      jsonb_build_object('id', 'c_remote', 'name', 'Remote', 'type', 'checkbox'),
      jsonb_build_object('id', 'c_secret', 'name', 'Hidden', 'type', 'text', 'hidden', true)
    )
  );
  v_out jsonb;
  v_r1 uuid;
  v_r2 uuid;
  v_r3 uuid;
  v_row public.onto_document_rows%ROWTYPE;
  v_doc public.onto_documents%ROWTYPE;
  v_failed boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user, 'table-rows-check@example.com');
  INSERT INTO public.users (id, email) VALUES (v_user, 'table-rows-check@example.com')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.onto_actors (id, kind, name, user_id)
    VALUES (v_actor, 'human', 'Table check', v_user)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_actor FROM public.onto_actors WHERE user_id = v_user;
  INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key)
    VALUES (v_project, 'Table check project', 'project.default', v_actor, 'active');
  INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, created_by, props, content) VALUES
    (v_table, v_project, 'Job applications', 'document.table', 'draft', v_actor,
      jsonb_build_object('table', v_schema, 'body_markdown', 'stale'), ''),
    (v_plain_doc, v_project, 'Plain doc', 'document.default', 'draft', v_actor, '{}'::jsonb, 'hello');

  -- Grants: signed-in users and the server may call apply; anon may not.
  ASSERT NOT has_function_privilege('anon', 'public.onto_document_table_apply(uuid, jsonb, jsonb, integer, uuid)', 'EXECUTE'),
    'anon can execute onto_document_table_apply';
  ASSERT has_function_privilege('authenticated', 'public.onto_document_table_apply(uuid, jsonb, jsonb, integer, uuid)', 'EXECUTE'),
    'authenticated cannot execute onto_document_table_apply';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.onto_document_table_apply(uuid, jsonb, jsonb, integer, uuid)'::regprocedure),
    'onto_document_table_apply must stay SECURITY INVOKER';
  ASSERT NOT has_table_privilege('anon', 'public.onto_document_rows', 'SELECT'), 'anon can read onto_document_rows';

  -- Insert three rows (append order), with an AI-filled cell on the first.
  v_out := public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'insert', 'ref', 'a', 'cells', jsonb_build_object('c_company', 'Acme | Co', 'c_status', 'Applied', 'c_salary', 150000, 'c_remote', true, 'c_secret', 'nope'),
      'cell_meta', jsonb_build_object('c_salary', jsonb_build_object('by', 'ai_column', 'source_urls', jsonb_build_array('https://example.com')))),
    jsonb_build_object('op', 'insert', 'ref', 'b', 'cells', jsonb_build_object('c_company', 'Beta', 'c_status', 'Interview')),
    jsonb_build_object('op', 'insert', 'ref', 'c', 'cells', jsonb_build_object('c_company', 'Gamma', 'c_salary', NULL))
  ), NULL, 0, NULL);
  ASSERT (v_out->>'revision')::int = 1, 'revision should be 1 after first apply';
  ASSERT (v_out->>'row_count')::int = 3, 'row_count should be 3';
  ASSERT jsonb_array_length(v_out->'results') = 3, 'expected 3 results';
  ASSERT (v_out->'results'->0->>'ref') = 'a', 'insert result keeps its ref';
  ASSERT (v_out->'results'->0->>'row_number')::int = 1 AND (v_out->'results'->2->>'row_number')::int = 3,
    'row numbers should be 1..3';
  v_r1 := (v_out->'results'->0->>'row_id')::uuid;
  v_r2 := (v_out->'results'->1->>'row_id')::uuid;
  v_r3 := (v_out->'results'->2->>'row_id')::uuid;
  SELECT * INTO v_row FROM public.onto_document_rows WHERE id = v_r3;
  ASSERT NOT (v_row.cells ? 'c_salary'), 'null cells must not be stored on insert';

  -- Projection: header skips hidden columns, pipes escaped, booleans as Yes, body_markdown dropped.
  SELECT * INTO v_doc FROM public.onto_documents WHERE id = v_table;
  ASSERT position('| Company | Status | Salary | Remote |' IN v_doc.content) = 1, 'projection header wrong: ' || v_doc.content;
  ASSERT position('Hidden' IN v_doc.content) = 0, 'hidden column leaked into projection';
  ASSERT position('nope' IN v_doc.content) = 0, 'hidden cell leaked into projection';
  ASSERT position('Acme \| Co' IN v_doc.content) > 0, 'pipe not escaped in projection';
  ASSERT position('| Yes |' IN v_doc.content) > 0, 'checkbox not rendered as Yes';
  ASSERT NOT (v_doc.props ? 'body_markdown'), 'body_markdown should be dropped for tables';
  ASSERT (v_doc.props->'table'->>'row_count')::int = 3, 'props.table.row_count not maintained';

  -- Stale revision is refused.
  v_failed := false;
  BEGIN
    PERFORM public.onto_document_table_apply(v_table, '[]'::jsonb, NULL, 0, NULL);
  EXCEPTION WHEN SQLSTATE '40001' THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'stale revision should raise TABLE_CONFLICT';

  -- Update merges, clears with null, and resets cell_meta for touched cells.
  v_out := public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'update', 'row_id', v_r1, 'expected_version', 1,
      'cells', jsonb_build_object('c_salary', 160000, 'c_remote', NULL))
  ), NULL, NULL, NULL);
  SELECT * INTO v_row FROM public.onto_document_rows WHERE id = v_r1;
  ASSERT (v_row.cells->>'c_salary')::int = 160000, 'update did not set salary';
  ASSERT NOT (v_row.cells ? 'c_remote'), 'null in update should clear the cell';
  ASSERT v_row.cells->>'c_company' = 'Acme | Co', 'update clobbered an untouched cell';
  ASSERT NOT (v_row.cell_meta ? 'c_salary'), 'editing a cell must clear its old cell_meta';
  ASSERT v_row.version = 2, 'version should bump to 2';
  ASSERT (v_out->'results'->0->'before'->'cells'->>'c_salary')::int = 150000, 'before snapshot missing old salary';
  ASSERT (v_out->'results'->0->'before'->'cells'->'c_remote') = 'true'::jsonb, 'before snapshot missing old remote';

  -- Update with new cell_meta keeps it.
  PERFORM public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'update', 'row_id', v_r2,
      'cells', jsonb_build_object('c_salary', 120000),
      'cell_meta', jsonb_build_object('c_salary', jsonb_build_object('by', 'agent', 'note', 'from levels.fyi')))
  ), NULL, NULL, NULL);
  SELECT * INTO v_row FROM public.onto_document_rows WHERE id = v_r2;
  ASSERT v_row.cell_meta->'c_salary'->>'by' = 'agent', 'cell_meta from update not stored';

  -- Version conflict rolls back the whole batch (all or none).
  v_failed := false;
  BEGIN
    PERFORM public.onto_document_table_apply(v_table, jsonb_build_array(
      jsonb_build_object('op', 'update', 'row_id', v_r3, 'cells', jsonb_build_object('c_status', 'Offer')),
      jsonb_build_object('op', 'update', 'row_id', v_r1, 'expected_version', 1, 'cells', jsonb_build_object('c_status', 'Rejected'))
    ), NULL, NULL, NULL);
  EXCEPTION WHEN SQLSTATE '40001' THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'stale row version should raise ROW_CONFLICT';
  SELECT * INTO v_row FROM public.onto_document_rows WHERE id = v_r3;
  ASSERT NOT (v_row.cells ? 'c_status'), 'a failed batch must not partially apply';

  -- Delete is soft and drops the row from the projection; numbers are never reused.
  v_out := public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'delete', 'row_id', v_r3)
  ), NULL, NULL, NULL);
  ASSERT (v_out->>'row_count')::int = 2, 'row_count should drop to 2 after delete';
  SELECT * INTO v_doc FROM public.onto_documents WHERE id = v_table;
  ASSERT position('Gamma' IN v_doc.content) = 0, 'deleted row still in projection';
  v_out := public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'insert', 'cells', jsonb_build_object('c_company', 'Delta'))
  ), NULL, NULL, NULL);
  ASSERT (v_out->'results'->0->>'row_number')::int = 4, 'row numbers must not be reused after delete';

  -- Updating a deleted row fails; restore brings it back.
  v_failed := false;
  BEGIN
    PERFORM public.onto_document_table_apply(v_table, jsonb_build_array(
      jsonb_build_object('op', 'update', 'row_id', v_r3, 'cells', jsonb_build_object('c_status', 'Offer'))
    ), NULL, NULL, NULL);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'updating a deleted row should raise ROW_NOT_FOUND';
  v_out := public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'restore', 'row_id', v_r3)
  ), NULL, NULL, NULL);
  ASSERT (v_out->>'row_count')::int = 4, 'restore should bring row_count to 4';

  -- Move: r3 after r1 lands between r1 and r2.
  PERFORM public.onto_document_table_apply(v_table, jsonb_build_array(
    jsonb_build_object('op', 'move', 'row_id', v_r3, 'after_row_id', v_r1)
  ), NULL, NULL, NULL);
  SELECT * INTO v_doc FROM public.onto_documents WHERE id = v_table;
  ASSERT position('Acme' IN v_doc.content) < position('Gamma' IN v_doc.content)
     AND position('Gamma' IN v_doc.content) < position('Beta' IN v_doc.content),
    'move did not reorder the projection: ' || v_doc.content;

  -- Schema replacement: renaming a column updates the projection header; revision/row_count kept.
  v_out := public.onto_document_table_apply(v_table, '[]'::jsonb,
    jsonb_set(v_schema, '{columns,0,name}', '"Employer"'), NULL, NULL);
  SELECT * INTO v_doc FROM public.onto_documents WHERE id = v_table;
  ASSERT position('| Employer |' IN v_doc.content) = 1, 'schema replacement did not rename the header';
  ASSERT (v_doc.props->'table'->>'revision')::int = (v_out->>'revision')::int, 'revision not stored';
  ASSERT (v_doc.props->'table'->>'row_count')::int = 4, 'row_count lost on schema replacement';

  -- Unknown op and non-table documents are refused.
  v_failed := false;
  BEGIN
    PERFORM public.onto_document_table_apply(v_table, jsonb_build_array(jsonb_build_object('op', 'explode')), NULL, NULL, NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'unknown op should raise INVALID_OP';
  v_failed := false;
  BEGIN
    PERFORM public.onto_document_table_apply(v_plain_doc, '[]'::jsonb, NULL, NULL, NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'a non-table document should raise NOT_A_TABLE';

  -- Deleting the document cascades its rows.
  DELETE FROM public.onto_documents WHERE id = v_table;
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_document_rows WHERE document_id = v_table),
    'rows did not cascade with their document';
END $$;
