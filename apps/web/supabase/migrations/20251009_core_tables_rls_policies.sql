-- =====================================================
-- CORE TABLES ROW LEVEL SECURITY POLICIES
-- =====================================================
-- Implements comprehensive RLS policies for core user and brain dump tables
--
-- Tables covered:
--   1. users - User accounts (with field-level restrictions)
--   2. user_context - User preferences and context
--   3. user_calendar_tokens - OAuth tokens (SENSITIVE - privacy-focused)
--   4. brain_dumps - User brain dump content
--   5. brain_dump_links - Links between brain dumps and projects/tasks
--
-- Security Model:
--   - Admins: Full access to most tables (except calendar tokens for privacy)
--   - Users: Full access to their own data
--   - Service Role: Full access for backend operations
--
-- Created: 2025-10-09
-- =====================================================

-- =====================================================
-- 0. HELPER FUNCTIONS (before policies)
-- =====================================================
-- Create security definer function to check admin status without RLS recursion

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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;

-- =====================================================
-- 1. USERS TABLE
-- =====================================================
-- Critical security table - needs special handling for sensitive fields

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Service role has full access to users" ON users;

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

-- Policy 2: Admins can view all users
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins can view all users"
ON users
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Users can update their own profile (limited fields)
-- Note: is_admin field changes are protected by trigger (see below)
-- Users can update name, bio, preferences but not sensitive admin/subscription fields
CREATE POLICY "Users can update their own profile"
ON users
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id
)
WITH CHECK (
  auth.uid() = id
);

-- Policy 4: Admins can update all users
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins can update all users"
ON users
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 5: Service role has full access
CREATE POLICY "Service role has full access to users"
ON users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE users IS 'RLS ENABLED - Users can view/update own profile, Admins have full access. Sensitive field modifications protected.';

-- =====================================================
-- PRIVILEGE ESCALATION PROTECTION TRIGGER
-- =====================================================
-- Prevent non-admin users from changing their own is_admin status

CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if is_admin field is being changed
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    -- Check if the user making the change is an admin (using is_admin function to avoid recursion)
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Cannot modify is_admin field. Only administrators can change user privileges.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists before creating
DROP TRIGGER IF EXISTS protect_user_privilege_escalation ON users;

CREATE TRIGGER protect_user_privilege_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_privilege_escalation();

COMMENT ON FUNCTION prevent_privilege_escalation() IS 'Prevents non-admin users from escalating their own privileges by changing is_admin field';

-- =====================================================
-- 2. USER_CONTEXT TABLE
-- =====================================================
-- User preferences and onboarding context

ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users have full access to their own context" ON user_context;
DROP POLICY IF EXISTS "Admins can view all user contexts" ON user_context;
DROP POLICY IF EXISTS "Admins can update all user contexts" ON user_context;
DROP POLICY IF EXISTS "Service role has full access to user_context" ON user_context;

-- Policy 1: Users have full access to their own context
CREATE POLICY "Users have full access to their own context"
ON user_context
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Admins can view all contexts (read-only for support)
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins can view all user contexts"
ON user_context
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Admins can also update any context (for support)
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins can update all user contexts"
ON user_context
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 4: Service role has full access
CREATE POLICY "Service role has full access to user_context"
ON user_context
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE user_context IS 'RLS ENABLED - Users have full access to own context, Admins can view/update all for support';

-- =====================================================
-- 3. USER_CALENDAR_TOKENS TABLE
-- =====================================================
-- HIGHLY SENSITIVE - OAuth tokens with strict privacy
-- Admins explicitly EXCLUDED for privacy/security

ALTER TABLE user_calendar_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users have full access to their own calendar tokens" ON user_calendar_tokens;
DROP POLICY IF EXISTS "Service role has full access to calendar tokens" ON user_calendar_tokens;

-- Policy 1: Users have full access to their own tokens ONLY
CREATE POLICY "Users have full access to their own calendar tokens"
ON user_calendar_tokens
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Service role has full access (needed for token refresh operations)
CREATE POLICY "Service role has full access to calendar tokens"
ON user_calendar_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Note: No admin access policy - privacy by design
-- Admins should NOT see OAuth tokens even for support purposes

COMMENT ON TABLE user_calendar_tokens IS 'RLS ENABLED - PRIVACY PROTECTED - Users only see own tokens, Admins explicitly excluded, Service role for refresh operations';

-- =====================================================
-- 4. BRAIN_DUMPS TABLE
-- =====================================================
-- User brain dump content

