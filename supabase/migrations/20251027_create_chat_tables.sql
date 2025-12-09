-- supabase/migrations/20251027_create_chat_tables.sql
-- =====================================================
-- Chat System Tables - Progressive Disclosure Pattern
-- =====================================================
-- This migration creates the chat system tables with support for
-- progressive disclosure pattern (abbreviated → detailed data flow)
-- to optimize token usage and provide intelligent context management.

-- =====================================================
-- 1. Chat Sessions Table
-- =====================================================
-- Stores chat sessions with context type and location
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session metadata
  title TEXT,
  auto_title TEXT, -- AI-generated title from first message

  -- Context information
  context_type TEXT NOT NULL CHECK (context_type IN ('global', 'project', 'task', 'calendar')),
  entity_id UUID, -- References projects.id or tasks.id depending on context_type

  -- Session state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'compressed')),

  -- Statistics
  message_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,

  -- User preferences for this session
  preferences JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  compressed_at TIMESTAMPTZ
);

-- =====================================================
-- 2. Chat Messages Table
-- =====================================================
-- Stores individual messages within chat sessions
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,

  -- For assistant messages with tool calls
  tool_calls JSONB, -- Array of tool call objects

  -- For tool messages (results)
  tool_call_id TEXT, -- Links to specific tool call
  tool_name TEXT, -- Name of the tool that was called
  tool_result JSONB, -- Result data from tool execution

  -- Token tracking
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Error tracking
  error_message TEXT,
  error_code TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. Chat Tool Executions Table
-- =====================================================
-- Tracks tool usage for analytics and optimization
CREATE TABLE IF NOT EXISTS chat_tool_executions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,

  -- Tool information
  tool_name TEXT NOT NULL,
  tool_category TEXT CHECK (tool_category IN ('list', 'detail', 'action', 'calendar')),

  -- Execution details
  arguments JSONB NOT NULL,
  result JSONB,

  -- Performance metrics
  execution_time_ms INTEGER,
  tokens_consumed INTEGER,

  -- Success tracking
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  requires_user_action BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. Chat Context Cache Table
-- =====================================================
-- Caches abbreviated context for quick loading
CREATE TABLE IF NOT EXISTS chat_context_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cache key
  context_type TEXT NOT NULL,
  entity_id UUID,
  cache_key TEXT GENERATED ALWAYS AS (
    COALESCE(context_type, 'global') || ':' || COALESCE(entity_id::TEXT, 'null')
  ) STORED,

  -- Cached data
  abbreviated_context JSONB NOT NULL, -- Abbreviated data structure
  full_context_available BOOLEAN DEFAULT false,

  -- Token counts
  abbreviated_tokens INTEGER NOT NULL,
  full_tokens_estimate INTEGER,

  -- Metadata
  related_entity_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Cache management
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 1,

  -- Unique constraint
  UNIQUE (user_id, cache_key)
);

-- =====================================================
-- 5. Chat Conversation Compression Table
-- =====================================================
-- Stores compressed conversation history for long sessions
CREATE TABLE IF NOT EXISTS chat_compressions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Compression details
  original_message_count INTEGER NOT NULL,
  compressed_message_count INTEGER NOT NULL,

  -- Token savings
  original_tokens INTEGER NOT NULL,
  compressed_tokens INTEGER NOT NULL,
  compression_ratio DECIMAL(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN original_tokens > 0
      THEN ROUND((1.0 - compressed_tokens::DECIMAL / original_tokens) * 100, 2)
      ELSE 0
    END
  ) STORED,

  -- Compressed content
  summary TEXT NOT NULL, -- AI-generated summary
  key_points JSONB, -- Array of important points preserved
  tool_usage_summary JSONB, -- Summary of tools used

  -- Message range compressed
  first_message_id UUID,
  last_message_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. Create Indexes
-- =====================================================

