-- Migration: Add PostgreSQL Enums for Agent System
-- Created: 2025-10-29
-- Description: Replaces TEXT CHECK constraints with proper PostgreSQL enums for type safety

-- ============================================
-- CREATE ENUMS
-- ============================================

-- Agent types
CREATE TYPE agent_type AS ENUM ('planner', 'executor');

-- Agent permissions
CREATE TYPE agent_permission AS ENUM ('read_only', 'read_write');

-- Agent and session status
CREATE TYPE agent_status AS ENUM ('active', 'completed', 'failed');

-- Planning strategies
CREATE TYPE planning_strategy AS ENUM ('direct', 'complex');

-- Execution status (with 'executing' state)
CREATE TYPE execution_status AS ENUM ('pending', 'executing', 'completed', 'failed');

-- Agent session types
CREATE TYPE agent_session_type AS ENUM ('planner_thinking', 'planner_executor');

-- Message sender types
CREATE TYPE message_sender_type AS ENUM ('planner', 'executor', 'system');

-- LLM message roles
CREATE TYPE message_role AS ENUM ('system', 'user', 'assistant', 'tool');

-- ============================================
-- ALTER TABLES TO USE ENUMS
-- ============================================

-- agents table
-- Step 1: Drop CHECK constraints FIRST (before type conversion)
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_type_check;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_permissions_check;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_status_check;

-- Step 2: Drop defaults (can't cast defaults automatically)
ALTER TABLE agents
    ALTER COLUMN type DROP DEFAULT,
    ALTER COLUMN permissions DROP DEFAULT,
    ALTER COLUMN status DROP DEFAULT;

-- Step 3: Change column types to enums
ALTER TABLE agents
    ALTER COLUMN type TYPE agent_type USING type::agent_type,
    ALTER COLUMN permissions TYPE agent_permission USING permissions::agent_permission,
    ALTER COLUMN status TYPE agent_status USING status::agent_status;

-- Step 4: Re-add defaults (now with enum types)
ALTER TABLE agents
    ALTER COLUMN status SET DEFAULT 'active'::agent_status;

-- agent_plans table
-- Step 1: Drop CHECK constraints FIRST
ALTER TABLE agent_plans DROP CONSTRAINT IF EXISTS agent_plans_strategy_check;
ALTER TABLE agent_plans DROP CONSTRAINT IF EXISTS agent_plans_status_check;

-- Step 2: Drop defaults
ALTER TABLE agent_plans
    ALTER COLUMN status DROP DEFAULT;

-- Step 3: Change column types to enums
ALTER TABLE agent_plans
    ALTER COLUMN strategy TYPE planning_strategy USING (
        CASE
            WHEN strategy = 'simple' THEN 'direct'::planning_strategy
            WHEN strategy = 'tool_use' THEN 'direct'::planning_strategy
            ELSE strategy::planning_strategy
        END
    ),
    ALTER COLUMN status TYPE execution_status USING status::execution_status;

-- Step 4: Re-add defaults
ALTER TABLE agent_plans
    ALTER COLUMN status SET DEFAULT 'pending'::execution_status;

-- agent_chat_sessions table
-- Step 1: Drop CHECK constraints FIRST
ALTER TABLE agent_chat_sessions DROP CONSTRAINT IF EXISTS agent_chat_sessions_session_type_check;
ALTER TABLE agent_chat_sessions DROP CONSTRAINT IF EXISTS agent_chat_sessions_status_check;

-- Step 2: Drop defaults
ALTER TABLE agent_chat_sessions
    ALTER COLUMN status DROP DEFAULT,
    ALTER COLUMN message_count DROP DEFAULT;

-- Step 3: Change column types to enums
ALTER TABLE agent_chat_sessions
    ALTER COLUMN session_type TYPE agent_session_type USING session_type::agent_session_type,
    ALTER COLUMN status TYPE agent_status USING status::agent_status;

-- Step 4: Re-add defaults
ALTER TABLE agent_chat_sessions
    ALTER COLUMN status SET DEFAULT 'active'::agent_status,
    ALTER COLUMN message_count SET DEFAULT 0;

-- agent_chat_messages table
-- Step 1: Drop CHECK constraints FIRST
ALTER TABLE agent_chat_messages DROP CONSTRAINT IF EXISTS agent_chat_messages_sender_type_check;
ALTER TABLE agent_chat_messages DROP CONSTRAINT IF EXISTS agent_chat_messages_role_check;

-- Step 2: Change column types to enums (no defaults to worry about)
ALTER TABLE agent_chat_messages
    ALTER COLUMN sender_type TYPE message_sender_type USING sender_type::message_sender_type,
    ALTER COLUMN role TYPE message_role USING role::message_role;

-- agent_executions table
-- Step 1: Drop CHECK constraints FIRST
ALTER TABLE agent_executions DROP CONSTRAINT IF EXISTS agent_executions_status_check;

-- Step 2: Drop defaults
ALTER TABLE agent_executions
    ALTER COLUMN success DROP DEFAULT,
    ALTER COLUMN tokens_used DROP DEFAULT,
    ALTER COLUMN duration_ms DROP DEFAULT,
    ALTER COLUMN tool_calls_made DROP DEFAULT,
    ALTER COLUMN message_count DROP DEFAULT,
    ALTER COLUMN status DROP DEFAULT;

-- Step 3: Change column type to enum
ALTER TABLE agent_executions
    ALTER COLUMN status TYPE execution_status USING status::execution_status;

-- Step 4: Re-add defaults
ALTER TABLE agent_executions
    ALTER COLUMN success SET DEFAULT false,
    ALTER COLUMN tokens_used SET DEFAULT 0,
    ALTER COLUMN duration_ms SET DEFAULT 0,
    ALTER COLUMN tool_calls_made SET DEFAULT 0,
    ALTER COLUMN message_count SET DEFAULT 0,
    ALTER COLUMN status SET DEFAULT 'pending'::execution_status;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TYPE agent_type IS 'Agent types: planner (orchestrator) or executor (task runner)';
COMMENT ON TYPE agent_permission IS 'Agent permissions: read_only (executor) or read_write (planner)';
COMMENT ON TYPE agent_status IS 'Agent/session status: active, completed, or failed';
COMMENT ON TYPE planning_strategy IS 'Planning strategy: direct (single-step with tools) or complex (multi-step with executors)';
COMMENT ON TYPE execution_status IS 'Execution status: pending, executing, completed, or failed';
COMMENT ON TYPE agent_session_type IS 'Session type: planner_thinking (planner only) or planner_executor (collaborative)';
COMMENT ON TYPE message_sender_type IS 'Message sender: planner, executor, or system';
COMMENT ON TYPE message_role IS 'LLM message role: system, user, assistant, or tool';
