-- packages/shared-types/src/functions/task_series_delete.sql
-- task_series_delete(uuid, boolean)
-- Delete a task series
-- Source: supabase/migrations/20251108_task_series_functions.sql

CREATE OR REPLACE FUNCTION public.task_series_delete(
  p_series_id uuid,
  p_force boolean default false
)
RETURNS TABLE(deleted_master integer, deleted_instances integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_deleted_instances integer := 0;
  v_deleted_master integer := 0;
BEGIN
  DELETE FROM onto_tasks
  WHERE
    props->>'series_id' = p_series_id
    AND coalesce(props->'series'->>'role', '') = 'instance'
    AND (p_force OR state_key = 'todo');

  GET DIAGNOSTICS v_deleted_instances = ROW_COUNT;

  DELETE FROM onto_tasks
  WHERE
    props->>'series_id' = p_series_id
    AND coalesce(props->'series'->>'role', '') = 'master';

  GET DIAGNOSTICS v_deleted_master = ROW_COUNT;

  IF NOT p_force THEN
    UPDATE onto_tasks
      SET
        props = (props - 'series_id') - 'series',
        updated_at = now()
      WHERE props->>'series_id' = p_series_id;
  END IF;

  RETURN QUERY SELECT coalesce(v_deleted_master, 0), coalesce(v_deleted_instances, 0);
END;
$$;
