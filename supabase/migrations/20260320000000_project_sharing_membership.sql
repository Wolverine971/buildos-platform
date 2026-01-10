-- supabase/migrations/20260320000000_project_sharing_membership.sql
-- Migration: Project sharing memberships, invites, and actor attribution
-- Date: 2026-03-20
-- Description: Adds membership + invite tables, actor attribution for logs,
--              and shared-access helpers/policies.

-- ============================================================================
-- 1. PROJECT MEMBERSHIP TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS onto_project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES onto_actors(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  access text NOT NULL,
  added_by_actor_id uuid REFERENCES onto_actors(id) ON DELETE SET NULL,
  removed_at timestamptz,
  removed_by_actor_id uuid REFERENCES onto_actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_project_member_role CHECK (role_key IN ('owner', 'editor', 'viewer')),
  CONSTRAINT chk_project_member_access CHECK (access IN ('read', 'write', 'admin')),
  CONSTRAINT unique_project_member UNIQUE (project_id, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_onto_project_members_project
  ON onto_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_onto_project_members_actor
  ON onto_project_members(actor_id);
CREATE INDEX IF NOT EXISTS idx_onto_project_members_active
  ON onto_project_members(project_id, actor_id)
  WHERE removed_at IS NULL;

-- ============================================================================
-- 2. PROJECT INVITES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS onto_project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,
  token_hash text NOT NULL,
  role_key text NOT NULL,
  access text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  invited_by_actor_id uuid REFERENCES onto_actors(id) ON DELETE SET NULL,
  accepted_by_actor_id uuid REFERENCES onto_actors(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_project_invite_role CHECK (role_key IN ('owner', 'editor', 'viewer')),
  CONSTRAINT chk_project_invite_access CHECK (access IN ('read', 'write', 'admin')),
  CONSTRAINT chk_project_invite_status CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_onto_project_invites_project
  ON onto_project_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_onto_project_invites_email
  ON onto_project_invites(invitee_email);
CREATE INDEX IF NOT EXISTS idx_onto_project_invites_token_hash
  ON onto_project_invites(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_onto_project_invites_pending
  ON onto_project_invites(project_id, invitee_email)
  WHERE status = 'pending';

-- ============================================================================
-- 3. ACTOR ATTRIBUTION FOR PROJECT LOGS
-- ============================================================================

ALTER TABLE onto_project_logs
  ADD COLUMN IF NOT EXISTS changed_by_actor_id uuid REFERENCES onto_actors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_changed_by_actor
  ON onto_project_logs(changed_by_actor_id);

ALTER TABLE onto_project_logs
  DROP CONSTRAINT IF EXISTS check_entity_type_values;

ALTER TABLE onto_project_logs
  ADD CONSTRAINT check_entity_type_values CHECK (entity_type IN (
    'project',
    'task',
    'output',
    'note',
    'document',
    'goal',
    'milestone',
    'risk',
    'plan',
    'requirement',
    'decision',
    'source',
    'edge',
    'member',
    'invite'
  ));

-- ============================================================================
-- 4. HELPER FUNCTIONS
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

GRANT EXECUTE ON FUNCTION current_actor_has_project_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION current_actor_has_project_access(uuid, text) TO anon;

-- Update log_project_change helper to capture actor attribution when possible.
CREATE OR REPLACE FUNCTION log_project_change(
  p_project_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_changed_by UUID DEFAULT NULL,
  p_change_source TEXT DEFAULT NULL,
  p_chat_session_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_changed_by UUID;
  v_changed_by_actor UUID;
BEGIN
  v_changed_by := COALESCE(p_changed_by, auth.uid());
  v_changed_by_actor := COALESCE(
    current_actor_id(),
    (SELECT id FROM onto_actors WHERE user_id = v_changed_by)
  );

  INSERT INTO onto_project_logs (
    project_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    changed_by,
    changed_by_actor_id,
    change_source,
    chat_session_id
  ) VALUES (
    p_project_id,
    p_entity_type,
    p_entity_id,
    p_action,
    p_before_data,
    p_after_data,
    v_changed_by,
    v_changed_by_actor,
    p_change_source,
    p_chat_session_id
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. BACKFILL MEMBERSHIP + ACTOR ATTRIBUTION
-- ============================================================================

INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
SELECT p.id, p.created_by, 'owner', 'admin', p.created_by
FROM onto_projects p
WHERE p.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM onto_project_members m
    WHERE m.project_id = p.id AND m.actor_id = p.created_by
  );

UPDATE onto_project_logs pl
SET changed_by_actor_id = oa.id
FROM onto_actors oa
WHERE pl.changed_by_actor_id IS NULL
  AND oa.user_id = pl.changed_by;

-- ============================================================================
-- 6. LOG ACTOR TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION set_project_log_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.changed_by_actor_id IS NULL THEN
    NEW.changed_by_actor_id := current_actor_id();
  END IF;

  IF NEW.changed_by_actor_id IS NULL AND NEW.changed_by IS NOT NULL THEN
    SELECT id INTO NEW.changed_by_actor_id
    FROM onto_actors
    WHERE user_id = NEW.changed_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onto_project_logs_actor ON onto_project_logs;
CREATE TRIGGER trg_onto_project_logs_actor
  BEFORE INSERT ON onto_project_logs
  FOR EACH ROW EXECUTE FUNCTION set_project_log_actor();

-- ============================================================================
-- 7. OWNER MEMBERSHIP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION add_project_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
  VALUES (NEW.id, NEW.created_by, 'owner', 'admin', NEW.created_by)
  ON CONFLICT (project_id, actor_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onto_projects_owner_member ON onto_projects;
CREATE TRIGGER trg_onto_projects_owner_member
  AFTER INSERT ON onto_projects
  FOR EACH ROW EXECUTE FUNCTION add_project_owner_membership();

-- ============================================================================
-- 8. RLS: ENABLE + POLICIES
-- ============================================================================

ALTER TABLE onto_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_project_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_project_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (clean slate for updated access checks)
DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'onto_projects', 'onto_goals', 'onto_milestones', 'onto_plans',
    'onto_tasks', 'onto_decisions', 'onto_risks', 'onto_documents', 'onto_edges',
    'onto_project_logs', 'onto_project_members', 'onto_project_invites'
  ])
  LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- onto_projects policies
CREATE POLICY "project_select_member"
  ON onto_projects FOR SELECT
  USING (current_actor_has_project_access(id, 'read'));

CREATE POLICY "project_select_admin"
  ON onto_projects FOR SELECT
  USING (is_admin());

CREATE POLICY "project_select_public"
  ON onto_projects FOR SELECT
  USING (is_public = true);

CREATE POLICY "project_insert_owner"
  ON onto_projects FOR INSERT
  WITH CHECK (created_by = current_actor_id());

CREATE POLICY "project_insert_admin"
  ON onto_projects FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "project_update_member"
  ON onto_projects FOR UPDATE
  USING (current_actor_has_project_access(id, 'write'))
  WITH CHECK (current_actor_has_project_access(id, 'write'));

CREATE POLICY "project_update_admin"
  ON onto_projects FOR UPDATE
  USING (is_admin());

CREATE POLICY "project_delete_member"
  ON onto_projects FOR DELETE
  USING (current_actor_has_project_access(id, 'admin'));

CREATE POLICY "project_delete_admin"
  ON onto_projects FOR DELETE
  USING (is_admin());

-- onto_goals policies
CREATE POLICY "goal_select_member"
  ON onto_goals FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "goal_select_admin"
  ON onto_goals FOR SELECT
  USING (is_admin());

CREATE POLICY "goal_select_public"
  ON onto_goals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_goals.project_id AND p.is_public = true
  ));

CREATE POLICY "goal_insert_member"
  ON onto_goals FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "goal_insert_admin"
  ON onto_goals FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "goal_update_member"
  ON onto_goals FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "goal_update_admin"
  ON onto_goals FOR UPDATE
  USING (is_admin());

CREATE POLICY "goal_delete_member"
  ON onto_goals FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "goal_delete_admin"
  ON onto_goals FOR DELETE
  USING (is_admin());

-- onto_milestones policies
CREATE POLICY "milestone_select_member"
  ON onto_milestones FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "milestone_select_admin"
  ON onto_milestones FOR SELECT
  USING (is_admin());

CREATE POLICY "milestone_select_public"
  ON onto_milestones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_milestones.project_id AND p.is_public = true
  ));

