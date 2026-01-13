-- packages/shared-types/src/functions/generate_recurring_instances.sql
-- generate_recurring_instances(uuid, date, date)
-- Generate recurring task instances for a date range
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION generate_recurring_instances(
  p_task_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  instance_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_current_date date;
BEGIN
  SELECT * INTO v_task
  FROM onto_tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get recurrence pattern from task props
  v_current_date := p_start_date;

  WHILE v_current_date <= p_end_date LOOP
    RETURN QUERY SELECT v_current_date;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$;
