-- supabase/migrations/20260320000002_project_sharing_access_fixes.sql
-- Migration: Project sharing access + invite acceptance fixes
-- Date: 2026-03-20
-- Description: Allow public read access, harden invite acceptance, and tighten RLS policies.

-- ============================================================================
-- 1. ACCESS HELPER UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION current_actor_has_project_access(
  p_project_id uuid,
  p_required_access text DEFAULT 'read'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF p_required_access = 'read' THEN
    IF EXISTS (
      SELECT 1 FROM onto_projects p
      WHERE p.id = p_project_id
        AND p.deleted_at IS NULL
        AND p.is_public = true
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF is_admin() THEN
    RETURN true;
  END IF;

  v_actor_id := current_actor_id();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  -- Owner always has access.
  IF EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = p_project_id AND p.created_by = v_actor_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM onto_project_members m
    WHERE m.project_id = p_project_id
      AND m.actor_id = v_actor_id
      AND m.removed_at IS NULL
      AND (
        (p_required_access = 'read'  AND m.access IN ('read', 'write', 'admin')) OR
        (p_required_access = 'write' AND m.access IN ('write', 'admin')) OR
        (p_required_access = 'admin' AND m.access = 'admin')
      )
  );
END;
$$;

-- ============================================================================
-- 2. PROJECT RPCs: MEMBERSHIP + PUBLIC READ
-- ============================================================================

CREATE OR REPLACE FUNCTION current_actor_is_project_member(
  p_project_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_admin() THEN
    RETURN true;
  END IF;

  v_actor_id := current_actor_id();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = p_project_id AND p.created_by = v_actor_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM onto_project_members m
    WHERE m.project_id = p_project_id
      AND m.actor_id = v_actor_id
      AND m.removed_at IS NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION current_actor_is_project_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION current_actor_is_project_member(uuid) TO anon;

CREATE OR REPLACE FUNCTION get_project_skeleton(
  p_project_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
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
    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),
    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),
    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),
    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),
    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),
    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL),
    'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL)
  )
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL
    AND current_actor_has_project_access(p.id, 'read');
$$;

GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO anon;

CREATE OR REPLACE FUNCTION get_project_full(
  p_project_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project jsonb;
  v_result jsonb;
BEGIN
  IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
    RETURN NULL;
  END IF;

  -- Verify the project exists (exclude soft-deleted projects)
  SELECT to_jsonb(p.*)
  INTO v_project
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'project', v_project,

    'goals', COALESCE((
      SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
      FROM onto_goals g
      WHERE g.project_id = p_project_id
        AND g.deleted_at IS NULL
    ), '[]'::jsonb),

    'requirements', COALESCE((
      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
      FROM onto_requirements r
      WHERE r.project_id = p_project_id
        AND r.deleted_at IS NULL
    ), '[]'::jsonb),

    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id
        AND pl.deleted_at IS NULL
    ), '[]'::jsonb),

    'tasks', COALESCE((
      SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at)
      FROM onto_tasks t
      WHERE t.project_id = p_project_id
        AND t.deleted_at IS NULL
    ), '[]'::jsonb),

    'outputs', COALESCE((
      SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at)
      FROM onto_outputs o
      WHERE o.project_id = p_project_id
        AND o.deleted_at IS NULL
    ), '[]'::jsonb),

    'documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
      FROM onto_documents d
      WHERE d.project_id = p_project_id
        AND d.deleted_at IS NULL
    ), '[]'::jsonb),

    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)
      FROM onto_sources s
      WHERE s.project_id = p_project_id
    ), '[]'::jsonb),

    'milestones', COALESCE((
      SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)
      FROM onto_milestones m
      WHERE m.project_id = p_project_id
        AND m.deleted_at IS NULL
    ), '[]'::jsonb),

    'risks', COALESCE((
      SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created_at)
      FROM onto_risks rk
      WHERE rk.project_id = p_project_id
        AND rk.deleted_at IS NULL
    ), '[]'::jsonb),

    'decisions', COALESCE((
      SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision_at)
      FROM onto_decisions dc
      WHERE dc.project_id = p_project_id
        AND dc.deleted_at IS NULL
    ), '[]'::jsonb),

    'metrics', COALESCE((
      SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created_at)
      FROM onto_metrics mt
      WHERE mt.project_id = p_project_id
    ), '[]'::jsonb),

    'context_document', (
      SELECT to_jsonb(d.*)
      FROM onto_edges e
      JOIN onto_documents d ON d.id = e.dst_id
      WHERE e.src_kind = 'project'
        AND e.src_id = p_project_id
        AND e.rel = 'has_context_document'
        AND e.dst_kind = 'document'
        AND d.deleted_at IS NULL
      LIMIT 1
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO anon;

-- ============================================================================
-- 3. INVITE ACCEPTANCE HARDENING
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_project_invite(
  p_token_hash text,
  p_actor_id uuid,
  p_user_email text
)
RETURNS TABLE (
  project_id uuid,
  role_key text,
  access text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite onto_project_invites%ROWTYPE;
  v_auth_user_id uuid;
  v_actor_id uuid;
  v_user_email text;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RAISE EXCEPTION 'Invite token missing';
  END IF;

  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_actor_id := ensure_actor_for_user(v_auth_user_id);

  SELECT email INTO v_user_email
  FROM public.users
  WHERE id = v_auth_user_id;

  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email
    FROM onto_actors
    WHERE id = v_actor_id;
  END IF;

  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor_id THEN
    RAISE EXCEPTION 'Actor mismatch';
  END IF;

  IF p_user_email IS NOT NULL AND lower(trim(p_user_email)) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'User email mismatch';
  END IF;

  SELECT * INTO v_invite
  FROM onto_project_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is not pending';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    UPDATE onto_project_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'Invite email mismatch';
  END IF;

  INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
  VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id)
  ON CONFLICT (project_id, actor_id) DO UPDATE
    SET role_key = EXCLUDED.role_key,
        access = EXCLUDED.access,
        removed_at = NULL,
        removed_by_actor_id = NULL;

  UPDATE onto_project_invites
  SET status = 'accepted',
      accepted_by_actor_id = v_actor_id,
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_project_invite(text, uuid, text) TO authenticated;

-- ============================================================================
-- 4. RLS POLICY ADJUSTMENTS
-- ============================================================================

DROP POLICY IF EXISTS project_logs_select_member ON onto_project_logs;
CREATE POLICY "project_logs_select_member"
  ON onto_project_logs FOR SELECT
  USING (current_actor_is_project_member(project_id));

DROP POLICY IF EXISTS project_members_select_member ON onto_project_members;
CREATE POLICY "project_members_select_member"
  ON onto_project_members FOR SELECT
  USING (current_actor_is_project_member(project_id));

DROP POLICY IF EXISTS project_members_update_admin ON onto_project_members;
CREATE POLICY "project_members_update_admin"
  ON onto_project_members FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'admin'))
  WITH CHECK (current_actor_has_project_access(project_id, 'admin'));

DROP POLICY IF EXISTS project_invites_update_admin ON onto_project_invites;
CREATE POLICY "project_invites_update_admin"
  ON onto_project_invites FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'admin'))
  WITH CHECK (current_actor_has_project_access(project_id, 'admin'));
