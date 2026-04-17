-- supabase/migrations/20260430000002_onto_task_update_atomic.sql
--
-- Atomic task update + assignee sync.
--
-- Context: apps/web/src/routes/api/onto/tasks/[id]/+server.ts PATCH previously
-- performed the task UPDATE and the task-assignees sync as two independent
-- REST calls. A failure between those calls produced an inconsistent row:
-- task metadata advanced while the assignee set remained stale (or vice-
-- versa). This RPC wraps both writes in a single PL/pgSQL function so either
-- everything commits or nothing does.
--
-- Intentionally OUT of scope:
--  - Calendar event sync (external Google API — should stay eventually
--    consistent and retry independently).
--  - Edge auto-organization (multi-table, complex; runs post-commit and can
--    be retried by the caller without data divergence).
--
-- Security:
--  - SECURITY INVOKER: runs with the caller's privileges, so onto_tasks and
--    onto_task_assignees RLS still apply.
--  - We additionally assert current_actor_has_project_access(..., 'write')
--    defensively — RLS already denies, but an explicit `access_denied`
--    raises a clearer error for callers than a silent zero-rows update.

create or replace function public.onto_task_update_atomic(
    p_task_id uuid,
    p_updates jsonb,
    p_sync_assignees boolean,
    p_assignee_actor_ids uuid[],
    p_assigned_by_actor_id uuid,
    p_source text default 'manual'
)
returns jsonb
language plpgsql
security invoker
as $$
declare
    v_project_id uuid;
    v_task public.onto_tasks;
    v_existing_ids uuid[];
    v_next_ids uuid[];
    v_added_ids uuid[];
    v_removed_ids uuid[];
begin
    if p_task_id is null then
        raise exception 'p_task_id is required' using errcode = '22023';
    end if;

    if p_updates is null then
        raise exception 'p_updates is required (use ''{}''::jsonb for no-op)'
            using errcode = '22023';
    end if;

    if p_source not in ('manual', 'agent', 'import') then
        raise exception 'Invalid source: %', p_source using errcode = '22023';
    end if;

    -- Lock the task row to serialize concurrent updates
    select * into v_task
    from public.onto_tasks
    where id = p_task_id and deleted_at is null
    for update;

    if not found then
        raise exception 'task_not_found'
            using errcode = 'P0002', message = 'Task not found or already deleted';
    end if;

    v_project_id := v_task.project_id;

    -- Explicit authorization check (RLS enforces this too, but we want a
    -- clean error code rather than a silent zero-row result).
    if not public.current_actor_has_project_access(v_project_id, 'write') then
        raise exception 'access_denied'
            using errcode = '42501', message = 'No write access to project';
    end if;

    -- Apply the partial task update. Only keys present in p_updates are
    -- touched; null values are applied as explicit NULLs (when the key is
    -- present), matching the TypeScript PATCH semantics.
    update public.onto_tasks t set
        title        = case when p_updates ? 'title'        then p_updates->>'title'                            else t.title end,
        description  = case when p_updates ? 'description'  then p_updates->>'description'                      else t.description end,
        priority     = case when p_updates ? 'priority'     then nullif(p_updates->>'priority', '')::int        else t.priority end,
        type_key     = case when p_updates ? 'type_key'     then p_updates->>'type_key'                         else t.type_key end,
        state_key    = case when p_updates ? 'state_key'    then p_updates->>'state_key'                        else t.state_key end,
        start_at     = case when p_updates ? 'start_at'     then nullif(p_updates->>'start_at', '')::timestamptz else t.start_at end,
        due_at       = case when p_updates ? 'due_at'       then nullif(p_updates->>'due_at', '')::timestamptz  else t.due_at end,
        completed_at = case when p_updates ? 'completed_at' then nullif(p_updates->>'completed_at', '')::timestamptz else t.completed_at end,
        props        = case when p_updates ? 'props'        then coalesce(p_updates->'props', t.props)          else t.props end,
        updated_at   = now()
    where t.id = p_task_id
    returning t.* into v_task;

    -- Assignee sync (same transaction as the task update).
    if p_sync_assignees then
        if p_assigned_by_actor_id is null then
            raise exception 'p_assigned_by_actor_id is required when syncing assignees'
                using errcode = '22023';
        end if;

        select coalesce(array_agg(assignee_actor_id), '{}'::uuid[])
          into v_existing_ids
          from public.onto_task_assignees
         where task_id = p_task_id and project_id = v_project_id;

        v_next_ids := coalesce(p_assignee_actor_ids, '{}'::uuid[]);

        -- Compute add/remove deltas
        select coalesce(array_agg(x), '{}'::uuid[])
          into v_added_ids
          from unnest(v_next_ids) as x
         where x <> all(v_existing_ids);

        select coalesce(array_agg(x), '{}'::uuid[])
          into v_removed_ids
          from unnest(v_existing_ids) as x
         where x <> all(v_next_ids);

        if array_length(v_removed_ids, 1) > 0 then
            delete from public.onto_task_assignees
             where task_id = p_task_id
               and project_id = v_project_id
               and assignee_actor_id = any (v_removed_ids);
        end if;

        if array_length(v_added_ids, 1) > 0 then
            insert into public.onto_task_assignees
                (project_id, task_id, assignee_actor_id, assigned_by_actor_id, source)
            select v_project_id, p_task_id, actor_id, p_assigned_by_actor_id, p_source
              from unnest(v_added_ids) as actor_id;
        end if;
    else
        v_added_ids   := '{}'::uuid[];
        v_removed_ids := '{}'::uuid[];
    end if;

    return jsonb_build_object(
        'task', to_jsonb(v_task),
        'added_actor_ids', coalesce(to_jsonb(v_added_ids), '[]'::jsonb),
        'removed_actor_ids', coalesce(to_jsonb(v_removed_ids), '[]'::jsonb)
    );
end;
$$;

grant execute on function
    public.onto_task_update_atomic(uuid, jsonb, boolean, uuid[], uuid, text)
    to authenticated;
