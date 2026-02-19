-- packages/shared-types/src/functions/get_project_skeleton.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'icon_svg', p.icon_svg,
    'icon_concept', p.icon_concept,
    'icon_generated_at', p.icon_generated_at,
    'icon_generation_source', p.icon_generation_source,
    'icon_generation_prompt', p.icon_generation_prompt,
    'state_key', p.state_key,
    'type_key', p.type_key,
    'next_step_short', p.next_step_short,
    'next_step_long', p.next_step_long,
    'next_step_source', p.next_step_source,
    'next_step_updated_at', p.next_step_updated_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    -- Entity counts using scalar subqueries (filter soft-deleted entities)
    'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL),
    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),
    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),
    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),
    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),
    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL),
    'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL),
    'image_count', (SELECT count(*) FROM onto_assets WHERE project_id = p.id AND deleted_at IS NULL)
  )
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL
    AND current_actor_has_project_access(p.id, 'read');
$function$
