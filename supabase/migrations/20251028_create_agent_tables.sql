-- supabase/migrations/20251028_create_agent_tables.sql
-- Migration: Create Conversational Agent Tables
-- Description: Adds tables and schema extensions for the conversational project agent feature
-- Author: BuildOS Team
-- Date: 2025-10-28

-- ============================================================================
-- PART 1: Create project_drafts table
-- ============================================================================
-- Stores draft projects during conversational creation flow
CREATE TABLE IF NOT EXISTS project_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE UNIQUE,

    -- Mirror core fields from projects table
    name TEXT,
    slug TEXT,
    description TEXT,
    context TEXT,
    executive_summary TEXT,
    status TEXT CHECK (status IN ('active', 'paused', 'completed', 'archived')) DEFAULT 'active',
    tags TEXT[],
    start_date TIMESTAMP,
    end_date TIMESTAMP,

    -- Core dimensions (reuse exact field names from projects)
    core_integrity_ideals TEXT,
    core_people_bonds TEXT,
    core_goals_momentum TEXT,
    core_meaning_identity TEXT,
    core_reality_understanding TEXT,
    core_trust_safeguards TEXT,
    core_opportunity_freedom TEXT,
    core_power_resources TEXT,
    core_harmony_integration TEXT,

    -- Calendar fields
    calendar_color_id TEXT,
    calendar_settings JSONB,
    calendar_sync_enabled BOOLEAN DEFAULT false,

    -- Source tracking
    source TEXT,
    source_metadata JSONB,

    -- Metadata for agent conversation
    dimensions_covered TEXT[] DEFAULT '{}',
    question_count INTEGER DEFAULT 0,

    -- Lifecycle (no expiration as per requirements)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    -- Final project link
    finalized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL
);

-- Add indexes for performance
CREATE INDEX idx_project_drafts_user ON project_drafts(user_id);
CREATE INDEX idx_project_drafts_session ON project_drafts(chat_session_id);
CREATE INDEX idx_project_drafts_finalized ON project_drafts(finalized_project_id);
CREATE INDEX idx_project_drafts_status ON project_drafts(user_id, completed_at) WHERE completed_at IS NULL;

-- Add RLS policies
ALTER TABLE project_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts" ON project_drafts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own drafts" ON project_drafts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts" ON project_drafts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts" ON project_drafts
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 2: Create draft_tasks table
-- ============================================================================
-- Stores draft tasks associated with draft projects
CREATE TABLE IF NOT EXISTS draft_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_project_id UUID REFERENCES project_drafts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Mirror fields from tasks table
    title TEXT NOT NULL,
    description TEXT,
    details TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('backlog', 'in_progress', 'done', 'blocked')) DEFAULT 'backlog',
    task_type TEXT CHECK (task_type IN ('one_off', 'recurring')) DEFAULT 'one_off',

    -- Dates and time
    start_date TIMESTAMP,
    completed_at TIMESTAMP,
    duration_minutes INTEGER,

    -- Recurring task fields
    recurrence_pattern TEXT CHECK (recurrence_pattern IN (
        'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
    )),
    recurrence_ends TIMESTAMP,
    recurrence_end_source TEXT,

    -- Relationships
    parent_task_id UUID REFERENCES draft_tasks(id) ON DELETE SET NULL,
    dependencies UUID[],

    -- Task steps (JSON array)
    task_steps JSONB,

    -- Source tracking
    source TEXT,
    source_calendar_event_id TEXT,

    -- Status flags
    outdated BOOLEAN DEFAULT false,

    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- Link to final task when project is finalized
    finalized_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL
);

-- Add indexes for performance
CREATE INDEX idx_draft_tasks_project ON draft_tasks(draft_project_id);
CREATE INDEX idx_draft_tasks_user ON draft_tasks(user_id);
CREATE INDEX idx_draft_tasks_parent ON draft_tasks(parent_task_id);
CREATE INDEX idx_draft_tasks_finalized ON draft_tasks(finalized_task_id);

-- Add RLS policies
ALTER TABLE draft_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own draft tasks" ON draft_tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own draft tasks" ON draft_tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own draft tasks" ON draft_tasks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own draft tasks" ON draft_tasks
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3: Create chat_operations table
-- ============================================================================
-- Stores all operations generated by the agent for transparency and rollback
CREATE TABLE IF NOT EXISTS chat_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Operation details (matching ParsedOperation interface)
    table_name TEXT NOT NULL,
    operation_type TEXT CHECK (operation_type IN ('create', 'update', 'delete')) NOT NULL,
    entity_id UUID,
    ref TEXT,

    -- Operation data (matches ParsedOperation.data structure)
    data JSONB NOT NULL,
    search_query TEXT,
    conditions JSONB,

    -- Execution tracking
    status TEXT CHECK (status IN (
        'pending', 'queued', 'executing', 'completed', 'failed', 'rolled_back', 'partial'
    )) DEFAULT 'pending',
    enabled BOOLEAN DEFAULT true,
    error_message TEXT,
    reasoning TEXT,
    result JSONB,

    -- For updates, track before/after states
    before_data JSONB,
    after_data JSONB,

    -- Metadata
    executed_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Grouping related operations
    batch_id UUID,
    sequence_number INTEGER
);

