-- Migration: Add user_id column to chat_messages table
-- Description: Adds user_id column to chat_messages for proper user scoping and RLS policies
-- Author: BuildOS Team
-- Date: 2025-10-28
-- Reason: The chat_messages table was missing user_id column, causing PGRST204 errors
--         when trying to insert messages. This column is required for proper data isolation
--         and row-level security policies.

-- ============================================================================
-- PART 1: Add user_id column (nullable initially for backfill)
-- ============================================================================

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 2: Backfill user_id from chat_sessions for existing messages
-- ============================================================================

-- Update all existing messages to set user_id from their session
UPDATE chat_messages cm
SET user_id = cs.user_id
FROM chat_sessions cs
WHERE cm.session_id = cs.id
AND cm.user_id IS NULL;

-- ============================================================================
-- PART 3: Make user_id NOT NULL after backfill
-- ============================================================================

-- Now that all existing messages have user_id, make it required
ALTER TABLE chat_messages
ALTER COLUMN user_id SET NOT NULL;

-- ============================================================================
-- PART 4: Add index on user_id for performance
-- ============================================================================

-- Index for efficient user-scoped queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at DESC);

-- ============================================================================
-- PART 5: Add RLS policies for chat_messages
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own messages
CREATE POLICY IF NOT EXISTS "Users can view own chat messages" ON chat_messages
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own messages
CREATE POLICY IF NOT EXISTS "Users can insert own chat messages" ON chat_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own messages (for edits, metadata updates)
CREATE POLICY IF NOT EXISTS "Users can update own chat messages" ON chat_messages
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own messages
CREATE POLICY IF NOT EXISTS "Users can delete own chat messages" ON chat_messages
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 6: Add helpful comment
-- ============================================================================

COMMENT ON COLUMN chat_messages.user_id IS 'Foreign key to users table. Required for proper data isolation and RLS policies. Automatically populated from chat_sessions.user_id.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
