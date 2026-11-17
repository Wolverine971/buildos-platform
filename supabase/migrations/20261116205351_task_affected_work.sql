-- Read-only task impact prototype. Graph storage stays in onto_tasks/onto_edges.
-- Breadth-first expansion retains one shortest explanation per task; the visited
-- set prevents cycles and repeated paths from growing the working set exponentially.
BEGIN;

CREATE OR REPLACE FUNCTION public.onto_task_affected_work(
    p_task_id uuid,
    p_max_depth integer DEFAULT 3,
    p_max_tasks integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_source record;
    v_frontier jsonb;
    v_next jsonb;
    v_tasks jsonb := '[]'::jsonb;
    v_seen uuid[];
    v_depth integer;
    v_remaining integer;
    v_reasons text[] := ARRAY[]::text[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_task_id IS NULL OR p_max_depth IS NULL OR p_max_tasks IS NULL
       OR p_max_depth NOT BETWEEN 1 AND 6 OR p_max_tasks NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Expected task id, max_depth 1..6 and max_tasks 1..100'
            USING ERRCODE = '22023';
    END IF;

    -- RLS remains active. The standard owner/member/admin access helper also
    -- excludes public-project access without an authorized project role.
    SELECT t.id, t.title, t.project_id INTO v_source
    FROM public.onto_tasks t
    JOIN public.onto_projects p ON p.id = t.project_id
    WHERE t.id = p_task_id
      AND t.deleted_at IS NULL AND t.archived_at IS NULL
      AND t.state_key::text <> 'archived'
      AND p.deleted_at IS NULL AND p.archived_at IS NULL
      AND p.merged_into_project_id IS NULL
      AND public.current_actor_has_project_member_access(t.project_id, 'read');

    IF NOT FOUND THEN
        RETURN NULL; -- Unavailable and unauthorized IDs are indistinguishable.
    END IF;

    v_seen := ARRAY[v_source.id];
    v_frontier := jsonb_build_array(jsonb_build_object(
        'id', v_source.id,
        'path', jsonb_build_array(jsonb_build_object(
            'task_id', v_source.id, 'title', v_source.title)),
        'edge_ids', '[]'::jsonb,
        'relations', '[]'::jsonb
    ));

    -- The extra layer probes whether the depth boundary actually omits work.
    -- At most 100 tasks are retained, plus one overflow candidate. No temp tables,
    -- writes, external calls, dynamic SQL, or unbounded enumeration of paths.
    FOR v_depth IN 1..(p_max_depth + 1) LOOP
        v_remaining := p_max_tasks - jsonb_array_length(v_tasks);
        WITH candidates AS (
            SELECT DISTINCT ON (t.id)
                t.id, t.title, t.state_key, t.due_at,
                v_depth AS distance,
                f.path || jsonb_build_array(jsonb_build_object(
                    'task_id', t.id, 'title', t.title)) AS path,
                f.edge_ids || jsonb_build_array(e.id) AS edge_ids,
                f.relations || jsonb_build_array(e.rel) AS relations
            FROM jsonb_to_recordset(v_frontier)
                AS f(id uuid, path jsonb, edge_ids jsonb, relations jsonb)
            CROSS JOIN LATERAL (
                -- B depends_on A means changing A can affect B: walk backwards.
                SELECT edge.id, edge.rel, edge.src_id AS next_id
                FROM public.onto_edges edge
                WHERE edge.project_id = v_source.project_id
                  AND edge.src_kind = 'task' AND edge.dst_kind = 'task'
                  AND edge.dst_id = f.id
                  AND edge.rel IN ('depends_on', 'requires', 'blocked_by', 'builds_on')
                UNION ALL
                -- A blocks B expresses the same impact direction directly.
                SELECT edge.id, edge.rel, edge.dst_id AS next_id
                FROM public.onto_edges edge
                WHERE edge.project_id = v_source.project_id
                  AND edge.src_kind = 'task' AND edge.dst_kind = 'task'
                  AND edge.src_id = f.id AND edge.rel = 'blocks'
            ) e
            JOIN public.onto_tasks t ON t.id = e.next_id
                AND t.project_id = v_source.project_id
            WHERE NOT (t.id = ANY(v_seen))
              AND t.deleted_at IS NULL AND t.archived_at IS NULL
              AND t.completed_at IS NULL
              AND t.state_key::text NOT IN ('done', 'complete', 'completed', 'cancelled', 'canceled', 'archived')
            -- Equal-length paths use stable IDs, not titles that may be edited.
            ORDER BY t.id, f.id, e.id
        )
        SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb)
        INTO v_next
        FROM (SELECT * FROM candidates ORDER BY id LIMIT v_remaining + 1) c;

        EXIT WHEN jsonb_array_length(v_next) = 0;
        IF v_depth > p_max_depth THEN
            v_reasons := array_append(v_reasons, 'depth');
            IF v_remaining = 0 THEN
                v_reasons := array_append(v_reasons, 'tasks');
            END IF;
            EXIT;
        END IF;

        IF jsonb_array_length(v_next) > v_remaining THEN
            v_reasons := array_append(v_reasons, 'tasks');
            SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb) INTO v_next
            FROM jsonb_array_elements(v_next) WITH ORDINALITY AS x(value, ord)
            WHERE ord <= v_remaining;
        END IF;

        v_tasks := v_tasks || v_next;
        EXIT WHEN cardinality(v_reasons) > 0;
        SELECT v_seen || COALESCE(array_agg((value->>'id')::uuid), ARRAY[]::uuid[])
            INTO v_seen FROM jsonb_array_elements(v_next);
        v_frontier := v_next;
    END LOOP;

    RETURN jsonb_build_object(
        'source_task', jsonb_build_object(
            'id', v_source.id, 'title', v_source.title, 'project_id', v_source.project_id),
        'tasks', v_tasks,
        'limits', jsonb_build_object('max_depth', p_max_depth, 'max_tasks', p_max_tasks),
        'truncated', cardinality(v_reasons) > 0,
        'truncation_reasons', to_jsonb(v_reasons)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.onto_task_affected_work(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_affected_work(uuid, integer, integer)
    TO authenticated, service_role;
COMMENT ON FUNCTION public.onto_task_affected_work(uuid, integer, integer) IS
    'Read-only, membership-scoped downstream open task dependencies; bounded BFS, shortest evidence paths, explicit truncation. Requires an authenticated user identity.';

COMMIT;
