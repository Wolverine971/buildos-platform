-- supabase/tests/archived_scope_guard.check.sql
-- Tasker 113 guard: no chat context or search RPC returns an archived record. It seeds one
-- project with live, finished and archived rows in every archive form, then asserts that no
-- archived id appears in any mode of the packet, the digest, or either search. Run with:
--   pnpm db:rehearse supabase/migrations/20260929150000_chat_reads_exclude_archived.sql \
--     --check supabase/tests/archived_scope_guard.check.sql
-- Archive forms: a task archived on the board (deleted_at + archived_at), a record archived
-- through the connector before tasker 113 (archived_at only), and a document archived from
-- the tree (state_key 'archived', archived_at NULL).
DO $$
DECLARE
  v_user uuid := 'a1130000-0000-4000-8000-000000000001';
  v_actor uuid := 'a1130000-0000-4000-8000-000000000002';
  v_project uuid := 'a1130000-0000-4000-8000-000000000003';
  -- live, and expected back
  v_task_live uuid := 'a1130000-0000-4000-8000-000000000010';
  v_goal_live uuid := 'a1130000-0000-4000-8000-000000000011';
  v_plan_live uuid := 'a1130000-0000-4000-8000-000000000012';
  v_milestone_live uuid := 'a1130000-0000-4000-8000-000000000013';
  v_risk_live uuid := 'a1130000-0000-4000-8000-000000000014';
  v_doc_live uuid := 'a1130000-0000-4000-8000-000000000015';
  v_event_live uuid := 'a1130000-0000-4000-8000-000000000016';
  -- archived or deleted, and never expected back
  v_task_connector uuid := 'a1130000-0000-4000-8000-000000000020';
  v_task_board uuid := 'a1130000-0000-4000-8000-000000000021';
  v_goal_archived uuid := 'a1130000-0000-4000-8000-000000000022';
  v_plan_archived uuid := 'a1130000-0000-4000-8000-000000000023';
  v_milestone_archived uuid := 'a1130000-0000-4000-8000-000000000024';
  v_risk_archived uuid := 'a1130000-0000-4000-8000-000000000025';
  v_doc_archived_at uuid := 'a1130000-0000-4000-8000-000000000026';
  v_doc_state_archived uuid := 'a1130000-0000-4000-8000-000000000027';
  v_event_of_archived_task uuid := 'a1130000-0000-4000-8000-000000000028';
  v_archived uuid[];
  v_vec vector;
  v_out text;
  v_leaks text;
  v_mode text;
