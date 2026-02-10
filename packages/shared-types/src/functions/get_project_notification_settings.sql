-- packages/shared-types/src/functions/get_project_notification_settings.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_project_notification_settings(p_project_id uuid)
 RETURNS TABLE(project_id uuid, member_count integer, is_shared_project boolean, project_default_enabled boolean, member_enabled boolean, effective_enabled boolean, member_overridden boolean, can_manage_default boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_owner_actor_id uuid;
  v_is_collaborator boolean := false;
  v_props jsonb;
  v_notifications jsonb;
  v_shared jsonb;
  v_overrides jsonb;
  v_member_count integer := 0;
  v_is_shared boolean := false;
  v_project_default_enabled boolean := false;
  v_member_enabled boolean := false;
  v_member_overridden boolean := false;
  v_can_manage_default boolean := false;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project ID is required';
  END IF;

  IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_actor_id := current_actor_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor not found for current user';
  END IF;

  v_is_collaborator := EXISTS (
    SELECT 1
    FROM onto_projects p
    WHERE p.id = p_project_id
      AND p.created_by = v_actor_id
      AND p.deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM onto_project_members m
    WHERE m.project_id = p_project_id
      AND m.actor_id = v_actor_id
      AND m.removed_at IS NULL
  );

  IF NOT v_is_collaborator THEN
    RAISE EXCEPTION 'Only collaborators can access project notification settings';
  END IF;

  SELECT p.props, p.created_by
  INTO v_props, v_owner_actor_id
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT COUNT(DISTINCT m.actor_id)
  INTO v_member_count
  FROM onto_project_members m
  WHERE m.project_id = p_project_id
    AND m.removed_at IS NULL;

  IF v_owner_actor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM onto_project_members m
    WHERE m.project_id = p_project_id
      AND m.actor_id = v_owner_actor_id
      AND m.removed_at IS NULL
  ) THEN
    v_member_count := v_member_count + 1;
  END IF;

  v_is_shared := v_member_count > 1;
  v_props := COALESCE(v_props, '{}'::jsonb);

  v_notifications := CASE
    WHEN jsonb_typeof(v_props->'notifications') = 'object' THEN v_props->'notifications'
    ELSE '{}'::jsonb
  END;

  v_shared := CASE
    WHEN jsonb_typeof(v_notifications->'shared_project_activity') = 'object'
      THEN v_notifications->'shared_project_activity'
    ELSE '{}'::jsonb
  END;

  v_overrides := CASE
    WHEN jsonb_typeof(v_shared->'member_overrides') = 'object'
      THEN v_shared->'member_overrides'
    ELSE '{}'::jsonb
  END;

  v_project_default_enabled := CASE
    WHEN jsonb_typeof(v_shared->'enabled_by_default') = 'boolean'
      THEN (v_shared->>'enabled_by_default')::boolean
    ELSE v_is_shared
  END;

  IF v_overrides ? v_actor_id::text THEN
    v_member_enabled := (v_overrides->>v_actor_id::text)::boolean;
    v_member_overridden := true;
  ELSE
    v_member_enabled := v_project_default_enabled;
    v_member_overridden := false;
  END IF;

  v_can_manage_default := current_actor_has_project_access(p_project_id, 'admin');

  RETURN QUERY
  SELECT
    p_project_id,
    v_member_count,
    v_is_shared,
    v_project_default_enabled,
    v_member_enabled,
    v_member_enabled,
    v_member_overridden,
    v_can_manage_default;
END;
$function$
