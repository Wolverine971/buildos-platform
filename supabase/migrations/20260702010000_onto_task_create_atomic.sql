-- supabase/migrations/20260702010000_onto_task_create_atomic.sql
--
-- Atomic task create + assignee sync + per-call idempotency.
--
-- Context (D7): apps/web/src/routes/api/onto/tasks/create/+server.ts inserted
-- the task row first and then ran autoOrganizeConnections (edge creation) and
-- assignee sync as separate steps. A failure in those later steps returned an
-- error to the caller BUT the task row had already committed — leaving an
-- orphan task with no edges. The agentic-chat model would then retry, producing
-- duplicate tasks missing their connections.
--
-- This mirrors the existing onto_task_update_atomic RPC
-- (20260430000002 / 20260501000000): the task INSERT and the assignee-link
-- INSERTs are wrapped in ONE PL/pgSQL function so either both commit or neither
-- does. Edge auto-organization stays OUT of scope for the exact same reason it
-- is excluded from the update RPC (multi-table, complex, lives in TypeScript);
-- the create route compensates by deleting the just-created task if the
-- post-commit autoOrganizeConnections call fails, so no orphan survives.
--
-- Context (D3): a nullable idempotency_key column + partial unique index let a
-- retried create (same client-supplied key, e.g. per tool_call id) return the
-- existing row instead of inserting a duplicate. No key => no dedup, so all
-- existing (non-chat) callers are unaffected.
--
-- Security:
--  - SECURITY INVOKER: onto_tasks / onto_task_assignees RLS still applies.
--  - We additionally assert current_actor_has_project_access(..., 'write')
--    for a clean access_denied error rather than a silent RLS zero-row insert.

-- 1. Idempotency key column + partial unique index -------------------------------
alter table public.onto_tasks
    add column if not exists idempotency_key text;

create unique index if not exists onto_tasks_idempotency_key_unique
    on public.onto_tasks (idempotency_key)
    where idempotency_key is not null;

-- 2. Transactional create RPC ---------------------------------------------------
create or replace function public.onto_task_create_atomic(
    p_task jsonb,
    p_sync_assignees boolean default false,
    p_assignee_actor_ids uuid[] default null,
    p_assigned_by_actor_id uuid default null,
    p_source text default 'manual',
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
    v_project_id uuid;
    v_created_by uuid;
    v_task public.onto_tasks;
    v_existing public.onto_tasks;
    v_added_ids uuid[];
    v_state_key task_state;
    v_state_key_input text;
begin
    if p_task is null then
        raise exception 'p_task is required' using errcode = '22023';
    end if;

    if p_source not in ('manual', 'agent', 'import') then
        raise exception 'Invalid source: %', p_source using errcode = '22023';
    end if;

    v_project_id := nullif(p_task->>'project_id', '')::uuid;
    if v_project_id is null then
        raise exception 'p_task.project_id is required' using errcode = '22023';
    end if;

    if nullif(p_task->>'title', '') is null then
        raise exception 'p_task.title is required' using errcode = '22023';
    end if;

    v_created_by := nullif(p_task->>'created_by', '')::uuid;
    if v_created_by is null then
        raise exception 'p_task.created_by is required' using errcode = '22023';
    end if;

    -- Pre-validate the state_key enum so callers see "invalid_state_key" rather
    -- than an opaque enum error from the INSERT. Mirrors the update RPC.
    v_state_key_input := coalesce(nullif(p_task->>'state_key', ''), 'todo');
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

    -- Explicit authorization check (RLS enforces this too, but we want a clean
    -- error code rather than a silent zero-row insert).
    if not public.current_actor_has_project_access(v_project_id, 'write') then
        raise exception 'access_denied'
            using errcode = '42501', message = 'No write access to project';
    end if;

    -- Idempotency short-circuit: a retry with the same key returns the row that
    -- the first attempt already created instead of inserting a duplicate.
    if p_idempotency_key is not null and p_idempotency_key <> '' then
        select * into v_existing
          from public.onto_tasks
         where idempotency_key = p_idempotency_key
         limit 1;
        if found then
            return jsonb_build_object(
                'task', to_jsonb(v_existing),
                'added_actor_ids', '[]'::jsonb,
                'idempotent_replay', true
            );
        end if;
    end if;

    -- Insert the task. Fields come pre-normalized from the route (same values
    -- the previous direct insert used); the RPC only owns transactionality.
    begin
        insert into public.onto_tasks (
            project_id,
            title,
            description,
            type_key,
            state_key,
            priority,
            start_at,
            due_at,
            completed_at,
            props,
            created_by,
            idempotency_key
        ) values (
            v_project_id,
            p_task->>'title',
            p_task->>'description',
            coalesce(nullif(p_task->>'type_key', ''), 'task.default'),
            v_state_key,
            nullif(p_task->>'priority', '')::int,
            nullif(p_task->>'start_at', '')::timestamptz,
            nullif(p_task->>'due_at', '')::timestamptz,
            case when p_task ? 'completed_at'
                 then nullif(p_task->>'completed_at', '')::timestamptz
                 else null end,
            coalesce(p_task->'props', '{}'::jsonb),
            v_created_by,
            nullif(p_idempotency_key, '')
        )
        returning * into v_task;
    exception when unique_violation then
        -- A concurrent request with the same idempotency key won the race.
        -- Return its committed row instead of surfacing the constraint error.
        if p_idempotency_key is not null and p_idempotency_key <> '' then
            select * into v_existing
              from public.onto_tasks
             where idempotency_key = p_idempotency_key
             limit 1;
            if found then
                return jsonb_build_object(
                    'task', to_jsonb(v_existing),
                    'added_actor_ids', '[]'::jsonb,
                    'idempotent_replay', true
                );
            end if;
        end if;
        raise;
    end;

    -- Assignee links (same transaction as the task insert). On create there is
    -- no pre-existing set, so this is an insert of the requested actors.
    if p_sync_assignees
       and p_assignee_actor_ids is not null
       and array_length(p_assignee_actor_ids, 1) > 0 then
        if p_assigned_by_actor_id is null then
            raise exception 'p_assigned_by_actor_id is required when syncing assignees'
                using errcode = '22023';
        end if;

        insert into public.onto_task_assignees
            (project_id, task_id, assignee_actor_id, assigned_by_actor_id, source)
        select v_project_id, v_task.id, actor_id, p_assigned_by_actor_id, p_source
          from unnest(p_assignee_actor_ids) as actor_id
        on conflict (task_id, assignee_actor_id) do nothing;

        v_added_ids := p_assignee_actor_ids;
    else
        v_added_ids := '{}'::uuid[];
    end if;

    return jsonb_build_object(
        'task', to_jsonb(v_task),
        'added_actor_ids', coalesce(to_jsonb(v_added_ids), '[]'::jsonb),
        'idempotent_replay', false
    );
end;
$$;

grant execute on function
    public.onto_task_create_atomic(jsonb, boolean, uuid[], uuid, text, text)
    to authenticated;
