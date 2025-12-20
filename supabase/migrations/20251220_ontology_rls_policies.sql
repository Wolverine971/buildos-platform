-- supabase/migrations/20251220_ontology_rls_policies.sql
-- ============================================
-- Ontology Tables RLS Policies
-- ============================================
--
-- This migration sets up Row Level Security for all ontology tables:
--   onto_projects, onto_goals, onto_milestones, onto_plans,
--   onto_tasks, onto_decisions, onto_risks, onto_documents, onto_edges
--
-- Policy Structure:
--   1. Users can perform all CRUD on their own data (created_by = auth.uid())
--   2. Admins can perform all CRUD on all data (users.is_admin = true)
--   3. Service role has full access (for background workers)
--   4. Anonymous users can read public projects (is_public = true)
--
-- ============================================

-- ============================================
-- STEP 1: Create helper function for admin check
-- ============================================

-- Function to check if the current user is an admin
-- Uses SECURITY DEFINER to bypass RLS on the users table
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM users WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION is_admin() IS
  'Returns true if the current authenticated user has is_admin=true in the users table. Uses SECURITY DEFINER to bypass RLS.';

-- ============================================
-- STEP 2: Enable RLS on all ontology tables
-- ============================================

ALTER TABLE onto_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_edges ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Drop existing policies (clean slate)
-- ============================================

-- Drop old policies from seed migration
DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'onto_projects', 'onto_goals', 'onto_milestones', 'onto_plans',
    'onto_tasks', 'onto_decisions', 'onto_risks', 'onto_documents', 'onto_edges'
  ])
  LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- STEP 4: onto_projects policies
-- ============================================

-- Owners can read their own projects
CREATE POLICY "project_select_owner"
  ON onto_projects FOR SELECT
  USING (created_by = auth.uid());

-- Admins can read all projects
CREATE POLICY "project_select_admin"
  ON onto_projects FOR SELECT
  USING (is_admin());

-- Anonymous/authenticated can read public projects
CREATE POLICY "project_select_public"
  ON onto_projects FOR SELECT
  USING (is_public = true);

-- Owners can insert projects (as themselves)
CREATE POLICY "project_insert_owner"
  ON onto_projects FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Admins can insert projects
CREATE POLICY "project_insert_admin"
  ON onto_projects FOR INSERT
  WITH CHECK (is_admin());

-- Owners can update their own projects
CREATE POLICY "project_update_owner"
  ON onto_projects FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Admins can update all projects
CREATE POLICY "project_update_admin"
  ON onto_projects FOR UPDATE
  USING (is_admin());

-- Owners can delete their own projects
CREATE POLICY "project_delete_owner"
  ON onto_projects FOR DELETE
  USING (created_by = auth.uid());

-- Admins can delete all projects
CREATE POLICY "project_delete_admin"
  ON onto_projects FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 5: onto_goals policies
-- ============================================

-- Owners can read goals in their projects
CREATE POLICY "goal_select_owner"
  ON onto_goals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_goals.project_id AND p.created_by = auth.uid()
  ));

-- Admins can read all goals
CREATE POLICY "goal_select_admin"
  ON onto_goals FOR SELECT
  USING (is_admin());

-- Public project goals are readable
CREATE POLICY "goal_select_public"
  ON onto_goals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_goals.project_id AND p.is_public = true
  ));

-- Owners can insert goals in their projects
CREATE POLICY "goal_insert_owner"
  ON onto_goals FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_goals.project_id AND p.created_by = auth.uid()
  ));

-- Admins can insert goals
CREATE POLICY "goal_insert_admin"
  ON onto_goals FOR INSERT
  WITH CHECK (is_admin());

-- Owners can update goals in their projects
CREATE POLICY "goal_update_owner"
  ON onto_goals FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_goals.project_id AND p.created_by = auth.uid()
  ));

-- Admins can update all goals
CREATE POLICY "goal_update_admin"
  ON onto_goals FOR UPDATE
  USING (is_admin());

