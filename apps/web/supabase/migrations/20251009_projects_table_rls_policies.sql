-- =====================================================
-- PROJECTS TABLE ROW LEVEL SECURITY POLICIES
-- =====================================================
-- Implements comprehensive RLS policies for the projects table
-- Requirements:
--   1. Admins can perform all operations (SELECT, INSERT, UPDATE, DELETE) on any project
--   2. Users can perform all operations on their own projects (where user_id = auth.uid())
--
-- Created: 2025-10-09
-- =====================================================

-- =====================================================
-- 0. HELPER FUNCTIONS (before policies)
-- =====================================================
-- Create security definer function to check admin status without RLS recursion
-- NOTE: This function is shared across multiple migration files
-- We use CREATE OR REPLACE to handle cases where it already exists

-- Drop the function if it exists (with proper signature)
DROP FUNCTION IF EXISTS is_admin(UUID);

CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_admin(UUID) IS 'Checks if a user is an admin. SECURITY DEFINER bypasses RLS to prevent infinite recursion.';

-- Grant execute to authenticated users (safe to run multiple times)
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;

-- =====================================================
-- 1. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. DROP EXISTING POLICIES (if any)
-- =====================================================

-- Clean slate - drop any existing policies
DROP POLICY IF EXISTS "Admins have full access to all projects" ON projects;
DROP POLICY IF EXISTS "Users have full access to their own projects" ON projects;
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

-- =====================================================
-- 3. CREATE ADMIN POLICIES
-- =====================================================

-- Policy 1: Admins can perform all operations on any project
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins have full access to all projects"
ON projects
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- =====================================================
-- 4. CREATE USER POLICIES
-- =====================================================

-- Policy 2: Users can perform all operations on their own projects
CREATE POLICY "Users have full access to their own projects"
ON projects
FOR ALL
TO authenticated
USING (
  -- User can access projects they own
  auth.uid() = user_id
)
WITH CHECK (
  -- User can only create/update projects where they are the owner
  auth.uid() = user_id
);

-- =====================================================
-- 5. CREATE SERVICE ROLE POLICY (for backend operations)
-- =====================================================

-- Policy 3: Service role (backend) has unrestricted access
CREATE POLICY "Service role has full access to projects"
ON projects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- 6. ADD HELPFUL COMMENTS
-- =====================================================

COMMENT ON TABLE projects IS 'RLS ENABLED - Admins have full access, users can only access their own projects';

COMMENT ON POLICY "Admins have full access to all projects" ON projects IS
  'Allows admin users (checked via is_admin() SECURITY DEFINER function to avoid recursion) to perform all operations on any project';

COMMENT ON POLICY "Users have full access to their own projects" ON projects IS
  'Allows authenticated users to SELECT, INSERT, UPDATE, DELETE projects where user_id matches their auth.uid()';

COMMENT ON POLICY "Service role has full access to projects" ON projects IS
  'Allows service role (backend/worker services) unrestricted access for automated operations';

-- =====================================================
-- 7. VERIFICATION QUERIES (commented out - for testing)
-- =====================================================

-- Uncomment these queries to verify the policies work correctly:
--
-- -- Test as regular user (should only see their own projects)
-- SELECT id, name, user_id FROM projects;
--
-- -- Test as admin (should see all projects)
-- SELECT id, name, user_id FROM projects;
--
-- -- Test insert as user (should only succeed if user_id = auth.uid())
-- INSERT INTO projects (name, user_id, status, slug)
-- VALUES ('Test Project', auth.uid(), 'planning', 'test-project');
--
-- -- Test update as user (should only succeed on their own projects)
-- UPDATE projects SET name = 'Updated' WHERE user_id = auth.uid();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
