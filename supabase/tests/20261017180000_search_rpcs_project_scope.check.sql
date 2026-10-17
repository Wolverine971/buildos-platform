-- supabase/tests/20261017180000_search_rpcs_project_scope.check.sql
-- Audit 2026-10-17 S4 + B12: onto_search_semantic ranks only the caller's projects. Run with:
--   pnpm db:rehearse supabase/migrations/20261017180000_search_rpcs_project_scope.sql \
--     --check supabase/tests/20261017180000_search_rpcs_project_scope.check.sql
-- Another user's 500 chunks sit closer to the query than anything of ours. The old function
-- took the global top 400 (all theirs) before the project filter and returned nothing for us.
-- Seeds roll back at the end.
BEGIN;

DO $$
DECLARE
  v_user_a uuid := 'a1170000-0000-4000-8000-000000000001';
  v_actor_a uuid := 'a1170000-0000-4000-8000-000000000002';
  v_user_b uuid := 'a1170000-0000-4000-8000-000000000003';
  v_actor_b uuid := 'a1170000-0000-4000-8000-000000000004';
  v_small uuid := 'a1170000-0000-4000-8000-000000000010';  -- A: 5 tasks, similarity ~0.89
  v_large uuid := 'a1170000-0000-4000-8000-000000000011';  -- A: 3 tasks x 1,667 chunks, ~0.61
  v_other uuid := 'a1170000-0000-4000-8000-000000000012';  -- B: 500 chunks, ~0.9995
  v_small_tasks uuid[] := ARRAY[
    'a1170000-0000-4000-8000-000000000020', 'a1170000-0000-4000-8000-000000000021',
    'a1170000-0000-4000-8000-000000000022', 'a1170000-0000-4000-8000-000000000023',
    'a1170000-0000-4000-8000-000000000024']::uuid[];
  v_large_tasks uuid[] := ARRAY[
    'a1170000-0000-4000-8000-000000000030', 'a1170000-0000-4000-8000-000000000031',
    'a1170000-0000-4000-8000-000000000032']::uuid[];
  v_other_tasks uuid[] := ARRAY[
    'a1170000-0000-4000-8000-000000000040', 'a1170000-0000-4000-8000-000000000041',
    'a1170000-0000-4000-8000-000000000042', 'a1170000-0000-4000-8000-000000000043',
    'a1170000-0000-4000-8000-000000000044']::uuid[];
  v_q vector;
  v_ids uuid[];
  v_n integer;
  v_out_of_scope integer;
