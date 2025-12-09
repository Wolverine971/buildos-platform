-- supabase/migrations/20251217_agent_research_read_only.sql
-- Migration: Create agent research tables (read-only ontology scope, no repo/doc generation)
-- Description: Supports AI agent chat (Actionable Insight Agent) sessions that read ontology data and stream findings.
-- Notes:
--   - No write operations by the agent in v1.
--   - No repo/file access in v1.
--   - No automatic research document table in v1 (artifacts only).

-- ============================================================================
-- agent_research_sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_research_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL, -- e.g., actionable_insight_agent
    goal TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'failed', 'aborted')),

    last_message_id UUID,
    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_research_sessions_project ON agent_research_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_research_sessions_user ON agent_research_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_research_sessions_status ON agent_research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_research_sessions_created_at ON agent_research_sessions(created_at DESC);

COMMENT ON TABLE agent_research_sessions IS 'Research-oriented agent chat sessions (read-only, ontology scoped)';
COMMENT ON COLUMN agent_research_sessions.goal IS 'User-stated goal; not limited to doc generation';

-- ============================================================================
-- agent_research_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_research_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL REFERENCES agent_research_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content TEXT NOT NULL,
    tool_name TEXT,
    tool_args JSONB,
    tool_call_id TEXT,

    tokens_used INTEGER,
    model_used TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_research_messages_session ON agent_research_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_research_messages_created_at ON agent_research_messages(created_at DESC);

COMMENT ON TABLE agent_research_messages IS 'Messages within research agent sessions, including tool call/result placeholders';

-- ============================================================================
-- agent_research_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_research_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL REFERENCES agent_research_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'executing', 'synthesizing', 'completed', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error TEXT,
    stats JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_research_runs_session ON agent_research_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_research_runs_status ON agent_research_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_research_runs_started_at ON agent_research_runs(started_at DESC);

COMMENT ON TABLE agent_research_runs IS 'Execution runs within a research session (read-only plan/run metadata)';

-- ============================================================================
-- research_artifact_refs (ontology-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS research_artifact_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL REFERENCES agent_research_sessions(id) ON DELETE CASCADE,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('task', 'goal', 'plan', 'doc', 'other')),
    ref JSONB NOT NULL, -- e.g., {taskId}, {goalId}, {planId}, {docId}
    snippet TEXT,
    importance SMALLINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_artifact_refs_session ON research_artifact_refs(session_id);
CREATE INDEX IF NOT EXISTS idx_research_artifact_refs_type ON research_artifact_refs(ref_type);

COMMENT ON TABLE research_artifact_refs IS 'References to ontology artifacts read during a research session (read-only scope)';
