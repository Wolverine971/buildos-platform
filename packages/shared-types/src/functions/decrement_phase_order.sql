-- packages/shared-types/src/functions/decrement_phase_order.sql
-- decrement_phase_order(uuid, integer)
-- Decrement phase order position
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION decrement_phase_order(
  p_project_id uuid,
  p_order_threshold integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE phases
  SET order_position = order_position - 1
  WHERE project_id = p_project_id
    AND order_position > p_order_threshold;
END;
$$;
