-- Migration: Fix chat_sessions.user_id foreign key constraint
-- Description: Changes FK from auth.users to public.users for PostgREST relationship detection
-- Author: BuildOS Team
-- Date: 2025-10-30
-- Reason: chat_sessions.user_id references auth.users(id) but should reference public.users(id)
--         to match chat_messages.user_id and allow PostgREST to detect the relationship.
--         This fixes the error: "Could not find a relationship between 'chat_sessions' and 'users'"

-- ============================================================================
-- PART 1: Drop the old foreign key constraint to auth.users
-- ============================================================================

ALTER TABLE chat_sessions
DROP CONSTRAINT IF EXISTS chat_sessions_user_id_fkey;

-- ============================================================================
-- PART 2: Add new foreign key constraint to public.users
-- ============================================================================

ALTER TABLE chat_sessions
ADD CONSTRAINT chat_sessions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 3: Verify the constraint is properly set
-- ============================================================================

-- This comment documents the change for future reference
COMMENT ON CONSTRAINT chat_sessions_user_id_fkey ON chat_sessions IS
  'Foreign key to public.users table. Changed from auth.users to public.users for PostgREST relationship detection. Migration: 20251030';

-- ============================================================================
-- Migration Complete
-- ============================================================================
