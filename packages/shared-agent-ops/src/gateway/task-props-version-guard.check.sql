-- packages/shared-agent-ops/src/gateway/task-props-version-guard.check.sql
-- Run only inside the disposable migration rehearsal database.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.onto_actors (id, kind, name) VALUES
 ('13200000-0000-4000-8000-000000000001', 'agent', 'Tasker 132');
INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
 ('13200000-0000-4000-8000-000000000002', 'Props guard', 'project.default', '13200000-0000-4000-8000-000000000001');
INSERT INTO public.onto_tasks (id, project_id, title, created_by, props) VALUES
 ('13200000-0000-4000-8000-000000000003', '13200000-0000-4000-8000-000000000002', 'Original', '13200000-0000-4000-8000-000000000001', '{"human":"new"}');
DO $$
DECLARE
  v_result jsonb;
  v_version timestamptz;
  v_conflicted boolean := false;
BEGIN
  SELECT updated_at INTO v_version FROM public.onto_tasks WHERE id = '13200000-0000-4000-8000-000000000003';
  BEGIN
    PERFORM public.onto_task_update_with_relationships_atomic(
      '13200000-0000-4000-8000-000000000003',
      jsonb_build_object('props', '{"human":"old","agent":true}'::jsonb, 'title', 'Must roll back', '_expected_updated_at', v_version - interval '1 second'),
      true, ARRAY['13200000-0000-4000-8000-000000000001']::uuid[], '13200000-0000-4000-8000-000000000001', NULL, 'manual');
  EXCEPTION WHEN serialization_failure THEN
    ASSERT SQLERRM = 'task_props_version_conflict', 'unexpected conflict';
    v_conflicted := true;
  END;
  ASSERT v_conflicted, 'stale props must conflict before task or assignee writes';
  ASSERT (SELECT props = '{"human":"new"}'::jsonb AND title = 'Original' FROM public.onto_tasks WHERE id = '13200000-0000-4000-8000-000000000003'), 'stale update changed task';
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_task_assignees WHERE task_id = '13200000-0000-4000-8000-000000000003'), 'stale update changed assignees';
  v_result := public.onto_task_update_with_relationships_atomic(
    '13200000-0000-4000-8000-000000000003',
    jsonb_build_object('props', '{"human":"new","agent":true}'::jsonb, '_expected_updated_at', v_version),
    false, NULL, NULL, NULL, 'manual');
  ASSERT v_result->'task'->'props' = '{"human":"new","agent":true}'::jsonb, 'fresh props did not save';
  -- Existing consumers that omit the guard retain their partial-update contract.
  v_result := public.onto_task_update_atomic('13200000-0000-4000-8000-000000000003', '{"title":"Legacy caller"}', false, NULL, NULL, 'manual');
  ASSERT v_result->'task'->>'title' = 'Legacy caller', 'legacy call broke';
  ASSERT NOT has_function_privilege('anon', 'public.onto_task_update_atomic(uuid,jsonb,boolean,uuid[],uuid,text)', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.onto_task_update_atomic(uuid,jsonb,boolean,uuid[],uuid,text)', 'EXECUTE');
END $$;
ROLLBACK;
