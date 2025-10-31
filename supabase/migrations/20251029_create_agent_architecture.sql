-- Migration: Agent-to-Agent Architecture
-- Created: 2025-10-29
-- Description: Creates tables for multi-agent system with LLM-to-LLM conversations

-- ============================================
-- AGENT DEFINITIONS
-- ============================================

-- Agents table - Each agent instance (planner or executor)
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Agent identity
    type TEXT NOT NULL CHECK (type IN ('planner', 'executor')),
    name TEXT NOT NULL,

    -- Capabilities
    model_preference TEXT NOT NULL, -- e.g., 'deepseek-chat', 'deepseek-coder'
    available_tools JSONB DEFAULT '[]'::jsonb, -- Tool names available to this agent
    permissions TEXT NOT NULL CHECK (permissions IN ('read_only', 'read_write')),

    -- Context
    system_prompt TEXT NOT NULL,
    created_for_session UUID NOT NULL, -- FK to chat_sessions (user session)
    created_for_plan UUID, -- FK to agent_plans (if created for a plan)

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Ownership
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Indexes
    CONSTRAINT fk_agents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_session ON agents(created_for_session);
CREATE INDEX idx_agents_plan ON agents(created_for_plan);
CREATE INDEX idx_agents_type_status ON agents(type, status);
CREATE INDEX idx_agents_created_at ON agents(created_at DESC);

COMMENT ON TABLE agents IS 'Agent instances - each planner or executor agent with its own identity and capabilities';
COMMENT ON COLUMN agents.type IS 'Agent type: planner (orchestrator) or executor (task runner)';
COMMENT ON COLUMN agents.permissions IS 'read_only (executor) or read_write (planner)';
COMMENT ON COLUMN agents.model_preference IS 'LLM model to use: deepseek-chat (planner), deepseek-coder (executor)';

-- ============================================
-- AGENT PLANS
-- ============================================