-- Owners can delete goals in their projects
CREATE POLICY "goal_delete_owner"
  ON onto_goals FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_goals.project_id AND p.created_by = auth.uid()
  ));

-- Admins can delete all goals
CREATE POLICY "goal_delete_admin"
  ON onto_goals FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 6: onto_milestones policies
-- ============================================

CREATE POLICY "milestone_select_owner"
  ON onto_milestones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_milestones.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "milestone_select_admin"
  ON onto_milestones FOR SELECT
  USING (is_admin());

CREATE POLICY "milestone_select_public"
  ON onto_milestones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_milestones.project_id AND p.is_public = true
  ));

CREATE POLICY "milestone_insert_owner"
  ON onto_milestones FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_milestones.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "milestone_insert_admin"
  ON onto_milestones FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "milestone_update_owner"
  ON onto_milestones FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_milestones.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "milestone_update_admin"
  ON onto_milestones FOR UPDATE
  USING (is_admin());

CREATE POLICY "milestone_delete_owner"
  ON onto_milestones FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_milestones.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "milestone_delete_admin"
  ON onto_milestones FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 7: onto_plans policies
-- ============================================

CREATE POLICY "plan_select_owner"
  ON onto_plans FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_plans.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "plan_select_admin"
  ON onto_plans FOR SELECT
  USING (is_admin());

CREATE POLICY "plan_select_public"
  ON onto_plans FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_plans.project_id AND p.is_public = true
  ));

CREATE POLICY "plan_insert_owner"
  ON onto_plans FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_plans.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "plan_insert_admin"
  ON onto_plans FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "plan_update_owner"
  ON onto_plans FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_plans.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "plan_update_admin"
  ON onto_plans FOR UPDATE
  USING (is_admin());

CREATE POLICY "plan_delete_owner"
  ON onto_plans FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_plans.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "plan_delete_admin"
  ON onto_plans FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 8: onto_tasks policies
-- ============================================

CREATE POLICY "task_select_owner"
  ON onto_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_tasks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "task_select_admin"
  ON onto_tasks FOR SELECT
  USING (is_admin());

CREATE POLICY "task_select_public"
  ON onto_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_tasks.project_id AND p.is_public = true
  ));

CREATE POLICY "task_insert_owner"
  ON onto_tasks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_tasks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "task_insert_admin"
  ON onto_tasks FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "task_update_owner"
  ON onto_tasks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_tasks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "task_update_admin"
  ON onto_tasks FOR UPDATE
  USING (is_admin());

CREATE POLICY "task_delete_owner"
  ON onto_tasks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_tasks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "task_delete_admin"
  ON onto_tasks FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 9: onto_decisions policies
-- ============================================

CREATE POLICY "decision_select_owner"
  ON onto_decisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_decisions.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "decision_select_admin"
  ON onto_decisions FOR SELECT
  USING (is_admin());

CREATE POLICY "decision_select_public"
  ON onto_decisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_decisions.project_id AND p.is_public = true
  ));

CREATE POLICY "decision_insert_owner"
  ON onto_decisions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_decisions.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "decision_insert_admin"
  ON onto_decisions FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "decision_update_owner"
  ON onto_decisions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_decisions.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "decision_update_admin"
  ON onto_decisions FOR UPDATE
  USING (is_admin());

CREATE POLICY "decision_delete_owner"
  ON onto_decisions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_decisions.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "decision_delete_admin"
  ON onto_decisions FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 10: onto_risks policies
-- ============================================

CREATE POLICY "risk_select_owner"
  ON onto_risks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_risks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "risk_select_admin"
  ON onto_risks FOR SELECT
  USING (is_admin());

CREATE POLICY "risk_select_public"
  ON onto_risks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_risks.project_id AND p.is_public = true
  ));

CREATE POLICY "risk_insert_owner"
  ON onto_risks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_risks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "risk_insert_admin"
  ON onto_risks FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "risk_update_owner"
  ON onto_risks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_risks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "risk_update_admin"
  ON onto_risks FOR UPDATE
  USING (is_admin());