CREATE POLICY "milestone_insert_member"
  ON onto_milestones FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "milestone_insert_admin"
  ON onto_milestones FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "milestone_update_member"
  ON onto_milestones FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "milestone_update_admin"
  ON onto_milestones FOR UPDATE
  USING (is_admin());

CREATE POLICY "milestone_delete_member"
  ON onto_milestones FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "milestone_delete_admin"
  ON onto_milestones FOR DELETE
  USING (is_admin());

-- onto_plans policies
CREATE POLICY "plan_select_member"
  ON onto_plans FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "plan_select_admin"
  ON onto_plans FOR SELECT
  USING (is_admin());

CREATE POLICY "plan_select_public"
  ON onto_plans FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_plans.project_id AND p.is_public = true
  ));

CREATE POLICY "plan_insert_member"
  ON onto_plans FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "plan_insert_admin"
  ON onto_plans FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "plan_update_member"
  ON onto_plans FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "plan_update_admin"
  ON onto_plans FOR UPDATE
  USING (is_admin());

CREATE POLICY "plan_delete_member"
  ON onto_plans FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "plan_delete_admin"
  ON onto_plans FOR DELETE
  USING (is_admin());

-- onto_tasks policies
CREATE POLICY "task_select_member"
  ON onto_tasks FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "task_select_admin"
  ON onto_tasks FOR SELECT
  USING (is_admin());

CREATE POLICY "task_select_public"
  ON onto_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_tasks.project_id AND p.is_public = true
  ));

