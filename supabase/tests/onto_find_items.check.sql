-- supabase/tests/onto_find_items.check.sql
-- Tasker 159: onto_find_items (Workspace search, the instant word-match lane). Seeds one
-- person with a project, a Workspace, a project shared with them, a stranger's project and an
-- archived project, then asserts as that person's session:
--   - every word is a prefix ("gunsm" finds "gunsmith"), and a title matches on part of a word
--   - the Workspace's notes come back flagged in_workspace, matched inside their text, with a
--     marked snippet
--   - a shared project's records come back; a stranger's, an archived project's, and archived,
--     deleted or tree-archived records never do
--   - with no signed-in person it returns nothing
-- Run with:
--   pnpm db:rehearse supabase/migrations/20261115153000_onto_find_items.sql \
--     --check supabase/tests/onto_find_items.check.sql
BEGIN;
DO $$
DECLARE
  v_user uuid := 'f1590000-0000-4000-8000-000000000001';
  v_actor uuid := 'f1590000-0000-4000-8000-000000000002';
  v_other_user uuid := 'f1590000-0000-4000-8000-000000000003';
  v_other uuid := 'f1590000-0000-4000-8000-000000000004';
  v_project uuid := 'f1590000-0000-4000-8000-000000000010';
  v_workspace uuid := 'f1590000-0000-4000-8000-000000000011';
  v_shared uuid := 'f1590000-0000-4000-8000-000000000012';
  v_stranger uuid := 'f1590000-0000-4000-8000-000000000013';
  v_archived_project uuid := 'f1590000-0000-4000-8000-000000000014';
  v_task uuid := 'f1590000-0000-4000-8000-000000000020';
  v_task_archived uuid := 'f1590000-0000-4000-8000-000000000021';
  v_task_deleted uuid := 'f1590000-0000-4000-8000-000000000022';
  v_doc_tree_archived uuid := 'f1590000-0000-4000-8000-000000000023';
  v_note uuid := 'f1590000-0000-4000-8000-000000000024';
  v_task_shared uuid := 'f1590000-0000-4000-8000-000000000025';
  v_task_stranger uuid := 'f1590000-0000-4000-8000-000000000026';
  v_task_in_archived uuid := 'f1590000-0000-4000-8000-000000000027';
  v_goal uuid := 'f1590000-0000-4000-8000-000000000028';
  v_ids uuid[];
  v_row record;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'find-items@example.com'), (v_other_user, 'find-items-other@example.com');
  INSERT INTO public.users (id, email) VALUES
    (v_user, 'find-items@example.com'), (v_other_user, 'find-items-other@example.com')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
    (v_actor, 'human', 'Finder', v_user), (v_other, 'human', 'Other', v_other_user)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_actor FROM public.onto_actors WHERE user_id = v_user;
  SELECT id INTO v_other FROM public.onto_actors WHERE user_id = v_other_user;

  INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key, archived_at) VALUES
    (v_project, 'Range Day Logistics', 'project.default', v_actor, 'active', NULL),
    (v_shared, 'Shared Club Website', 'project.default', v_other, 'active', NULL),
    (v_stranger, 'Stranger Things Plans', 'project.default', v_other, 'active', NULL),
    (v_archived_project, 'Old Range Plans', 'project.default', v_actor, 'active', now() - interval '3 days');
  INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key, kind)
    VALUES (v_workspace, 'Workspace', 'project.default', v_actor, 'active', 'workspace');
  INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
    (v_project, v_actor, 'owner', 'admin'),
    (v_workspace, v_actor, 'owner', 'admin'),
    (v_archived_project, v_actor, 'owner', 'admin'),
    (v_shared, v_other, 'owner', 'admin'),
    (v_shared, v_actor, 'viewer', 'read'),
    (v_stranger, v_other, 'owner', 'admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.onto_tasks (id, project_id, title, description, state_key, created_by, archived_at, deleted_at) VALUES
    (v_task, v_project, 'Call the gunsmith back about the action', 'Ask whether he can pin the scope base too.', 'todo', v_actor, NULL, NULL),
    (v_task_archived, v_project, 'Gunsmith archived task', NULL, 'todo', v_actor, now() - interval '1 day', NULL),
    (v_task_deleted, v_project, 'Gunsmith deleted task', NULL, 'todo', v_actor, now() - interval '1 day', now() - interval '1 day'),
    (v_task_shared, v_shared, 'Gunsmith page for the club', NULL, 'todo', v_other, NULL, NULL),
    (v_task_stranger, v_stranger, 'Gunsmith stranger task', NULL, 'todo', v_other, NULL, NULL),
    (v_task_in_archived, v_archived_project, 'Gunsmith in an archived project', NULL, 'todo', v_actor, NULL, NULL);
  INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, content, created_by) VALUES
    (v_doc_tree_archived, v_project, 'Gunsmith tree archived doc', 'document.default', 'archived', 'gunsmith notes', v_actor),
    (v_note, v_workspace, 'Gift list', 'document.note', 'draft',
      'Hallie: the dollhouse furniture set. Mom: a framed print of the lake house. Logan: range bag.', v_actor);
  INSERT INTO public.onto_goals (id, project_id, name, state_key, created_by) VALUES
    (v_goal, v_project, 'Book the range for December', 'active', v_actor);

  -- Signed in as the person.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- Prefix: "gunsm" finds the live task and the shared one, nothing archived or foreign.
  SELECT coalesce(array_agg(r.id), ARRAY[]::uuid[]) INTO v_ids FROM public.onto_find_items('gunsm') r;
  IF NOT (v_task = ANY (v_ids)) THEN
    v_failures := v_failures || 'prefix: the live task is missing';
  END IF;
  IF NOT (v_task_shared = ANY (v_ids)) THEN
    v_failures := v_failures || 'prefix: the shared project''s task is missing';
  END IF;
  IF v_ids && ARRAY[v_task_archived, v_task_deleted, v_doc_tree_archived, v_task_stranger, v_task_in_archived] THEN
    v_failures := v_failures || ('prefix: returned an archived, deleted or foreign record: ' || v_ids::text);
  END IF;

  -- Part of a word in a title.
  SELECT coalesce(array_agg(r.id), ARRAY[]::uuid[]) INTO v_ids FROM public.onto_find_items('smith') r;
  IF NOT (v_task = ANY (v_ids)) THEN
    v_failures := v_failures || 'title part-of-word: "smith" did not find the gunsmith task';
  END IF;

  -- Note text, in the Workspace, with a marked snippet.
  SELECT r.* INTO v_row FROM public.onto_find_items('lake hou') r WHERE r.id = v_note;
  IF v_row.id IS NULL THEN
    v_failures := v_failures || 'note text: "lake hou" did not find the Workspace note';
  ELSIF NOT v_row.in_workspace THEN
    v_failures := v_failures || 'note text: the Workspace note is not flagged in_workspace';
  ELSIF v_row.snippet IS NULL OR position(chr(2) IN v_row.snippet) = 0 THEN
    v_failures := v_failures || ('note text: snippet has no marked match: ' || coalesce(v_row.snippet, '<null>'));
  END IF;

  -- Projects by name; the archived project and the Workspace itself never.
  SELECT coalesce(array_agg(r.id), ARRAY[]::uuid[]) INTO v_ids FROM public.onto_find_items('range') r WHERE r.kind = 'project';
  IF NOT (v_project = ANY (v_ids)) THEN
    v_failures := v_failures || 'projects: "range" did not find the project';
  END IF;
  IF v_archived_project = ANY (v_ids) THEN
    v_failures := v_failures || 'projects: returned the archived project';
  END IF;
  SELECT coalesce(array_agg(r.id), ARRAY[]::uuid[]) INTO v_ids FROM public.onto_find_items('workspace') r WHERE r.kind = 'project';
  IF v_workspace = ANY (v_ids) THEN
    v_failures := v_failures || 'projects: returned the Workspace as a project';
  END IF;

  -- Goals.
  SELECT coalesce(array_agg(r.id), ARRAY[]::uuid[]) INTO v_ids FROM public.onto_find_items('decem') r;
  IF NOT (v_goal = ANY (v_ids)) THEN
    v_failures := v_failures || 'goals: "decem" did not find the goal';
  END IF;

  -- Stop words and single characters alone search for nothing.
  IF EXISTS (SELECT 1 FROM public.onto_find_items('a')) THEN
    v_failures := v_failures || 'tokens: a single character returned rows';
  END IF;

  -- No signed-in person: nothing.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF EXISTS (SELECT 1 FROM public.onto_find_items('gunsm')) THEN
    v_failures := v_failures || 'anon: returned rows without a signed-in person';
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION 'onto_find_items check failed: %', array_to_string(v_failures, '; ');
  END IF;
  RAISE NOTICE 'onto_find_items check passed';
END;
$$;
ROLLBACK;
