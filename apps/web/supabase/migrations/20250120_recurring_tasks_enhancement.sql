-- supabase/migrations/20250120_recurring_tasks_enhancement.sql
-- Date: 2025-01-20
-- Purpose: Enhanced recurring tasks support with instance tracking and better Google Calendar integration

-- Create recurring_task_instances table to track individual occurrences
CREATE TABLE IF NOT EXISTS public.recurring_task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  instance_date DATE NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'skipped', 'cancelled')),
  completed_at TIMESTAMPTZ,
  skipped BOOLEAN DEFAULT FALSE,
  notes TEXT,
  calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(task_id, instance_date)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_recurring_instances_task 
ON public.recurring_task_instances(task_id, instance_date);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_user_date 
ON public.recurring_task_instances(user_id, instance_date);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_status 
ON public.recurring_task_instances(status) 
WHERE status != 'completed';

-- Enhance task_calendar_events table for better recurrence support
ALTER TABLE public.task_calendar_events 
ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
ADD COLUMN IF NOT EXISTS original_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_exception BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS exception_type TEXT CHECK (exception_type IN ('modified', 'cancelled', 'moved')),
ADD COLUMN IF NOT EXISTS series_update_scope TEXT CHECK (series_update_scope IN ('single', 'future', 'all'));

-- Add index for recurrence master events
CREATE INDEX IF NOT EXISTS idx_calendar_events_master 
ON public.task_calendar_events(recurrence_master_id) 
WHERE recurrence_master_id IS NOT NULL;

-- Add index for exception events
CREATE INDEX IF NOT EXISTS idx_calendar_events_exceptions 
ON public.task_calendar_events(task_id, is_exception) 
WHERE is_exception = TRUE;

-- Create a view for recurring task summary
CREATE OR REPLACE VIEW public.recurring_task_summary AS
SELECT 
  t.id as task_id,
  t.title,
  t.recurrence_pattern,
  t.recurrence_ends,
  t.start_date,
  t.user_id,
  COUNT(DISTINCT rti.id) as total_instances,
  COUNT(DISTINCT CASE WHEN rti.status = 'completed' THEN rti.id END) as completed_instances,
  COUNT(DISTINCT CASE WHEN rti.status = 'skipped' THEN rti.id END) as skipped_instances,
  COUNT(DISTINCT CASE WHEN tce.is_exception = TRUE THEN tce.id END) as exception_count,
  MIN(CASE WHEN rti.status = 'scheduled' THEN rti.instance_date END) as next_occurrence,
  MAX(rti.completed_at) as last_completed_at
FROM public.tasks t
LEFT JOIN public.recurring_task_instances rti ON t.id = rti.task_id
LEFT JOIN public.task_calendar_events tce ON t.id = tce.task_id
WHERE t.task_type = 'recurring'
GROUP BY t.id, t.title, t.recurrence_pattern, t.recurrence_ends, t.start_date, t.user_id;

-- Function to generate recurring task instances
CREATE OR REPLACE FUNCTION generate_recurring_instances(
  p_task_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE(instance_date DATE) AS $$
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
$$ LANGUAGE plpgsql;

-- Function to mark instance as completed
CREATE OR REPLACE FUNCTION complete_recurring_instance(
  p_task_id UUID,
  p_instance_date DATE,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_instance_id UUID;
BEGIN
  -- Check if instance exists
  SELECT id INTO v_instance_id
  FROM recurring_task_instances
  WHERE task_id = p_task_id 
    AND instance_date = p_instance_date
    AND user_id = p_user_id;
  
  IF v_instance_id IS NULL THEN
    -- Create instance if it doesn't exist
    INSERT INTO recurring_task_instances (task_id, instance_date, user_id, status, completed_at)
    VALUES (p_task_id, p_instance_date, p_user_id, 'completed', CURRENT_TIMESTAMP);
  ELSE
    -- Update existing instance
    UPDATE recurring_task_instances
    SET status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_instance_id;
  END IF;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS for new table
ALTER TABLE public.recurring_task_instances ENABLE ROW LEVEL SECURITY;

-- RLS policies for recurring_task_instances
CREATE POLICY "Users can view their own recurring task instances"
  ON public.recurring_task_instances
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recurring task instances"
  ON public.recurring_task_instances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring task instances"
  ON public.recurring_task_instances
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring task instances"
  ON public.recurring_task_instances
  FOR DELETE
  USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON public.recurring_task_instances TO authenticated;
GRANT ALL ON public.recurring_task_summary TO authenticated;
GRANT EXECUTE ON FUNCTION generate_recurring_instances TO authenticated;
GRANT EXECUTE ON FUNCTION complete_recurring_instance TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.recurring_task_instances IS 'Tracks individual instances of recurring tasks';
COMMENT ON TABLE public.task_calendar_events IS 'Enhanced with recurrence support for better Google Calendar integration';
COMMENT ON VIEW public.recurring_task_summary IS 'Summary view of recurring tasks with instance statistics';
COMMENT ON FUNCTION generate_recurring_instances IS 'Generates recurring task instances for a date range';
COMMENT ON FUNCTION complete_recurring_instance IS 'Marks a recurring task instance as completed';