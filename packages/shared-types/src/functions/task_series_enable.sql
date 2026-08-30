-- packages/shared-types/src/functions/task_series_enable.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.task_series_enable(p_task_id uuid, p_series_id uuid, p_master_props jsonb, p_instance_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
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
