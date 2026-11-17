-- Run on the disposable production-schema rehearsal, never seed production.
BEGIN;
DO $$
#variable_conflict use_variable
DECLARE
    owner_id uuid := 'a16a0000-0000-4000-8000-000000000001';
    reader_id uuid := 'a16a0000-0000-4000-8000-000000000002';
    outsider_id uuid := 'a16a0000-0000-4000-8000-000000000003';
    owner_actor uuid;
    reader_actor uuid;
    outsider_actor uuid;
    project_id uuid := 'a16a0000-0000-4000-8000-000000000010';
    foreign_project uuid := 'a16a0000-0000-4000-8000-000000000011';
    payload jsonb;
    ids text[];
BEGIN
    INSERT INTO auth.users(id, email) VALUES
        (owner_id, 'affected-owner@example.com'),
        (reader_id, 'affected-reader@example.com'),
        (outsider_id, 'affected-outsider@example.com');
    INSERT INTO public.users(id, email) VALUES
        (owner_id, 'affected-owner@example.com'),
        (reader_id, 'affected-reader@example.com'),
        (outsider_id, 'affected-outsider@example.com') ON CONFLICT (id) DO NOTHING;
    owner_actor := public.ensure_actor_for_user(owner_id);
    reader_actor := public.ensure_actor_for_user(reader_id);
    outsider_actor := public.ensure_actor_for_user(outsider_id);
    INSERT INTO public.onto_projects(id, name, type_key, created_by, state_key, is_public) VALUES
        (project_id, 'Affected work fixture', 'project.default', owner_actor, 'active', true),
        (foreign_project, 'Unrelated fixture', 'project.default', outsider_actor, 'active', false);
    INSERT INTO public.onto_project_members(project_id, actor_id, role_key, access) VALUES
        (project_id, owner_actor, 'owner', 'admin'),
        (project_id, reader_actor, 'viewer', 'read'),
        (foreign_project, outsider_actor, 'owner', 'admin') ON CONFLICT DO NOTHING;

    INSERT INTO public.onto_tasks(id, project_id, title, state_key, created_by)
    SELECT md5('affected-' || name)::uuid, project_id, name, 'todo', owner_actor
    FROM unnest(ARRAY['source', 'design', 'build', 'test', 'launch', 'reference',
        'archived', 'behind-archive', 'done', 'behind-done', 'completed-at',
        'deleted', 'behind-deleted', 'legacy', 'upstream', 'isolated']) AS name;
    INSERT INTO public.onto_tasks(id, project_id, title, state_key, created_by)
    VALUES (md5('affected-foreign')::uuid, foreign_project, 'foreign', 'todo', outsider_actor);
    UPDATE public.onto_tasks SET archived_at = now() WHERE title = 'archived' AND onto_tasks.project_id = project_id;
    UPDATE public.onto_tasks SET deleted_at = now() WHERE title = 'deleted' AND onto_tasks.project_id = project_id;
    UPDATE public.onto_tasks SET state_key = 'done' WHERE title = 'done' AND onto_tasks.project_id = project_id;
    UPDATE public.onto_tasks SET completed_at = now() WHERE title = 'completed-at' AND onto_tasks.project_id = project_id;

    INSERT INTO public.onto_edges(project_id, src_kind, src_id, rel, dst_kind, dst_id)
    SELECT project_id, 'task', md5('affected-' || src)::uuid, rel, 'task', md5('affected-' || dst)::uuid
    FROM (VALUES
        ('design', 'depends_on', 'source'),
        ('source', 'blocks', 'build'),
        ('test', 'requires', 'design'),
        ('test', 'depends_on', 'build'), -- diamond; test must appear once
        ('launch', 'depends_on', 'test'),
        ('source', 'depends_on', 'launch'), -- cycle; source must never reappear
        ('source', 'depends_on', 'upstream'), -- do not walk upstream
        ('reference', 'references', 'source'),
        ('archived', 'depends_on', 'source'),
        ('behind-archive', 'depends_on', 'archived'),
        ('done', 'depends_on', 'source'),
        ('behind-done', 'depends_on', 'done'),
        ('completed-at', 'depends_on', 'source'),
        ('deleted', 'depends_on', 'source'),
        ('behind-deleted', 'depends_on', 'deleted'),
        ('legacy', 'blocked_by', 'source')
    ) x(src, rel, dst);
    -- Production's existing trigger refuses malformed cross-project edges.
    BEGIN
        INSERT INTO public.onto_edges(project_id, src_kind, src_id, rel, dst_kind, dst_id)
        VALUES (project_id, 'task', md5('affected-foreign')::uuid,
            'depends_on', 'task', md5('affected-source')::uuid);
        RAISE EXCEPTION 'Cross-project edge unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', reader_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    payload := public.onto_task_affected_work(md5('affected-source')::uuid, 3, 50);
    SELECT array_agg(value->>'title' ORDER BY value->>'title') INTO ids
        FROM jsonb_array_elements(payload->'tasks');
    IF ids IS DISTINCT FROM ARRAY['build', 'design', 'launch', 'legacy', 'test'] THEN
        RAISE EXCEPTION 'Wrong affected tasks: %', payload;
    END IF;
    IF (payload->>'truncated')::boolean THEN
        RAISE EXCEPTION 'Complete graph wrongly marked truncated: %', payload;
    END IF;
    IF NOT EXISTS (SELECT FROM jsonb_array_elements(payload->'tasks') t
        WHERE t->>'title' = 'test' AND (t->>'distance')::integer = 2
          AND jsonb_array_length(t->'path') = 3 AND jsonb_array_length(t->'edge_ids') = 2
          AND jsonb_array_length(t->'relations') = 2
          AND t->'path'->0->>'task_id' = md5('affected-source')::uuid::text
          AND t->'path'->2->>'task_id' = md5('affected-test')::uuid::text) THEN
        RAISE EXCEPTION 'Shortest explanation path missing: %', payload;
    END IF;
    IF payload IS DISTINCT FROM public.onto_task_affected_work(md5('affected-source')::uuid, 3, 50) THEN
        RAISE EXCEPTION 'Repeated traversal must be deterministic';
    END IF;

    payload := public.onto_task_affected_work(md5('affected-source')::uuid, 1, 50);
    IF jsonb_array_length(payload->'tasks') <> 3 OR payload->'truncation_reasons' <> '["depth"]'::jsonb THEN
        RAISE EXCEPTION 'Depth limit must report partial work: %', payload;
    END IF;
    payload := public.onto_task_affected_work(md5('affected-source')::uuid, 6, 1);
    IF jsonb_array_length(payload->'tasks') <> 1 OR payload->'truncation_reasons' <> '["tasks"]'::jsonb THEN
        RAISE EXCEPTION 'Task budget not enforced: %', payload;
    END IF;
    payload := public.onto_task_affected_work(md5('affected-source')::uuid, 6, 5);
    IF jsonb_array_length(payload->'tasks') <> 5 OR (payload->>'truncated')::boolean THEN
        RAISE EXCEPTION 'Exactly exhausted graph should not be partial: %', payload;
    END IF;
    payload := public.onto_task_affected_work(md5('affected-isolated')::uuid, 1, 1);
    IF payload->'tasks' <> '[]'::jsonb OR (payload->>'truncated')::boolean THEN
        RAISE EXCEPTION 'Isolated task must have a complete empty result: %', payload;
    END IF;
    IF public.onto_task_affected_work(md5('affected-archived')::uuid) IS NOT NULL
       OR public.onto_task_affected_work(md5('affected-foreign')::uuid) IS NOT NULL
       OR public.onto_task_affected_work(md5('affected-missing')::uuid) IS NOT NULL THEN
        RAISE EXCEPTION 'Archived, foreign, or missing seed exposed';
    END IF;
    BEGIN
        PERFORM public.onto_task_affected_work(md5('affected-source')::uuid, 7, 50);
        RAISE EXCEPTION 'Oversized depth accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.onto_task_affected_work(md5('affected-source')::uuid, 3, 101);
        RAISE EXCEPTION 'Oversized task budget accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', outsider_id, 'role', 'authenticated')::text, true);
    IF public.onto_task_affected_work(md5('affected-source')::uuid) IS NOT NULL THEN
        RAISE EXCEPTION 'Public visibility must not replace project membership';
    END IF;
    RESET ROLE;
    IF has_function_privilege('anon', 'public.onto_task_affected_work(uuid,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Anonymous execution granted';
    END IF;
    UPDATE public.onto_projects SET archived_at = now() WHERE id = project_id;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF public.onto_task_affected_work(md5('affected-source')::uuid) IS NOT NULL THEN
        RAISE EXCEPTION 'Archived project exposed';
    END IF;
    RESET ROLE;
    RAISE NOTICE 'Affected work: direction, paths, cycles, limits, visibility, membership and grants passed';
END;
$$;
ROLLBACK;
