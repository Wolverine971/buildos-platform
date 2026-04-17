-- supabase/migrations/20260501000000_onto_task_update_atomic_enum_cast.sql
--
-- Fix: onto_task_update_atomic was failing on every call that touched
-- state_key. onto_tasks.state_key is of enum type public.task_state
-- ('todo' | 'in_progress' | 'blocked' | 'done'). The previous CASE branch
--
--   state_key = case when p_updates ? 'state_key'
--                    then p_updates->>'state_key'   -- text
--                    else t.state_key               -- task_state
--               end
--
-- could not unify text with task_state, so PostgreSQL raised a datatype
-- mismatch (42804) which the PATCH endpoint masked behind a generic
-- "Database operation failed." That broke 100% of agentic-chat state
-- transitions (see docs/reports/agentic-chat-session-audit-fantasy-novel-
-- 2026-04-17.md).
--
-- This revision adds an explicit ::task_state cast on the assignment
-- branch, mirrors the pattern for any future enum columns, and returns a
-- targeted error when the cast fails so callers see "invalid_state_key"
-- instead of "Database operation failed".

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
    v_state_key_input text;
    v_state_key task_state;
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

    -- Pre-validate the state_key input so we can return a targeted error
    -- instead of an opaque "invalid input value for enum" from the UPDATE.
    if p_updates ? 'state_key' then
        v_state_key_input := p_updates->>'state_key';
        if v_state_key_input is null or v_state_key_input = '' then
            raise exception 'invalid_state_key'
                using errcode = '22023',
                      message = 'state_key cannot be null or empty';
        end if;
        begin
            v_state_key := v_state_key_input::task_state;
        exception when invalid_text_representation then
            raise exception 'invalid_state_key'
                using errcode = '22023',
                      message = format(
                          'Invalid state_key: %s. Expected one of todo, in_progress, blocked, done',
                          v_state_key_input
                      );
        end;
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
    --
    -- NOTE: state_key uses the pre-validated v_state_key variable so both
    -- CASE branches share the task_state enum type and PostgreSQL can plan
    -- the UPDATE without a type mismatch.
    update public.onto_tasks t set
        title        = case when p_updates ? 'title'        then p_updates->>'title'                             else t.title end,
        description  = case when p_updates ? 'description'  then p_updates->>'description'                       else t.description end,
        priority     = case when p_updates ? 'priority'     then nullif(p_updates->>'priority', '')::int         else t.priority end,
        type_key     = case when p_updates ? 'type_key'     then p_updates->>'type_key'                          else t.type_key end,
        state_key    = case when p_updates ? 'state_key'    then v_state_key                                     else t.state_key end,
        start_at     = case when p_updates ? 'start_at'     then nullif(p_updates->>'start_at', '')::timestamptz else t.start_at end,
        due_at       = case when p_updates ? 'due_at'       then nullif(p_updates->>'due_at', '')::timestamptz   else t.due_at end,
        completed_at = case when p_updates ? 'completed_at' then nullif(p_updates->>'completed_at', '')::timestamptz else t.completed_at end,
        props        = case when p_updates ? 'props'        then coalesce(p_updates->'props', t.props)           else t.props end,
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
