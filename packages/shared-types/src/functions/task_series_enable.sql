-- packages/shared-types/src/functions/task_series_enable.sql
-- task_series_enable(uuid, uuid, jsonb, jsonb)
-- Enable a task series
-- Source: supabase/migrations/20251108_task_series_functions.sql

CREATE OR REPLACE FUNCTION public.task_series_enable(
  p_task_id uuid,
  p_series_id uuid,
  p_master_props jsonb,
  p_instance_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE onto_tasks
    SET
      props = p_master_props,
      updated_at = now()
    WHERE id = p_task_id;

  INSERT INTO onto_tasks (
    project_id,
    plan_id,
    title,
    state_key,
    due_at,
    priority,
    props,
    created_by
  )
  SELECT
    (instance->>'project_id')::uuid,
    nullif(instance->>'plan_id', '')::uuid,
    instance->>'title',
    coalesce(instance->>'state_key', 'todo'),
    (instance->>'due_at')::timestamptz,
    nullif(instance->>'priority', '')::int,
    coalesce(instance->'props', '{}'::jsonb),
    (instance->>'created_by')::uuid
  FROM jsonb_array_elements(p_instance_rows) AS instance;
END;
$$;