-- Indexes for chat_sessions
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions (user_id);
CREATE INDEX idx_chat_sessions_context ON chat_sessions (context_type, entity_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions (status);
CREATE INDEX idx_chat_sessions_last_message ON chat_sessions (last_message_at DESC);

-- Indexes for chat_messages
CREATE INDEX idx_chat_messages_session_id ON chat_messages (session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages (created_at);

-- Indexes for chat_tool_executions
CREATE INDEX idx_tool_executions_session ON chat_tool_executions (session_id);
CREATE INDEX idx_tool_executions_tool ON chat_tool_executions (tool_name);
CREATE INDEX idx_tool_executions_category ON chat_tool_executions (tool_category);
CREATE INDEX idx_tool_executions_created ON chat_tool_executions (created_at);

-- Indexes for chat_context_cache
CREATE INDEX idx_context_cache_user ON chat_context_cache (user_id);
CREATE INDEX idx_context_cache_key ON chat_context_cache (cache_key);
CREATE INDEX idx_context_cache_expires ON chat_context_cache (expires_at);

-- Indexes for chat_compressions
CREATE INDEX idx_compressions_session ON chat_compressions (session_id);

-- =====================================================
-- 7. RLS Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_context_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_compressions ENABLE ROW LEVEL SECURITY;

-- Chat Sessions Policies
CREATE POLICY "Users can view their own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions"
  ON chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat sessions"
  ON chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Chat Messages Policies (through session ownership)
CREATE POLICY "Users can view messages in their sessions"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Tool Executions Policies
CREATE POLICY "Users can view tool executions in their sessions"
  ON chat_tool_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_tool_executions.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tool executions in their sessions"
  ON chat_tool_executions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_tool_executions.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Context Cache Policies
CREATE POLICY "Users can view their own context cache"
  ON chat_context_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own context cache"
  ON chat_context_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own context cache"
  ON chat_context_cache FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own context cache"
  ON chat_context_cache FOR DELETE
  USING (auth.uid() = user_id);

-- Compression Policies
CREATE POLICY "Users can view compressions for their sessions"
  ON chat_compressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_compressions.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create compressions for their sessions"
  ON chat_compressions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_compressions.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- =====================================================
-- 8. Helper Functions
-- =====================================================

-- Function to update session statistics
CREATE OR REPLACE FUNCTION update_chat_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_sessions
    SET
      message_count = message_count + 1,
      total_tokens_used = total_tokens_used + COALESCE(NEW.total_tokens, 0),
      last_message_at = NEW.created_at,
      updated_at = NOW()
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session stats on new message
CREATE TRIGGER update_session_stats_on_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_stats();

-- Function to update tool call count
CREATE OR REPLACE FUNCTION update_tool_call_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_sessions
    SET
      tool_call_count = tool_call_count + 1,
      updated_at = NOW()
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update tool call count
CREATE TRIGGER update_tool_count_on_execution
  AFTER INSERT ON chat_tool_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_tool_call_count();

-- Function to clean expired context cache
CREATE OR REPLACE FUNCTION clean_expired_context_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_context_cache
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. Indexes for Performance
-- =====================================================

-- Composite indexes for common queries
CREATE INDEX idx_chat_sessions_user_active
  ON chat_sessions(user_id, status)
  WHERE status = 'active';

CREATE INDEX idx_chat_messages_session_recent
  ON chat_messages(session_id, created_at DESC);

CREATE INDEX idx_tool_executions_session_recent
  ON chat_tool_executions(session_id, created_at DESC);

-- Index for context cache lookups (removed partial index due to NOW() not being immutable)
CREATE INDEX idx_context_cache_active
  ON chat_context_cache(user_id, context_type, entity_id);

-- Index for compression lookup
CREATE INDEX idx_compressions_message_range
  ON chat_compressions(session_id, first_message_id, last_message_id);

-- =====================================================
-- 10. Comments for Documentation
-- =====================================================

COMMENT ON TABLE chat_sessions IS 'Stores chat sessions with context awareness and progressive disclosure support';
COMMENT ON TABLE chat_messages IS 'Individual messages within chat sessions including tool calls and results';
COMMENT ON TABLE chat_tool_executions IS 'Tracks tool usage for analytics and progressive disclosure optimization';
COMMENT ON TABLE chat_context_cache IS 'Caches abbreviated context for quick loading and token optimization';
COMMENT ON TABLE chat_compressions IS 'Stores compressed conversation history for long sessions to stay within token limits';

COMMENT ON COLUMN chat_sessions.context_type IS 'Type of context: global (general), project, task, or calendar focused';
COMMENT ON COLUMN chat_sessions.entity_id IS 'ID of the project or task when context_type is project or task';
COMMENT ON COLUMN chat_messages.tool_calls IS 'Array of tool calls made by the assistant in this message';
COMMENT ON COLUMN chat_context_cache.abbreviated_context IS 'Cached abbreviated data following progressive disclosure pattern';
COMMENT ON COLUMN chat_compressions.compression_ratio IS 'Percentage of tokens saved through compression (0-100)';