-- Add indexes for performance
CREATE INDEX idx_chat_operations_session ON chat_operations(chat_session_id, created_at DESC);
CREATE INDEX idx_chat_operations_entity ON chat_operations(table_name, entity_id);
CREATE INDEX idx_chat_operations_status ON chat_operations(status);
CREATE INDEX idx_chat_operations_batch ON chat_operations(batch_id, sequence_number);
CREATE INDEX idx_chat_operations_user ON chat_operations(user_id, created_at DESC);

-- Add RLS policies
ALTER TABLE chat_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operations" ON chat_operations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own operations" ON chat_operations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own operations" ON chat_operations
    FOR UPDATE USING (auth.uid() = user_id);

-- No delete policy - operations should not be deleted for audit trail

-- ============================================================================
-- PART 4: Create junction tables for many-to-many relationships
-- ============================================================================

-- Chat sessions to projects
CREATE TABLE IF NOT EXISTS chat_sessions_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_session_id, project_id)
);

CREATE INDEX idx_csp_session ON chat_sessions_projects(chat_session_id);
CREATE INDEX idx_csp_project ON chat_sessions_projects(project_id);

-- Add RLS
ALTER TABLE chat_sessions_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session-project links" ON chat_sessions_projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_sessions_projects.chat_session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own session-project links" ON chat_sessions_projects
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_sessions_projects.chat_session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- Chat sessions to tasks
CREATE TABLE IF NOT EXISTS chat_sessions_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_session_id, task_id)
);

CREATE INDEX idx_cst_session ON chat_sessions_tasks(chat_session_id);
CREATE INDEX idx_cst_task ON chat_sessions_tasks(task_id);

-- Add RLS
ALTER TABLE chat_sessions_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session-task links" ON chat_sessions_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_sessions_tasks.chat_session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own session-task links" ON chat_sessions_tasks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_sessions_tasks.chat_session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- Chat sessions to daily briefs
CREATE TABLE IF NOT EXISTS chat_sessions_daily_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    daily_brief_id UUID REFERENCES daily_briefs(id) ON DELETE CASCADE NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_session_id, daily_brief_id)
);

CREATE INDEX idx_csdb_session ON chat_sessions_daily_briefs(chat_session_id);
CREATE INDEX idx_csdb_brief ON chat_sessions_daily_briefs(daily_brief_id);

-- Add RLS
ALTER TABLE chat_sessions_daily_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session-brief links" ON chat_sessions_daily_briefs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_sessions_daily_briefs.chat_session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own session-brief links" ON chat_sessions_daily_briefs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = chat_sessions_daily_briefs.chat_session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- ============================================================================
-- PART 5: Extend existing chat_sessions table
-- ============================================================================

-- Add new columns to chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS chat_type TEXT CHECK (chat_type IN (
    'general',
    'project_create',
    'project_update',
    'project_audit',
    'project_forecast',
    'task_update',
    'daily_brief_update'
)) DEFAULT 'general',
ADD COLUMN IF NOT EXISTS agent_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS auto_accept_operations BOOLEAN DEFAULT false; -- FALSE by default per requirements

-- Create index on chat_type for filtering
CREATE INDEX IF NOT EXISTS idx_chat_sessions_chat_type ON chat_sessions(chat_type, user_id);

-- Add comment for agent_metadata structure
COMMENT ON COLUMN chat_sessions.agent_metadata IS 'Stores agent-specific metadata:
{
  "dimensions_detected": ["core_integrity_ideals", "core_goals_momentum"],
  "questions_asked": 5,
  "user_responses": {"dimension_name": "response_summary"},
  "operations_executed": 12,
  "operations_queued": 5,
  "session_phase": "gathering_info" | "clarifying" | "finalizing" | "completed",
  "draft_project_id": "uuid",
  "partial_failure": false,
  "failed_operations": []
}';

-- ============================================================================
-- PART 6: Extend existing chat_messages table
-- ============================================================================

-- Add new columns to chat_messages
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS operation_ids UUID[],
ADD COLUMN IF NOT EXISTS message_type TEXT CHECK (message_type IN (
    'user_message',
    'assistant_message',
    'system_notification',
    'operation_summary',
    'phase_update'
)) DEFAULT 'assistant_message';

-- Create index for operation tracking
CREATE INDEX IF NOT EXISTS idx_chat_messages_operations ON chat_messages
    USING GIN (operation_ids)
    WHERE operation_ids IS NOT NULL;

-- ============================================================================
-- PART 7: Create update triggers for timestamps
-- ============================================================================

-- Update trigger for project_drafts
CREATE OR REPLACE FUNCTION update_project_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_drafts_updated_at
    BEFORE UPDATE ON project_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_project_drafts_updated_at();

-- Update trigger for draft_tasks
CREATE OR REPLACE FUNCTION update_draft_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_draft_tasks_updated_at
    BEFORE UPDATE ON draft_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_draft_tasks_updated_at();

