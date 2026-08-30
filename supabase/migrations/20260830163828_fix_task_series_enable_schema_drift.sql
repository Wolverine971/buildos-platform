-- supabase/migrations/20260830163828_fix_task_series_enable_schema_drift.sql
-- Keep recurring-task instance creation aligned with the current onto_tasks schema.
-- The previous function still inserted the removed plan_id column and therefore
-- failed every time a series was enabled.
CREATE OR REPLACE FUNCTION public.task_series_enable(
	p_task_id uuid,
	p_series_id uuid,
	p_master_props jsonb,
	p_instance_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
	UPDATE public.onto_tasks
	SET
		props = p_master_props,
		updated_at = now()
	WHERE id = p_task_id;

	INSERT INTO public.onto_tasks (
		project_id,
		type_key,
		title,
		state_key,
		due_at,
		priority,
		props,
		created_by
	)
	SELECT
		(instance->>'project_id')::uuid,
		coalesce(nullif(instance->>'type_key', ''), 'task.execute'),
		instance->>'title',
		coalesce(nullif(instance->>'state_key', ''), 'todo')::public.task_state,
		(instance->>'due_at')::timestamptz,
		nullif(instance->>'priority', '')::int,
		coalesce(instance->'props', '{}'::jsonb),
		(instance->>'created_by')::uuid
	FROM jsonb_array_elements(p_instance_rows) AS instance;
END;
$function$;

COMMENT ON FUNCTION public.task_series_enable(uuid, uuid, jsonb, jsonb)
IS 'Atomically enables a task series and creates its initial task instances.';

REVOKE ALL ON FUNCTION public.task_series_enable(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_series_enable(uuid, uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.task_series_enable(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_series_enable(uuid, uuid, jsonb, jsonb) TO service_role;