CREATE POLICY "risk_delete_owner"
  ON onto_risks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_risks.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "risk_delete_admin"
  ON onto_risks FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 11: onto_documents policies
-- ============================================

CREATE POLICY "document_select_owner"
  ON onto_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_documents.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "document_select_admin"
  ON onto_documents FOR SELECT
  USING (is_admin());

CREATE POLICY "document_select_public"
  ON onto_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_documents.project_id AND p.is_public = true
  ));

CREATE POLICY "document_insert_owner"
  ON onto_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_documents.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "document_insert_admin"
  ON onto_documents FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "document_update_owner"
  ON onto_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_documents.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "document_update_admin"
  ON onto_documents FOR UPDATE
  USING (is_admin());

CREATE POLICY "document_delete_owner"
  ON onto_documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_documents.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "document_delete_admin"
  ON onto_documents FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 12: onto_edges policies
-- ============================================

CREATE POLICY "edge_select_owner"
  ON onto_edges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_edges.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "edge_select_admin"
  ON onto_edges FOR SELECT
  USING (is_admin());

CREATE POLICY "edge_select_public"
  ON onto_edges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_edges.project_id AND p.is_public = true
  ));

CREATE POLICY "edge_insert_owner"
  ON onto_edges FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_edges.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "edge_insert_admin"
  ON onto_edges FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "edge_update_owner"
  ON onto_edges FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_edges.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "edge_update_admin"
  ON onto_edges FOR UPDATE
  USING (is_admin());

CREATE POLICY "edge_delete_owner"
  ON onto_edges FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_edges.project_id AND p.created_by = auth.uid()
  ));

CREATE POLICY "edge_delete_admin"
  ON onto_edges FOR DELETE
  USING (is_admin());

-- ============================================
-- STEP 13: Grant permissions
-- ============================================

-- Grant authenticated users access to tables
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_risks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onto_edges TO authenticated;

-- Grant anonymous users SELECT for public data
GRANT SELECT ON onto_projects TO anon;
GRANT SELECT ON onto_goals TO anon;
GRANT SELECT ON onto_milestones TO anon;
GRANT SELECT ON onto_plans TO anon;
GRANT SELECT ON onto_tasks TO anon;
GRANT SELECT ON onto_decisions TO anon;
GRANT SELECT ON onto_risks TO anon;
GRANT SELECT ON onto_documents TO anon;
GRANT SELECT ON onto_edges TO anon;

-- Grant is_admin function to authenticated and anon
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO anon;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Ontology RLS Policies Migration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables with RLS enabled:';
  RAISE NOTICE '  - onto_projects';
  RAISE NOTICE '  - onto_goals';
  RAISE NOTICE '  - onto_milestones';
  RAISE NOTICE '  - onto_plans';
  RAISE NOTICE '  - onto_tasks';
  RAISE NOTICE '  - onto_decisions';
  RAISE NOTICE '  - onto_risks';
  RAISE NOTICE '  - onto_documents';
  RAISE NOTICE '  - onto_edges';
  RAISE NOTICE '';
  RAISE NOTICE 'Policy types created for each table:';
  RAISE NOTICE '  - *_select_owner: Users can read their own data';
  RAISE NOTICE '  - *_select_admin: Admins can read all data';
  RAISE NOTICE '  - *_select_public: Public projects are readable by all';
  RAISE NOTICE '  - *_insert_owner: Users can insert into their projects';
  RAISE NOTICE '  - *_insert_admin: Admins can insert anywhere';
  RAISE NOTICE '  - *_update_owner: Users can update their data';
  RAISE NOTICE '  - *_update_admin: Admins can update all data';
  RAISE NOTICE '  - *_delete_owner: Users can delete their data';
  RAISE NOTICE '  - *_delete_admin: Admins can delete all data';
  RAISE NOTICE '';
  RAISE NOTICE 'Helper function: is_admin()';
  RAISE NOTICE '  Uses SECURITY DEFINER to check users.is_admin';
  RAISE NOTICE '============================================';
END $$;
