-- packages/shared-types/src/functions/onto_comment_validate_target.sql
-- onto_comment_validate_target(uuid, text, uuid)
-- Validate comment target entity
-- Source: supabase/migrations/20260328000000_add_onto_comments.sql

CREATE OR REPLACE FUNCTION onto_comment_validate_target(
  p_project_id uuid,
  p_entity_type text,
  p_entity_id uuid
) RETURNS boolean
LANGUAGE plpgsql
AS $$
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
    ELSE
      RETURN false;
  END CASE;
END;
$$;
