-- packages/shared-types/src/functions/task_series_delete.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.task_series_delete(p_series_id uuid, p_force boolean DEFAULT false)
 RETURNS TABLE(deleted_master integer, deleted_instances integer)
 LANGUAGE plpgsql
AS $function$
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
$function$