CREATE POLICY "task_insert_member"
  ON onto_tasks FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "task_insert_admin"
  ON onto_tasks FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "task_update_member"
  ON onto_tasks FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "task_update_admin"
  ON onto_tasks FOR UPDATE
  USING (is_admin());

CREATE POLICY "task_delete_member"
  ON onto_tasks FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "task_delete_admin"
  ON onto_tasks FOR DELETE
  USING (is_admin());

-- onto_decisions policies
CREATE POLICY "decision_select_member"
  ON onto_decisions FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "decision_select_admin"
  ON onto_decisions FOR SELECT
  USING (is_admin());

CREATE POLICY "decision_select_public"
  ON onto_decisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_decisions.project_id AND p.is_public = true
  ));

CREATE POLICY "decision_insert_member"
  ON onto_decisions FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "decision_insert_admin"
  ON onto_decisions FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "decision_update_member"
  ON onto_decisions FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "decision_update_admin"
  ON onto_decisions FOR UPDATE
  USING (is_admin());

CREATE POLICY "decision_delete_member"
  ON onto_decisions FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "decision_delete_admin"
  ON onto_decisions FOR DELETE
  USING (is_admin());

-- onto_risks policies
CREATE POLICY "risk_select_member"
  ON onto_risks FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "risk_select_admin"
  ON onto_risks FOR SELECT
  USING (is_admin());

CREATE POLICY "risk_select_public"
  ON onto_risks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_risks.project_id AND p.is_public = true
  ));

CREATE POLICY "risk_insert_member"
  ON onto_risks FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "risk_insert_admin"
  ON onto_risks FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "risk_update_member"
  ON onto_risks FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "risk_update_admin"
  ON onto_risks FOR UPDATE
  USING (is_admin());

CREATE POLICY "risk_delete_member"
  ON onto_risks FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "risk_delete_admin"
  ON onto_risks FOR DELETE
  USING (is_admin());

-- onto_documents policies
CREATE POLICY "document_select_member"
  ON onto_documents FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "document_select_admin"
  ON onto_documents FOR SELECT
  USING (is_admin());

CREATE POLICY "document_select_public"
  ON onto_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_documents.project_id AND p.is_public = true
  ));

CREATE POLICY "document_insert_member"
  ON onto_documents FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "document_insert_admin"
  ON onto_documents FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "document_update_member"
  ON onto_documents FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "document_update_admin"
  ON onto_documents FOR UPDATE
  USING (is_admin());

CREATE POLICY "document_delete_member"
  ON onto_documents FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "document_delete_admin"
  ON onto_documents FOR DELETE
  USING (is_admin());

-- onto_edges policies
CREATE POLICY "edge_select_member"
  ON onto_edges FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "edge_select_admin"
  ON onto_edges FOR SELECT
  USING (is_admin());

CREATE POLICY "edge_select_public"
  ON onto_edges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_edges.project_id AND p.is_public = true
  ));

CREATE POLICY "edge_insert_member"
  ON onto_edges FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "edge_insert_admin"
  ON onto_edges FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "edge_update_member"
  ON onto_edges FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "edge_update_admin"
  ON onto_edges FOR UPDATE
  USING (is_admin());

CREATE POLICY "edge_delete_member"
  ON onto_edges FOR DELETE
  USING (current_actor_has_project_access(project_id, 'write'));

CREATE POLICY "edge_delete_admin"
  ON onto_edges FOR DELETE
  USING (is_admin());

-- onto_project_logs policies
CREATE POLICY "project_logs_select_member"
  ON onto_project_logs FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "project_logs_select_admin"
  ON onto_project_logs FOR SELECT
  USING (is_admin());

CREATE POLICY "project_logs_insert_member"
  ON onto_project_logs FOR INSERT
  WITH CHECK (
    current_actor_has_project_access(project_id, 'write')
    AND (
      changed_by_actor_id = current_actor_id()
      OR (changed_by_actor_id IS NULL AND changed_by = auth.uid())
    )
  );

CREATE POLICY "project_logs_service_role"
  ON onto_project_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- onto_project_members policies
CREATE POLICY "project_members_select_member"
  ON onto_project_members FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "project_members_select_admin"
  ON onto_project_members FOR SELECT
  USING (is_admin());

CREATE POLICY "project_members_insert_admin"
  ON onto_project_members FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_members_update_admin"
  ON onto_project_members FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_members_delete_admin"
  ON onto_project_members FOR DELETE
  USING (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_members_service_role"
  ON onto_project_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- onto_project_invites policies
CREATE POLICY "project_invites_select_admin"
  ON onto_project_invites FOR SELECT
  USING (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_invites_insert_admin"
  ON onto_project_invites FOR INSERT
  WITH CHECK (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_invites_update_admin"
  ON onto_project_invites FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_invites_delete_admin"
  ON onto_project_invites FOR DELETE
  USING (current_actor_has_project_access(project_id, 'admin'));

CREATE POLICY "project_invites_service_role"
  ON onto_project_invites FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