BEGIN
  -- Query = e1. A chunk e1 + c*r (r a random unit vector) has cosine similarity ~1/sqrt(1+c^2).
  v_q := (SELECT array_agg(CASE WHEN i = 1 THEN 1.0 ELSE 0.0 END ORDER BY i) FROM generate_series(1, 1536) i)::vector;

  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'semantic-scope-a@example.com'), (v_user_b, 'semantic-scope-b@example.com');
  INSERT INTO public.users (id, email) VALUES
    (v_user_a, 'semantic-scope-a@example.com'), (v_user_b, 'semantic-scope-b@example.com')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
    (v_actor_a, 'human', 'Scope A', v_user_a), (v_actor_b, 'human', 'Scope B', v_user_b)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_actor_a FROM public.onto_actors WHERE user_id = v_user_a;
  SELECT id INTO v_actor_b FROM public.onto_actors WHERE user_id = v_user_b;

  INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
    (v_small, 'Scope small', 'project.default', v_actor_a, 'active'),
    (v_large, 'Scope large', 'project.default', v_actor_a, 'active'),
    (v_other, 'Scope other user', 'project.default', v_actor_b, 'active');
  INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
    (v_small, v_actor_a, 'owner', 'admin'), (v_large, v_actor_a, 'owner', 'admin'),
    (v_other, v_actor_b, 'owner', 'admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by)
  SELECT t, v_small, 'Small task ' || o, 'todo', v_actor_a FROM unnest(v_small_tasks) WITH ORDINALITY AS s(t, o);
  INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by)
  SELECT t, v_large, 'Large task ' || o, 'todo', v_actor_a FROM unnest(v_large_tasks) WITH ORDINALITY AS s(t, o);
  INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by)
  SELECT t, v_other, 'Other user task ' || o, 'todo', v_actor_b FROM unnest(v_other_tasks) WITH ORDINALITY AS s(t, o);

  -- Component (random()-0.5)*0.0884 makes r roughly unit length across 1,535 dimensions.
  INSERT INTO public.onto_embeddings (project_id, entity_type, entity_id, chunk_index, content_text, content_hash, embedding)
  SELECT v_other, 'task', v_other_tasks[1 + (g % 5)], g / 5, 'other user chunk', md5('other' || g),
    (SELECT array_agg(CASE WHEN i = 1 THEN 1.0 ELSE 0.03 * (random() - 0.5) * 0.0884 END ORDER BY i)
     FROM generate_series(1, 1536) i WHERE g IS NOT NULL)::vector
  FROM generate_series(0, 499) g;

  INSERT INTO public.onto_embeddings (project_id, entity_type, entity_id, chunk_index, content_text, content_hash, embedding)
  SELECT v_small, 'task', t, 0, 'small chunk', md5('small' || o),
    (SELECT array_agg(CASE WHEN i = 1 THEN 1.0 ELSE 0.5 * (random() - 0.5) * 0.0884 END ORDER BY i)
     FROM generate_series(1, 1536) i WHERE o IS NOT NULL)::vector
  FROM unnest(v_small_tasks) WITH ORDINALITY AS s(t, o);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 1. B12: a project search finds every in-project match although 500 nearer chunks belong
  --    to someone else (exact path, 5 chunks in scope).
  SELECT array_agg(r.id ORDER BY r.score DESC) INTO v_ids
  FROM public.onto_search_semantic(v_actor_a, v_q, v_small, NULL, 50, 0.2) r;
  ASSERT coalesce(cardinality(v_ids), 0) = 5,
    'project search returned ' || coalesce(cardinality(v_ids), 0) || ' of the 5 in-project tasks';
  ASSERT v_ids @> v_small_tasks AND v_small_tasks @> v_ids, 'project search returned the wrong rows';

  -- 2. The other user's project is unreadable to A and A's to them.
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_search_semantic(v_actor_a, v_q, v_other, NULL, 50, 0.1)),
    'A read another user''s project';
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_search_semantic(v_actor_b, v_q, v_small, NULL, 50, 0.1)),
    'B read A''s project';

  -- 3. Workspace search, exact path (5 chunks in scope): A's tasks, never B's.
  SELECT count(*), count(*) FILTER (WHERE r.project_id <> v_small) INTO v_n, v_out_of_scope
  FROM public.onto_search_semantic(v_actor_a, v_q, NULL, NULL, 50, 0.3) r;
  ASSERT v_n = 5 AND v_out_of_scope = 0,
    'workspace exact path returned ' || v_n || ' rows, ' || v_out_of_scope || ' outside A''s small project';

  -- 4. Large scope (5,006 chunks > 5,000): the HNSW iterative walk. ef_search 200 alone would
  --    stop inside B's 500 nearer chunks; iterative scan has to walk past them.
  INSERT INTO public.onto_embeddings (project_id, entity_type, entity_id, chunk_index, content_text, content_hash, embedding)
  SELECT v_large, 'task', v_large_tasks[1 + (g % 3)], g / 3, 'large chunk', md5('large' || g),
    (SELECT array_agg(CASE WHEN i = 1 THEN 1.0 ELSE 1.3 * (random() - 0.5) * 0.0884 END ORDER BY i)
     FROM generate_series(1, 1536) i WHERE g IS NOT NULL)::vector
  FROM generate_series(0, 5000) g;

  SELECT count(*), count(*) FILTER (WHERE c.embedding_id NOT IN (
      SELECT e.id FROM public.onto_embeddings e WHERE e.project_id IN (v_small, v_large)))
  INTO v_n, v_out_of_scope
  FROM private.onto_search_semantic_index_candidates(v_q, ARRAY[v_small, v_large], NULL, 400) c;
  ASSERT v_n = 400, 'iterative HNSW walk returned ' || v_n || ' of 400 in-scope candidates';
  ASSERT v_out_of_scope = 0, 'iterative HNSW walk returned ' || v_out_of_scope || ' out-of-scope chunks';

  SELECT array_agg(r.id ORDER BY r.score DESC), count(*) FILTER (WHERE r.project_id NOT IN (v_small, v_large))
  INTO v_ids, v_out_of_scope
  FROM public.onto_search_semantic(v_actor_a, v_q, NULL, NULL, 50, 0.3) r;
  ASSERT v_out_of_scope = 0, 'workspace HNSW path returned another user''s rows';
  ASSERT v_ids[1:5] @> v_small_tasks,
    'workspace HNSW path lost the 5 nearest in-scope tasks: ' || coalesce(v_ids::text, 'none');
  ASSERT v_ids @> v_large_tasks, 'workspace HNSW path lost the large project''s tasks';

  -- A type filter applies inside the walk: no goals are embedded, so nothing comes back.
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_search_semantic(v_actor_a, v_q, NULL, ARRAY['goal'], 50, 0.1)),
    'type filter leaked other types';

  -- 5. Grants: the public RPC keeps prod's ACL; the helper is server-only.
  ASSERT has_function_privilege('authenticated', 'public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision)', 'EXECUTE'),
    'authenticated lost EXECUTE on onto_search_semantic';
  ASSERT NOT has_function_privilege('anon', 'public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision)', 'EXECUTE'),
    'anon can execute onto_search_semantic';
  ASSERT NOT has_function_privilege('authenticated', 'private.onto_search_semantic_index_candidates(vector, uuid[], text[], integer)', 'EXECUTE'),
    'authenticated can execute the private candidate walk';
  ASSERT NOT has_function_privilege('anon', 'private.onto_search_semantic_index_candidates(vector, uuid[], text[], integer)', 'EXECUTE'),
    'anon can execute the private candidate walk';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision)'::regprocedure),
    'onto_search_semantic is no longer SECURITY DEFINER';
END $$;

ROLLBACK;
