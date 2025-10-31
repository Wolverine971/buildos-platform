-- Migration: Add Missing Foreign Key Constraints to Agent Tables
-- Date: 2025-10-30
-- Description: Adds FK constraints for chat_sessions references that were missing
-- Impact: Ensures referential integrity and enables cascading deletes

-- ============================================
-- STEP 1: Clean up any orphaned records
-- ============================================

-- Clean up agents with invalid session references
UPDATE agents
SET created_for_session = NULL
WHERE created_for_session IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = agents.created_for_session
  );

-- Clean up agent_plans with invalid session references
-- Note: session_id is NOT NULL, so we delete orphaned plans
DELETE FROM agent_plans
WHERE NOT EXISTS (
  SELECT 1 FROM chat_sessions
  WHERE chat_sessions.id = agent_plans.session_id
);

-- Clean up agent_chat_sessions with invalid parent references
UPDATE agent_chat_sessions
SET parent_session_id = NULL
WHERE parent_session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = agent_chat_sessions.parent_session_id
  );

-- Clean up agent_chat_messages with invalid parent references
UPDATE agent_chat_messages
SET parent_user_session_id = NULL
WHERE parent_user_session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = agent_chat_messages.parent_user_session_id
  );

-- ============================================
-- STEP 2: Add Foreign Key Constraints
-- ============================================

-- Add FK: agents.created_for_session → chat_sessions.id
-- ON DELETE SET NULL because this is an optional reference
ALTER TABLE agents
  ADD CONSTRAINT agents_created_for_session_fkey
  FOREIGN KEY (created_for_session)
  REFERENCES chat_sessions(id)
  ON DELETE SET NULL;

-- Add FK: agent_plans.session_id → chat_sessions.id
-- ON DELETE CASCADE because a plan without a session doesn't make sense
ALTER TABLE agent_plans
  ADD CONSTRAINT agent_plans_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES chat_sessions(id)
  ON DELETE CASCADE;

-- Add FK: agent_chat_sessions.parent_session_id → chat_sessions.id
-- ON DELETE SET NULL because agent sessions can continue without parent reference
ALTER TABLE agent_chat_sessions
  ADD CONSTRAINT agent_chat_sessions_parent_session_id_fkey
  FOREIGN KEY (parent_session_id)
  REFERENCES chat_sessions(id)
  ON DELETE SET NULL;

-- Add FK: agent_chat_messages.parent_user_session_id → chat_sessions.id
-- ON DELETE SET NULL because messages can exist without parent session reference
ALTER TABLE agent_chat_messages
  ADD CONSTRAINT agent_chat_messages_parent_user_session_id_fkey
  FOREIGN KEY (parent_user_session_id)
  REFERENCES chat_sessions(id)
  ON DELETE SET NULL;

-- ============================================
-- STEP 3: Remove Duplicate FK Constraint (Optional Cleanup)
-- ============================================

-- Note: There's a duplicate FK on agents.user_id
-- We keep agents_user_id_fkey (Supabase convention) and remove fk_agents_user
-- Uncomment if this duplicate exists in your database:

-- DROP CONSTRAINT IF EXISTS fk_agents_user;

-- ============================================
-- VERIFICATION QUERIES (Run manually after migration)
-- ============================================

-- Verify all FKs are in place:
-- SELECT
--   conname AS constraint_name,
--   conrelid::regclass AS table_name,
--   a.attname AS column_name,
--   confrelid::regclass AS foreign_table_name
-- FROM pg_constraint c
-- JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
-- WHERE c.contype = 'f'
--   AND conrelid::regclass::text IN ('agents', 'agent_plans', 'agent_chat_sessions', 'agent_chat_messages')
-- ORDER BY table_name, constraint_name;

-- Check for any remaining orphaned records (should return 0 rows):
-- SELECT COUNT(*) FROM agents WHERE created_for_session IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = agents.created_for_session);
-- SELECT COUNT(*) FROM agent_plans WHERE NOT EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = agent_plans.session_id);
-- SELECT COUNT(*) FROM agent_chat_sessions WHERE parent_session_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = agent_chat_sessions.parent_session_id);
-- SELECT COUNT(*) FROM agent_chat_messages WHERE parent_user_session_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = agent_chat_messages.parent_user_session_id);