-- Agent Plans table - Execution plans created by planner
CREATE TABLE IF NOT EXISTS agent_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session context
    session_id UUID NOT NULL, -- FK to chat_sessions (user's session)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    planner_agent_id UUID NOT NULL, -- FK to agents

    -- Plan content
    user_message TEXT NOT NULL, -- Original user message
    strategy TEXT NOT NULL CHECK (strategy IN ('simple', 'tool_use', 'complex')),
    steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of PlanStep objects

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign keys
    CONSTRAINT fk_agent_plans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_plans_planner FOREIGN KEY (planner_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_plans_user_id ON agent_plans(user_id);
CREATE INDEX idx_agent_plans_session ON agent_plans(session_id);
CREATE INDEX idx_agent_plans_planner ON agent_plans(planner_agent_id);
CREATE INDEX idx_agent_plans_status ON agent_plans(status);
CREATE INDEX idx_agent_plans_created_at ON agent_plans(created_at DESC);

COMMENT ON TABLE agent_plans IS 'Execution plans created by planner agents for complex queries';
COMMENT ON COLUMN agent_plans.strategy IS 'Planning strategy: simple (no tools), tool_use (direct), complex (spawn executors)';
COMMENT ON COLUMN agent_plans.steps IS 'Array of plan steps with dependencies and execution status';

-- ============================================
-- AGENT CHAT SESSIONS (LLM-to-LLM)
-- ============================================

-- Agent Chat Sessions table - Conversations between planner and executor
CREATE TABLE IF NOT EXISTS agent_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session context
    parent_session_id UUID NOT NULL, -- FK to chat_sessions (user's session)
    plan_id UUID, -- FK to agent_plans
    step_number INTEGER, -- Which plan step this session is for

    -- Participants
    planner_agent_id UUID NOT NULL, -- FK to agents
    executor_agent_id UUID, -- FK to agents (NULL if planner-only session)

    -- Session type
    session_type TEXT NOT NULL CHECK (session_type IN ('planner_thinking', 'planner_executor')),

    -- Context
    initial_context JSONB NOT NULL, -- Initial prompt, tools, constraints
    context_type TEXT, -- project, task, calendar, global, etc.
    entity_id UUID, -- Project/task ID being worked on

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
    message_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Ownership
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Foreign keys
    CONSTRAINT fk_agent_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_sessions_planner FOREIGN KEY (planner_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_sessions_executor FOREIGN KEY (executor_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_sessions_plan FOREIGN KEY (plan_id) REFERENCES agent_plans(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_sessions_user_id ON agent_chat_sessions(user_id);
CREATE INDEX idx_agent_sessions_parent ON agent_chat_sessions(parent_session_id);
CREATE INDEX idx_agent_sessions_plan ON agent_chat_sessions(plan_id);
CREATE INDEX idx_agent_sessions_planner ON agent_chat_sessions(planner_agent_id);
CREATE INDEX idx_agent_sessions_executor ON agent_chat_sessions(executor_agent_id);
CREATE INDEX idx_agent_sessions_status ON agent_chat_sessions(status);
CREATE INDEX idx_agent_sessions_created_at ON agent_chat_sessions(created_at DESC);

COMMENT ON TABLE agent_chat_sessions IS 'LLM-to-LLM conversation sessions between planner and executor agents';
COMMENT ON COLUMN agent_chat_sessions.session_type IS 'planner_thinking (planner only) or planner_executor (collaborative)';
COMMENT ON COLUMN agent_chat_sessions.initial_context IS 'Starting context with task, tools, constraints';

-- ============================================
-- AGENT CHAT MESSAGES (LLM-to-LLM)
-- ============================================

-- Agent Chat Messages table - Messages in agent-to-agent conversations
CREATE TABLE IF NOT EXISTS agent_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session
    agent_session_id UUID NOT NULL, -- FK to agent_chat_sessions

    -- Sender
    sender_type TEXT NOT NULL CHECK (sender_type IN ('planner', 'executor', 'system')),
    sender_agent_id UUID, -- FK to agents (NULL for system messages)

    -- Message content
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB, -- Tool calls made in this message
    tool_call_id TEXT, -- For tool response messages

    -- Metadata
    tokens_used INTEGER DEFAULT 0,
    model_used TEXT, -- Which LLM model was used for this message

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Tracing
    parent_user_session_id UUID NOT NULL, -- FK to chat_sessions (for tracing)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Foreign keys
    CONSTRAINT fk_agent_messages_session FOREIGN KEY (agent_session_id) REFERENCES agent_chat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_messages_sender FOREIGN KEY (sender_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    CONSTRAINT fk_agent_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_messages_session ON agent_chat_messages(agent_session_id);
CREATE INDEX idx_agent_messages_sender ON agent_chat_messages(sender_agent_id);
CREATE INDEX idx_agent_messages_user_session ON agent_chat_messages(parent_user_session_id);
CREATE INDEX idx_agent_messages_user_id ON agent_chat_messages(user_id);
CREATE INDEX idx_agent_messages_created_at ON agent_chat_messages(created_at DESC);

COMMENT ON TABLE agent_chat_messages IS 'Messages in LLM-to-LLM conversations between agents';
COMMENT ON COLUMN agent_chat_messages.sender_type IS 'planner, executor, or system';
COMMENT ON COLUMN agent_chat_messages.role IS 'LLM message role: system, user, assistant, or tool';

-- ============================================
-- AGENT EXECUTIONS
-- ============================================

-- Agent Executions table - Track each executor run for a plan step
CREATE TABLE IF NOT EXISTS agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plan context
    plan_id UUID NOT NULL, -- FK to agent_plans
    step_number INTEGER NOT NULL,

    -- Executor
    executor_agent_id UUID NOT NULL, -- FK to agents
    agent_session_id UUID NOT NULL, -- FK to agent_chat_sessions

    -- Task
    task JSONB NOT NULL, -- ExecutorTask object
    tools_available JSONB NOT NULL DEFAULT '[]'::jsonb, -- Tool definitions

    -- Results
    result JSONB, -- Execution result
    success BOOLEAN NOT NULL DEFAULT false,
    error TEXT,

    -- Metrics
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    tool_calls_made INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0, -- Messages in the agent session

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Ownership
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Foreign keys
    CONSTRAINT fk_agent_executions_plan FOREIGN KEY (plan_id) REFERENCES agent_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_executions_executor FOREIGN KEY (executor_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_executions_session FOREIGN KEY (agent_session_id) REFERENCES agent_chat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_executions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_executions_plan ON agent_executions(plan_id);
CREATE INDEX idx_agent_executions_executor ON agent_executions(executor_agent_id);
CREATE INDEX idx_agent_executions_session ON agent_executions(agent_session_id);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);
CREATE INDEX idx_agent_executions_user_id ON agent_executions(user_id);
CREATE INDEX idx_agent_executions_created_at ON agent_executions(created_at DESC);

COMMENT ON TABLE agent_executions IS 'Track each executor agent run for a plan step';
COMMENT ON COLUMN agent_executions.task IS 'ExecutorTask object with description, goal, constraints';
COMMENT ON COLUMN agent_executions.message_count IS 'Number of messages exchanged in the agent session';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access their own agent data

-- agents
CREATE POLICY agents_user_policy ON agents
    FOR ALL
    USING (user_id = auth.uid());

-- agent_plans
CREATE POLICY agent_plans_user_policy ON agent_plans
    FOR ALL
    USING (user_id = auth.uid());

-- agent_chat_sessions
CREATE POLICY agent_chat_sessions_user_policy ON agent_chat_sessions
    FOR ALL
    USING (user_id = auth.uid());

-- agent_chat_messages
CREATE POLICY agent_chat_messages_user_policy ON agent_chat_messages
    FOR ALL
    USING (user_id = auth.uid());

-- agent_executions
CREATE POLICY agent_executions_user_policy ON agent_executions
    FOR ALL
    USING (user_id = auth.uid());

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp for agent_plans
CREATE OR REPLACE FUNCTION update_agent_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_plans_updated_at
    BEFORE UPDATE ON agent_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_plans_updated_at();

-- Increment message count in agent_chat_sessions
CREATE OR REPLACE FUNCTION increment_agent_session_message_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agent_chat_sessions
    SET message_count = message_count + 1
    WHERE id = NEW.agent_session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_message_count_trigger
    AFTER INSERT ON agent_chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION increment_agent_session_message_count();

-- ============================================
-- GRANTS
-- ============================================

-- Grant access to authenticated users
GRANT ALL ON agents TO authenticated;
GRANT ALL ON agent_plans TO authenticated;
GRANT ALL ON agent_chat_sessions TO authenticated;
GRANT ALL ON agent_chat_messages TO authenticated;
GRANT ALL ON agent_executions TO authenticated;
