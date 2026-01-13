-- packages/shared-types/src/functions/generate_recurring_instances.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.generate_recurring_instances(p_task_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(instance_date date)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_task RECORD;
  v_current_date DATE;
  v_pattern TEXT;
BEGIN
  -- Get task details
  SELECT * INTO v_task 
  FROM tasks 
  WHERE id = p_task_id 
    AND task_type = 'recurring';
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_pattern := v_task.recurrence_pattern;
  v_current_date := COALESCE(v_task.start_date::DATE, p_start_date);
  
  -- Generate instances based on pattern
  WHILE v_current_date <= p_end_date LOOP
    -- Check if date should be included based on pattern
    IF v_pattern = 'daily' THEN
      RETURN QUERY SELECT v_current_date;
    ELSIF v_pattern = 'weekdays' THEN
      IF EXTRACT(DOW FROM v_current_date) BETWEEN 1 AND 5 THEN
        RETURN QUERY SELECT v_current_date;
      END IF;
    ELSIF v_pattern = 'weekly' THEN
      IF EXTRACT(DOW FROM v_current_date) = EXTRACT(DOW FROM v_task.start_date::DATE) THEN
        RETURN QUERY SELECT v_current_date;
      END IF;
    ELSIF v_pattern = 'biweekly' THEN
      IF EXTRACT(DOW FROM v_current_date) = EXTRACT(DOW FROM v_task.start_date::DATE) 
         AND ((v_current_date - v_task.start_date::DATE) / 7) % 2 = 0 THEN
        RETURN QUERY SELECT v_current_date;
      END IF;
    ELSIF v_pattern = 'monthly' THEN
      IF EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date::DATE) THEN
        RETURN QUERY SELECT v_current_date;
      END IF;
    ELSIF v_pattern = 'quarterly' THEN
      IF EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date::DATE)
         AND ((EXTRACT(YEAR FROM v_current_date) * 12 + EXTRACT(MONTH FROM v_current_date)) -
              (EXTRACT(YEAR FROM v_task.start_date::DATE) * 12 + EXTRACT(MONTH FROM v_task.start_date::DATE))) % 3 = 0 THEN
        RETURN QUERY SELECT v_current_date;
      END IF;
    ELSIF v_pattern = 'yearly' THEN
      IF EXTRACT(MONTH FROM v_current_date) = EXTRACT(MONTH FROM v_task.start_date::DATE)
         AND EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date::DATE) THEN
        RETURN QUERY SELECT v_current_date;
      END IF;
    END IF;
    
    -- Move to next day
    v_current_date := v_current_date + INTERVAL '1 day';
    
    -- Check recurrence end date
    IF v_task.recurrence_ends IS NOT NULL AND v_current_date > v_task.recurrence_ends::DATE THEN
      EXIT;
    END IF;
  END LOOP;
END;
$function$