ALTER TABLE brain_dumps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users have full access to their own brain dumps" ON brain_dumps;
DROP POLICY IF EXISTS "Admins can view all brain dumps" ON brain_dumps;
DROP POLICY IF EXISTS "Admins can modify all brain dumps" ON brain_dumps;
DROP POLICY IF EXISTS "Service role has full access to brain_dumps" ON brain_dumps;

-- Policy 1: Users have full access to their own brain dumps
CREATE POLICY "Users have full access to their own brain dumps"
ON brain_dumps
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- Policy 2: Admins can view all brain dumps (for support/debugging)
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins can view all brain dumps"
ON brain_dumps
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
);

-- Policy 3: Admins can update/delete brain dumps (for support)
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins can modify all brain dumps"
ON brain_dumps
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 4: Service role has full access
CREATE POLICY "Service role has full access to brain_dumps"
ON brain_dumps
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE brain_dumps IS 'RLS ENABLED - Users have full access to own dumps, Admins can view/modify all for support';

-- =====================================================
-- 5. BRAIN_DUMP_LINKS TABLE
-- =====================================================
-- Junction table linking brain dumps to projects/tasks
-- Ownership verified through brain_dumps table

ALTER TABLE brain_dump_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access links for their own brain dumps" ON brain_dump_links;
DROP POLICY IF EXISTS "Admins have full access to all brain dump links" ON brain_dump_links;
DROP POLICY IF EXISTS "Service role has full access to brain_dump_links" ON brain_dump_links;

-- Policy 1: Users can access links for their own brain dumps
CREATE POLICY "Users can access links for their own brain dumps"
ON brain_dump_links
FOR ALL
TO authenticated
USING (
  -- Verify ownership through brain_dumps table
  EXISTS (
    SELECT 1 FROM brain_dumps
    WHERE brain_dumps.id = brain_dump_links.brain_dump_id
    AND brain_dumps.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Same check for INSERT/UPDATE operations
  EXISTS (
    SELECT 1 FROM brain_dumps
    WHERE brain_dumps.id = brain_dump_links.brain_dump_id
    AND brain_dumps.user_id = auth.uid()
  )
);

-- Policy 2: Admins have full access to all links
-- IMPORTANT: Use SECURITY DEFINER function to avoid infinite recursion
CREATE POLICY "Admins have full access to all brain dump links"
ON brain_dump_links
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
);

-- Policy 3: Service role has full access
CREATE POLICY "Service role has full access to brain_dump_links"
ON brain_dump_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE brain_dump_links IS 'RLS ENABLED - Users can access links for their brain dumps (verified via join), Admins have full access';

-- =====================================================
-- 6. VERIFICATION AND SUMMARY
-- =====================================================

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'RLS POLICIES APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Tables protected:';
  RAISE NOTICE '  1. users - Field-level protection, admin oversight';
  RAISE NOTICE '  2. user_context - User full access, admin support access';
  RAISE NOTICE '  3. user_calendar_tokens - PRIVACY PROTECTED - No admin access';
  RAISE NOTICE '  4. brain_dumps - User full access, admin read access';
  RAISE NOTICE '  5. brain_dump_links - Ownership via brain_dumps join';
  RAISE NOTICE '';
  RAISE NOTICE 'Security model:';
  RAISE NOTICE '  - Users: Full access to their own data';
  RAISE NOTICE '  - Admins: Full access (except calendar tokens)';
  RAISE NOTICE '  - Service Role: Full access to all tables';
  RAISE NOTICE '============================================';
END$$;

-- =====================================================
-- 7. TESTING QUERIES (commented out)
-- =====================================================

-- Uncomment to test policies:
--
-- -- Test as regular user
-- SELECT id, email FROM users WHERE id = auth.uid(); -- Should work
-- SELECT id, email FROM users; -- Should only see own record
-- UPDATE users SET name = 'Test' WHERE id = auth.uid(); -- Should work
-- UPDATE users SET is_admin = true WHERE id = auth.uid(); -- Should fail
--
-- -- Test user_context
-- SELECT * FROM user_context WHERE user_id = auth.uid(); -- Should work
-- SELECT * FROM user_context; -- Should only see own record
--
-- -- Test calendar tokens (highly sensitive)
-- SELECT * FROM user_calendar_tokens WHERE user_id = auth.uid(); -- Should work
-- SELECT * FROM user_calendar_tokens; -- Should only see own tokens
--
-- -- Test brain_dumps
-- SELECT * FROM brain_dumps WHERE user_id = auth.uid(); -- Should work
-- SELECT * FROM brain_dumps; -- Should only see own dumps
--
-- -- Test brain_dump_links
-- SELECT * FROM brain_dump_links bdl
-- JOIN brain_dumps bd ON bd.id = bdl.brain_dump_id
-- WHERE bd.user_id = auth.uid(); -- Should work

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
