-- supabase/migrations/20251108_task_series_functions.sql
-- Recurring task series helper functions

create or replace function public.task_series_enable(
  p_task_id uuid,
  p_series_id uuid,
  p_master_props jsonb,
  p_instance_rows jsonb
)
returns void
language plpgsql
security invoker
as $$
begin
  update onto_tasks
    set
      props = p_master_props,
      updated_at = now()
    where id = p_task_id;

  insert into onto_tasks (
    project_id,
    plan_id,
    title,
    state_key,
    due_at,
    priority,
    props,
    created_by
  )
  select
    (instance->>'project_id')::uuid,
    nullif(instance->>'plan_id', '')::uuid,
    instance->>'title',
    coalesce(instance->>'state_key', 'todo'),
    (instance->>'due_at')::timestamptz,
    nullif(instance->>'priority', '')::int,
    coalesce(instance->'props', '{}'::jsonb),
    (instance->>'created_by')::uuid
  from jsonb_array_elements(p_instance_rows) as instance;
end;
$$;


create or replace function public.task_series_delete(
  p_series_id uuid,
  p_force boolean default false
)
returns table(deleted_master integer, deleted_instances integer)
language plpgsql
security invoker
as $$
declare
  v_deleted_instances integer := 0;
  v_deleted_master integer := 0;
begin
  delete from onto_tasks
  where
    props->>'series_id' = p_series_id
    and coalesce(props->'series'->>'role', '') = 'instance'
    and (p_force or state_key = 'todo');

  get diagnostics v_deleted_instances = ROW_COUNT;

  delete from onto_tasks
  where
    props->>'series_id' = p_series_id
    and coalesce(props->'series'->>'role', '') = 'master';

  get diagnostics v_deleted_master = ROW_COUNT;

  if not p_force then
    update onto_tasks
      set
        props = (props - 'series_id') - 'series',
        updated_at = now()
      where props->>'series_id' = p_series_id;
  end if;

  return query select coalesce(v_deleted_master, 0), coalesce(v_deleted_instances, 0);
end;
$$;


create index if not exists idx_onto_tasks_series_id
  on onto_tasks ((props->>'series_id'))
  where props ? 'series_id';
