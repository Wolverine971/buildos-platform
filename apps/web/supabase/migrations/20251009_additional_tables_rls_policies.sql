-- =====================================================
-- ADDITIONAL TABLES ROW LEVEL SECURITY POLICIES
-- =====================================================
-- Implements comprehensive RLS policies for additional core tables
--
-- Tables covered:
--   1. tasks - User tasks with project associations
--   2. projects_history - Version history of projects
--   3. project_daily_briefs - Daily briefs per project
--   4. phases - Project phases
--   5. phase_tasks - Task assignments to phases
--   6. feedback - User feedback submissions
--   7. emails - Email logs
--   8. daily_briefs - User daily briefs
--   9. calendar_analyses - Calendar analysis results
--
-- Security Model:
--   - Admins: Full access to all tables
--   - Users: Full access to their own data
--   - Service Role: Full access for backend operations
--   - Ownership verified through JOIN for tables without direct user_id
--
-- Created: 2025-10-09
-- =====================================================

-- =====================================================
-- 0. HELPER FUNCTION (reuse existing)
-- =====================================================
-- The is_admin(UUID) function is already created by previous migrations
-- We just ensure it exists here for reference

-- Verify function exists (informational comment)
-- is_admin(UUID) should already exist from 20251009_core_tables_rls_policies.sql

-- =====================================================
-- 1. TASKS TABLE
-- =====================================================
-- Tasks owned by users, optionally associated with projects

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can manage their own tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can manage all tasks" ON tasks;
DROP POLICY IF EXISTS "Service role has full access to tasks" ON tasks;

-- Policy 1: Users can view and manage their own tasks
CREATE POLICY "Users can manage their own tasks"
ON tasks
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Admins can view all tasks
CREATE POLICY "Admins can view all tasks"
ON tasks
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Admins can manage all tasks
CREATE POLICY "Admins can manage all tasks"
ON tasks
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 4: Service role has full access
CREATE POLICY "Service role has full access to tasks"
ON tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE tasks IS 'RLS ENABLED - Users can manage own tasks, Admins have full access';

-- =====================================================
-- 2. PROJECTS_HISTORY TABLE
-- =====================================================
-- Version history of projects - ownership verified via projects table

ALTER TABLE projects_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view history of their projects" ON projects_history;
DROP POLICY IF EXISTS "Admins can view all project history" ON projects_history;
DROP POLICY IF EXISTS "Service role has full access to projects_history" ON projects_history;

-- Policy 1: Users can view history of their own projects
CREATE POLICY "Users can view history of their projects"
ON projects_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = projects_history.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Policy 2: Admins can view all project history
CREATE POLICY "Admins can view all project history"
ON projects_history
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access (includes INSERT for trigger)
CREATE POLICY "Service role has full access to projects_history"
ON projects_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE projects_history IS 'RLS ENABLED - Users can view history of own projects, Admins can view all. Service role can insert via trigger.';

-- =====================================================
-- 3. PROJECT_DAILY_BRIEFS TABLE
-- =====================================================
-- Daily briefs per project

ALTER TABLE project_daily_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage briefs for their projects" ON project_daily_briefs;
DROP POLICY IF EXISTS "Admins can manage all project briefs" ON project_daily_briefs;
DROP POLICY IF EXISTS "Service role has full access to project_daily_briefs" ON project_daily_briefs;

-- Policy 1: Users can manage briefs for their own projects
CREATE POLICY "Users can manage briefs for their projects"
ON project_daily_briefs
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_daily_briefs.project_id
    AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Admins can manage all project briefs
CREATE POLICY "Admins can manage all project briefs"
ON project_daily_briefs
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access
CREATE POLICY "Service role has full access to project_daily_briefs"
ON project_daily_briefs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE project_daily_briefs IS 'RLS ENABLED - Users can manage briefs for own projects, Admins have full access';

-- =====================================================
-- 4. PHASES TABLE
-- =====================================================
-- Project phases owned by users

ALTER TABLE phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage phases in their projects" ON phases;
DROP POLICY IF EXISTS "Admins can manage all phases" ON phases;
DROP POLICY IF EXISTS "Service role has full access to phases" ON phases;

-- Policy 1: Users can manage phases in their own projects
CREATE POLICY "Users can manage phases in their projects"
ON phases
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = phases.project_id
    AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = phases.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Policy 2: Admins can manage all phases
CREATE POLICY "Admins can manage all phases"
ON phases
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access
CREATE POLICY "Service role has full access to phases"
ON phases
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE phases IS 'RLS ENABLED - Users can manage phases in own projects, Admins have full access';

-- =====================================================
-- 5. PHASE_TASKS TABLE
-- =====================================================
-- Junction table - ownership verified via phases table

ALTER TABLE phase_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage phase tasks in their projects" ON phase_tasks;
DROP POLICY IF EXISTS "Admins can manage all phase tasks" ON phase_tasks;
DROP POLICY IF EXISTS "Service role has full access to phase_tasks" ON phase_tasks;