-- ============================================================================
-- PART 8: Create helper functions
-- ============================================================================

-- Function to finalize a draft project and create the real project
CREATE OR REPLACE FUNCTION finalize_draft_project(
    p_draft_id UUID,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_project_id UUID;
    v_draft RECORD;
    v_task RECORD;
    v_new_task_id UUID;
BEGIN
    -- Get the draft
    SELECT * INTO v_draft
    FROM project_drafts
    WHERE id = p_draft_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found or not owned by user';
    END IF;

    IF v_draft.finalized_project_id IS NOT NULL THEN
        RAISE EXCEPTION 'Draft already finalized';
    END IF;

    -- Create the project
    INSERT INTO projects (
        user_id, name, slug, description, context, executive_summary,
        status, tags, start_date, end_date,
        core_integrity_ideals, core_people_bonds, core_goals_momentum,
        core_meaning_identity, core_reality_understanding, core_trust_safeguards,
        core_opportunity_freedom, core_power_resources, core_harmony_integration,
        calendar_color_id, calendar_settings, calendar_sync_enabled,
        source, source_metadata
    )
    SELECT
        user_id, name, slug, description, context, executive_summary,
        status, tags, start_date, end_date,
        core_integrity_ideals, core_people_bonds, core_goals_momentum,
        core_meaning_identity, core_reality_understanding, core_trust_safeguards,
        core_opportunity_freedom, core_power_resources, core_harmony_integration,
        calendar_color_id, calendar_settings, calendar_sync_enabled,
        'conversational_agent', jsonb_build_object('draft_id', id)
    FROM project_drafts
    WHERE id = p_draft_id
    RETURNING id INTO v_project_id;

    -- Create tasks from draft_tasks
    FOR v_task IN
        SELECT * FROM draft_tasks
        WHERE draft_project_id = p_draft_id
        ORDER BY parent_task_id NULLS FIRST -- Parents first
    LOOP
        INSERT INTO tasks (
            user_id, project_id, title, description, details,
            priority, status, task_type,
            start_date, duration_minutes,
            recurrence_pattern, recurrence_ends, recurrence_end_source,
            task_steps, source, source_calendar_event_id, outdated
        )
        VALUES (
            v_task.user_id, v_project_id, v_task.title, v_task.description, v_task.details,
            v_task.priority, v_task.status, v_task.task_type,
            v_task.start_date, v_task.duration_minutes,
            v_task.recurrence_pattern, v_task.recurrence_ends, v_task.recurrence_end_source,
            v_task.task_steps, 'conversational_agent', v_task.source_calendar_event_id, v_task.outdated
        )
        RETURNING id INTO v_new_task_id;

        -- Update the draft task with finalized ID for reference
        UPDATE draft_tasks
        SET finalized_task_id = v_new_task_id
        WHERE id = v_task.id;
    END LOOP;

    -- Mark draft as completed
    UPDATE project_drafts
    SET
        completed_at = CURRENT_TIMESTAMP,
        finalized_project_id = v_project_id
    WHERE id = p_draft_id;

    RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION finalize_draft_project(UUID, UUID) TO authenticated;

-- ============================================================================
-- PART 9: Create cleanup job for orphaned drafts (optional)
-- ============================================================================

-- This can be run periodically to clean up abandoned sessions
-- Not implementing auto-expiration per requirements, but providing cleanup option
CREATE OR REPLACE FUNCTION cleanup_orphaned_drafts(
    p_days_old INTEGER DEFAULT 90
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Only clean up drafts that:
    -- 1. Are older than specified days
    -- 2. Have no associated chat session activity
    -- 3. Are not finalized
    WITH deleted AS (
        DELETE FROM project_drafts
        WHERE
            completed_at IS NULL
            AND finalized_project_id IS NULL
            AND updated_at < CURRENT_TIMESTAMP - (p_days_old || ' days')::INTERVAL
            AND NOT EXISTS (
                SELECT 1 FROM chat_messages
                WHERE chat_messages.session_id = project_drafts.chat_session_id
                AND chat_messages.created_at > CURRENT_TIMESTAMP - (7 || ' days')::INTERVAL
            )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM deleted;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only superusers can run cleanup
REVOKE EXECUTE ON FUNCTION cleanup_orphaned_drafts(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_drafts(INTEGER) TO service_role;

-- ============================================================================
-- PART 10: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE project_drafts IS 'Stores draft projects during conversational agent creation flow';
COMMENT ON TABLE draft_tasks IS 'Stores draft tasks associated with draft projects';
COMMENT ON TABLE chat_operations IS 'Tracks all operations generated by the conversational agent';
COMMENT ON TABLE chat_sessions_projects IS 'Links chat sessions to projects they created or modified';
COMMENT ON TABLE chat_sessions_tasks IS 'Links chat sessions to tasks they created or modified';
COMMENT ON TABLE chat_sessions_daily_briefs IS 'Links chat sessions to daily briefs they modified';

-- ============================================================================
-- Migration Complete
-- ============================================================================