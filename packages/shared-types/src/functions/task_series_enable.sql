-- packages/shared-types/src/functions/task_series_enable.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.task_series_enable(p_task_id uuid, p_series_id uuid, p_master_props jsonb, p_instance_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