-- Policy 1: Users can manage phase tasks in their own projects
CREATE POLICY "Users can manage phase tasks in their projects"
ON phase_tasks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM phases
    WHERE phases.id = phase_tasks.phase_id
    AND phases.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM phases
    WHERE phases.id = phase_tasks.phase_id
    AND phases.user_id = auth.uid()
  )
);

-- Policy 2: Admins can manage all phase tasks
CREATE POLICY "Admins can manage all phase tasks"
ON phase_tasks
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access
CREATE POLICY "Service role has full access to phase_tasks"
ON phase_tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE phase_tasks IS 'RLS ENABLED - Users can manage phase tasks in own projects (verified via phases), Admins have full access';

-- =====================================================
-- 6. FEEDBACK TABLE
-- =====================================================
-- User feedback submissions

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own feedback" ON feedback;
DROP POLICY IF EXISTS "Users can create feedback" ON feedback;
DROP POLICY IF EXISTS "Admins can manage all feedback" ON feedback;
DROP POLICY IF EXISTS "Service role has full access to feedback" ON feedback;

-- Policy 1: Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
ON feedback
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

-- Policy 2: Users can create feedback (insert only)
CREATE POLICY "Users can create feedback"
ON feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 3: Admins can manage all feedback
CREATE POLICY "Admins can manage all feedback"
ON feedback
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 4: Service role has full access
CREATE POLICY "Service role has full access to feedback"
ON feedback
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE feedback IS 'RLS ENABLED - Users can view/create own feedback, Admins can manage all';

-- =====================================================
-- 7. EMAILS TABLE
-- =====================================================
-- Email logs created by users

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own emails" ON emails;
DROP POLICY IF EXISTS "Admins can manage all emails" ON emails;
DROP POLICY IF EXISTS "Service role has full access to emails" ON emails;

-- Policy 1: Users can view their own emails
CREATE POLICY "Users can view their own emails"
ON emails
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
);

-- Policy 2: Admins can manage all emails
CREATE POLICY "Admins can manage all emails"
ON emails
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access (needed for email sending)
CREATE POLICY "Service role has full access to emails"
ON emails
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE emails IS 'RLS ENABLED - Users can view own emails, Admins can manage all, Service role can send';

-- =====================================================
-- 8. DAILY_BRIEFS TABLE
-- =====================================================
-- User daily briefs

ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own daily briefs" ON daily_briefs;
DROP POLICY IF EXISTS "Admins can view all daily briefs" ON daily_briefs;
DROP POLICY IF EXISTS "Service role has full access to daily_briefs" ON daily_briefs;

-- Policy 1: Users can manage their own daily briefs
CREATE POLICY "Users can manage their own daily briefs"
ON daily_briefs
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Admins can view all daily briefs
CREATE POLICY "Admins can view all daily briefs"
ON daily_briefs
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access
CREATE POLICY "Service role has full access to daily_briefs"
ON daily_briefs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE daily_briefs IS 'RLS ENABLED - Users can manage own briefs, Admins can view all';

-- =====================================================
-- 9. CALENDAR_ANALYSES TABLE
-- =====================================================
-- Calendar analysis results per user

ALTER TABLE calendar_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own calendar analyses" ON calendar_analyses;
DROP POLICY IF EXISTS "Admins can view all calendar analyses" ON calendar_analyses;
DROP POLICY IF EXISTS "Service role has full access to calendar_analyses" ON calendar_analyses;

-- Policy 1: Users can manage their own calendar analyses
CREATE POLICY "Users can manage their own calendar analyses"
ON calendar_analyses
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Admins can view all calendar analyses
CREATE POLICY "Admins can view all calendar analyses"
ON calendar_analyses
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access
CREATE POLICY "Service role has full access to calendar_analyses"
ON calendar_analyses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE calendar_analyses IS 'RLS ENABLED - Users can manage own analyses, Admins can view all';

-- =====================================================
-- 10. VERIFICATION AND SUMMARY
-- =====================================================

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'ADDITIONAL TABLES RLS POLICIES APPLIED';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Tables protected:';
  RAISE NOTICE '  1. tasks - User task management';
  RAISE NOTICE '  2. projects_history - Version history (read-only for users)';
  RAISE NOTICE '  3. project_daily_briefs - Project briefs';
  RAISE NOTICE '  4. phases - Project phases';
  RAISE NOTICE '  5. phase_tasks - Phase task assignments (via JOIN)';
  RAISE NOTICE '  6. feedback - User feedback (insert + view own)';
  RAISE NOTICE '  7. emails - Email logs (view own)';
  RAISE NOTICE '  8. daily_briefs - User daily briefs';
  RAISE NOTICE '  9. calendar_analyses - Calendar analysis results';
  RAISE NOTICE '';
  RAISE NOTICE 'Security model:';
  RAISE NOTICE '  - Users: Full access to their own data';
  RAISE NOTICE '  - Admins: Full access to all tables';
  RAISE NOTICE '  - Service Role: Full access for automated operations';
  RAISE NOTICE '  - Indirect ownership verified via JOINs where needed';
  RAISE NOTICE '============================================';
END$$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
