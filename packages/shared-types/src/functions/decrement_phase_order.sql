-- packages/shared-types/src/functions/decrement_phase_order.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.decrement_phase_order(p_project_id uuid, p_order_threshold integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE phases
  SET "order" = "order" - 1,
      updated_at = NOW()
  WHERE project_id = p_project_id
    AND "order" > p_order_threshold;
END;
$function$
