-- packages/shared-types/src/functions/set_project_notification_settings.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.set_project_notification_settings(p_project_id uuid, p_member_enabled boolean DEFAULT NULL::boolean, p_project_default_enabled boolean DEFAULT NULL::boolean)
 RETURNS TABLE(project_id uuid, member_count integer, is_shared_project boolean, project_default_enabled boolean, member_enabled boolean, effective_enabled boolean, member_overridden boolean, can_manage_default boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_is_collaborator boolean := false;
  v_props jsonb;
  v_notifications jsonb;
  v_shared jsonb;
  v_overrides jsonb;
  v_project_default_enabled boolean;
  v_current record;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project ID is required';
  END IF;

  IF p_member_enabled IS NULL AND p_project_default_enabled IS NULL THEN
    RAISE EXCEPTION 'At least one setting must be provided';
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
    RAISE EXCEPTION 'Only collaborators can update project notification settings';
  END IF;

  SELECT *
  INTO v_current
  FROM get_project_notification_settings(p_project_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT p.props
  INTO v_props
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

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

  v_project_default_enabled := v_current.project_default_enabled;

  IF p_project_default_enabled IS NOT NULL THEN
    IF NOT current_actor_has_project_access(p_project_id, 'admin') THEN
      RAISE EXCEPTION 'Only project admins can update the project default';
    END IF;
    v_project_default_enabled := p_project_default_enabled;
  END IF;

  IF p_member_enabled IS NOT NULL THEN
    IF p_member_enabled = v_project_default_enabled THEN
      v_overrides := v_overrides - v_actor_id::text;
    ELSE
      v_overrides := jsonb_set(v_overrides, ARRAY[v_actor_id::text], to_jsonb(p_member_enabled), true);
    END IF;
  END IF;

  v_shared := jsonb_set(v_shared, '{enabled_by_default}', to_jsonb(v_project_default_enabled), true);
  v_shared := jsonb_set(v_shared, '{member_overrides}', v_overrides, true);
  v_shared := jsonb_set(v_shared, '{updated_at}', to_jsonb(NOW()), true);

  v_notifications := jsonb_set(v_notifications, '{shared_project_activity}', v_shared, true);
  v_props := jsonb_set(v_props, '{notifications}', v_notifications, true);

  UPDATE onto_projects
  SET
    props = v_props,
    updated_at = NOW()
  WHERE id = p_project_id;

  RETURN QUERY
  SELECT *
  FROM get_project_notification_settings(p_project_id);
END;
$function$
