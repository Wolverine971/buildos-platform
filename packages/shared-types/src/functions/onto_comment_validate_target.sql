-- packages/shared-types/src/functions/onto_comment_validate_target.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.onto_comment_validate_target(p_project_id uuid, p_entity_type text, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_project_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  CASE p_entity_type
    WHEN 'project' THEN
      RETURN p_entity_id = p_project_id;
    WHEN 'task' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_tasks t
        WHERE t.id = p_entity_id AND t.project_id = p_project_id
      );
    WHEN 'plan' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_plans pl
        WHERE pl.id = p_entity_id AND pl.project_id = p_project_id
      );
    WHEN 'output' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_outputs o
        WHERE o.id = p_entity_id AND o.project_id = p_project_id
      );
    WHEN 'document' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_documents d
        WHERE d.id = p_entity_id AND d.project_id = p_project_id
      );
    WHEN 'goal' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_goals g
        WHERE g.id = p_entity_id AND g.project_id = p_project_id
      );
    WHEN 'requirement' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_requirements r
        WHERE r.id = p_entity_id AND r.project_id = p_project_id
      );
    WHEN 'milestone' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_milestones m
        WHERE m.id = p_entity_id AND m.project_id = p_project_id
      );
    WHEN 'risk' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_risks rk
        WHERE rk.id = p_entity_id AND rk.project_id = p_project_id
      );
    WHEN 'decision' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_decisions dc
        WHERE dc.id = p_entity_id AND dc.project_id = p_project_id
      );
    WHEN 'event' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_events ev
        WHERE ev.id = p_entity_id AND ev.project_id = p_project_id
      );
    WHEN 'metric' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_metrics mt
        WHERE mt.id = p_entity_id AND mt.project_id = p_project_id
      );
    WHEN 'metric_point' THEN
      RETURN EXISTS (
        SELECT 1
        FROM onto_metric_points mp
        JOIN onto_metrics mt ON mt.id = mp.metric_id
        WHERE mp.id = p_entity_id AND mt.project_id = p_project_id
      );
    WHEN 'source' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_sources s
        WHERE s.id = p_entity_id AND s.project_id = p_project_id
      );
    WHEN 'signal' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_signals sg
        WHERE sg.id = p_entity_id AND sg.project_id = p_project_id
      );
    WHEN 'insight' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_insights i
        WHERE i.id = p_entity_id AND i.project_id = p_project_id
      );
    WHEN 'note' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_documents d
        WHERE d.id = p_entity_id AND d.project_id = p_project_id
      );
    ELSE
      RETURN false;
  END CASE;
END;
$function$