BEGIN
  v_archived := ARRAY[v_task_connector, v_task_board, v_goal_archived, v_plan_archived,
    v_milestone_archived, v_risk_archived, v_doc_archived_at, v_doc_state_archived,
    v_event_of_archived_task];
  v_vec := array_fill(0.1::real, ARRAY[1536])::vector;

  INSERT INTO auth.users (id, email) VALUES (v_user, 'archived-guard@example.com');
  INSERT INTO public.users (id, email) VALUES (v_user, 'archived-guard@example.com')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.onto_actors (id, kind, name, user_id)
    VALUES (v_actor, 'human', 'Guard', v_user)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_actor FROM public.onto_actors WHERE user_id = v_user;
  INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key)
    VALUES (v_project, 'Zephyr guard project', 'project.default', v_actor, 'active');
  INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access)
    VALUES (v_project, v_actor, 'owner', 'admin')
    ON CONFLICT DO NOTHING;

  -- Tasks: overdue live work next to archived "todo" work that is even more overdue.
  INSERT INTO public.onto_tasks (id, project_id, title, state_key, due_at, created_by, archived_at, deleted_at) VALUES
    (v_task_live, v_project, 'Zephyr live task', 'todo', now() - interval '1 day', v_actor, NULL, NULL),
    (v_task_connector, v_project, 'Zephyr connector archived task', 'todo', now() - interval '200 days', v_actor, now() - interval '90 days', NULL),
    (v_task_board, v_project, 'Zephyr board archived task', 'in_progress', now() - interval '150 days', v_actor, now() - interval '90 days', now() - interval '90 days');
  INSERT INTO public.onto_goals (id, project_id, name, state_key, target_date, created_by, archived_at) VALUES
    (v_goal_live, v_project, 'Zephyr live goal', 'active', now() + interval '3 days', v_actor, NULL),
    (v_goal_archived, v_project, 'Zephyr archived goal', 'active', now() - interval '30 days', v_actor, now() - interval '10 days');
  INSERT INTO public.onto_plans (id, project_id, name, type_key, state_key, created_by, archived_at) VALUES
    (v_plan_live, v_project, 'Zephyr live plan', 'plan.default', 'active', v_actor, NULL),
    (v_plan_archived, v_project, 'Zephyr archived plan', 'plan.default', 'active', v_actor, now() - interval '10 days');
  INSERT INTO public.onto_milestones (id, project_id, title, state_key, due_at, created_by, archived_at) VALUES
    (v_milestone_live, v_project, 'Zephyr live milestone', 'pending', now() + interval '2 days', v_actor, NULL),
    (v_milestone_archived, v_project, 'Zephyr archived milestone', 'pending', now() - interval '20 days', v_actor, now() - interval '10 days');
  INSERT INTO public.onto_risks (id, project_id, title, state_key, created_by, archived_at) VALUES
    (v_risk_live, v_project, 'Zephyr live risk', 'identified', v_actor, NULL),
    (v_risk_archived, v_project, 'Zephyr archived risk', 'identified', v_actor, now() - interval '10 days');
  INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, created_by, archived_at) VALUES
    (v_doc_live, v_project, 'Zephyr live document', 'document.default', 'draft', v_actor, NULL),
    (v_doc_archived_at, v_project, 'Zephyr connector archived document', 'document.default', 'draft', v_actor, now() - interval '10 days'),
    (v_doc_state_archived, v_project, 'Zephyr tree archived document', 'document.default', 'archived', v_actor, NULL);
  INSERT INTO public.onto_events (id, project_id, title, type_key, start_at, end_at, created_by, owner_entity_type, owner_entity_id) VALUES
    (v_event_live, v_project, 'Due: Zephyr live task', 'event.task_due', now() + interval '1 day', now() + interval '1 day 30 minutes', v_actor, 'task', v_task_live),
    (v_event_of_archived_task, v_project, 'Due: Zephyr connector archived task', 'event.task_due', now() + interval '2 days', now() + interval '2 days 30 minutes', v_actor, 'task', v_task_connector);

  -- The focused live task links to archived records.
  INSERT INTO public.onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id) VALUES
    (v_project, 'task', v_task_live, 'supports_goal', 'goal', v_goal_archived),
    (v_project, 'task', v_task_live, 'references', 'document', v_doc_archived_at),
    (v_project, 'task', v_task_live, 'references', 'document', v_doc_state_archived),
    (v_project, 'task', v_task_live, 'relates_to', 'task', v_task_connector);

  -- Every row matches the query embedding exactly (similarity 1).
  INSERT INTO public.onto_embeddings (project_id, entity_type, entity_id, content_text, content_hash, embedding)
  SELECT v_project, kind, id, 'Zephyr ' || kind, md5(id::text), v_vec
  FROM (VALUES
    ('task', v_task_live), ('task', v_task_connector), ('task', v_task_board),
    ('goal', v_goal_live), ('goal', v_goal_archived), ('plan', v_plan_live), ('plan', v_plan_archived),
    ('milestone', v_milestone_live), ('milestone', v_milestone_archived),
    ('risk', v_risk_live), ('risk', v_risk_archived),
    ('document', v_doc_live), ('document', v_doc_archived_at), ('document', v_doc_state_archived),
    ('event', v_event_live), ('event', v_event_of_archived_task)
  ) AS seeded(kind, id);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR v_mode, v_out IN
    SELECT 'packet:project', public.load_fastchat_context('project', v_user, v_project, NULL, NULL)::text
    UNION ALL
    SELECT 'packet:global', public.load_fastchat_context('global', v_user, NULL, NULL, NULL)::text
    UNION ALL
    -- Edges carry only ids and kinds; the linked records themselves must stay out.
    SELECT 'packet:focus', (public.load_fastchat_context('project', v_user, v_project, 'task', v_task_live) - 'linked_edges')::text
    UNION ALL
    SELECT 'digest:project', public.build_fastchat_project_intelligence('project', v_user, v_project)::text
    UNION ALL
    SELECT 'digest:global', public.build_fastchat_project_intelligence('global', v_user, NULL)::text
    UNION ALL
    SELECT 'search:keyword', (SELECT jsonb_agg(to_jsonb(r))::text FROM public.onto_search_entities(v_actor, 'Zephyr', v_project, NULL, 100) r)
    UNION ALL
    SELECT 'search:semantic', (SELECT jsonb_agg(to_jsonb(r))::text FROM public.onto_search_semantic(v_actor, v_vec, v_project, NULL, 100, 0.1) r)
  LOOP
    SELECT string_agg(id::text, ', ') INTO v_leaks
    FROM unnest(v_archived) AS id
    WHERE position(id::text IN coalesce(v_out, '')) > 0;
    ASSERT v_leaks IS NULL, v_mode || ' returned archived or deleted records: ' || v_leaks;
    -- Not vacuous: the live overdue task comes back in every mode that lists tasks.
    ASSERT position(v_task_live::text IN coalesce(v_out, '')) > 0,
      v_mode || ' did not return the live task, so the guard proves nothing';
  END LOOP;

  -- The packet still counts and lists every live kind it carries.
  v_out := public.load_fastchat_context('project', v_user, v_project, NULL, NULL)::text;
  ASSERT position(v_goal_live::text IN v_out) > 0, 'packet lost the live goal';
  ASSERT position(v_plan_live::text IN v_out) > 0, 'packet lost the live plan';
  ASSERT position(v_milestone_live::text IN v_out) > 0, 'packet lost the live milestone';
  ASSERT position(v_doc_live::text IN v_out) > 0, 'packet lost the live document';
  ASSERT position(v_event_live::text IN v_out) > 0, 'packet lost the live event';

  -- Opening chat on an archived record is an explicit choice: the focus itself still loads,
  -- and it carries archived_at.
  v_out := (public.load_fastchat_context('project', v_user, v_project, 'goal', v_goal_archived) -> 'focus_entity_full')::text;
  ASSERT position(v_goal_archived::text IN coalesce(v_out, '')) > 0, 'an archived focus record no longer loads';
  ASSERT (v_out::jsonb ->> 'archived_at') IS NOT NULL, 'an archived focus record lost its archived_at';
END $$;
