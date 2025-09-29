-- Migration: Calendar Intelligence Integration
-- Description: Adds tables for analyzing Google Calendar events and suggesting projects based on patterns
-- Author: BuildOS Team
-- Date: 2025-01-29

-- ============================================================================
-- PART 1: Add source tracking to existing tables
-- ============================================================================

-- Add source column to projects table to track origin
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'buildos'
    CHECK (source IN ('buildos', 'calendar_analysis', 'calendar_sync')),
ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- Add source tracking to tasks table
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'buildos'
    CHECK (source IN ('buildos', 'calendar_event', 'ai_generated')),
ADD COLUMN IF NOT EXISTS source_calendar_event_id TEXT;

-- Add indexes for source columns
CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(source) WHERE source != 'buildos';
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source) WHERE source != 'buildos';
CREATE INDEX IF NOT EXISTS idx_tasks_source_calendar_event ON tasks(source_calendar_event_id) WHERE source_calendar_event_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN projects.source IS 'Origin of the project: buildos (native), calendar_analysis (from calendar pattern detection), calendar_sync (synced from calendar)';
COMMENT ON COLUMN projects.source_metadata IS 'Additional metadata about the source. For calendar projects: {analysis_id, event_ids, confidence, event_count}';
COMMENT ON COLUMN tasks.source IS 'Origin of the task: buildos (native), calendar_event (from calendar), ai_generated (from AI processing)';
COMMENT ON COLUMN tasks.source_calendar_event_id IS 'Google Calendar event ID if this task originated from a calendar event';

-- ============================================================================
-- PART 2: Calendar Analysis Tables
-- ============================================================================

-- Create calendar_analyses table to track analysis runs
CREATE TABLE IF NOT EXISTS calendar_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Analysis metadata
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Date range analyzed
    date_range_start DATE,
    date_range_end DATE,
    calendars_analyzed TEXT[], -- Array of calendar IDs that were analyzed
    events_analyzed INTEGER DEFAULT 0,
    events_excluded INTEGER DEFAULT 0, -- Count of events filtered out

    -- Results summary
    projects_suggested INTEGER DEFAULT 0,
    projects_created INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0,
    confidence_average FLOAT, -- Average confidence of suggestions

    -- Processing metadata
    ai_model TEXT, -- Which LLM model was used
    ai_model_version TEXT,
    processing_time_ms INTEGER,
    total_tokens_used INTEGER,
    error_message TEXT, -- If status is 'failed'

    -- User interaction
    user_feedback TEXT, -- Optional feedback from user
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create calendar_project_suggestions table for storing AI suggestions
CREATE TABLE IF NOT EXISTS calendar_project_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES calendar_analyses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Suggestion details
    suggested_name TEXT NOT NULL,
    suggested_description TEXT,
    suggested_context TEXT, -- Rich markdown context for the project
    confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),

    -- Related calendar events
    calendar_event_ids TEXT[] NOT NULL, -- Array of Google Calendar event IDs
    calendar_ids TEXT[], -- Which calendars these events came from
    event_count INTEGER DEFAULT 0,

    -- Event patterns detected
    event_patterns JSONB DEFAULT '{}',
    /* Example patterns:
    {
        "recurring": true,
        "frequency": "weekly",
        "meeting_series": ["Weekly Product Sync", "Design Review"],
        "common_attendees": ["john@company.com", "jane@company.com"],
        "project_indicators": ["sprint", "milestone", "launch"],
        "date_range": {
            "start": "2025-01-01",
            "end": "2025-03-31"
        }
    }
    */

    -- AI reasoning
    ai_reasoning TEXT, -- Why the AI thinks this is a project
    detected_keywords TEXT[], -- Keywords that indicated this project
    suggested_priority TEXT CHECK (suggested_priority IN ('low', 'medium', 'high', 'urgent')),

    -- Suggested tasks (optional)
    suggested_tasks JSONB DEFAULT '[]',
    /* Example tasks:
    [
        {
            "title": "Sprint Planning",
            "description": "Plan next sprint tasks",
            "event_id": "google_event_123",
            "date": "2025-02-01"
        }
    ]
    */

    -- User modifications (before acceptance)
    user_modified_name TEXT,
    user_modified_description TEXT,
    user_modified_context TEXT,

    -- User action
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'modified', 'deferred')),
    status_changed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,

    -- Result (if accepted)
    created_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    tasks_created_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create calendar_analysis_events table to store snapshot of analyzed events
-- This allows us to show what events contributed to suggestions even if they change later
CREATE TABLE IF NOT EXISTS calendar_analysis_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES calendar_analyses(id) ON DELETE CASCADE,
    suggestion_id UUID REFERENCES calendar_project_suggestions(id) ON DELETE CASCADE,

    -- Event identifiers
    calendar_id TEXT NOT NULL,
    calendar_event_id TEXT NOT NULL,

    -- Event snapshot (at time of analysis)
    event_title TEXT,
    event_description TEXT,
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    event_location TEXT,

    -- Event metadata
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT,
    is_organizer BOOLEAN DEFAULT false,
    attendee_count INTEGER DEFAULT 0,
    attendee_emails TEXT[],

    -- Why this event was included/excluded
    included_in_analysis BOOLEAN DEFAULT true,
    exclusion_reason TEXT, -- e.g., 'declined', 'personal', 'all-hands'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

    -- Prevent duplicate events per analysis
    UNIQUE(analysis_id, calendar_event_id)
);

-- Create user preferences for calendar analysis
CREATE TABLE IF NOT EXISTS calendar_analysis_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Analysis preferences
    auto_analyze_on_connect BOOLEAN DEFAULT false, -- Auto-analyze when calendar first connected
    analysis_frequency TEXT DEFAULT 'manual' CHECK (analysis_frequency IN ('manual', 'weekly', 'monthly')),
    last_auto_analysis_at TIMESTAMP WITH TIME ZONE,

    -- Filtering preferences
    exclude_declined_events BOOLEAN DEFAULT true,
    exclude_tentative_events BOOLEAN DEFAULT false,
    exclude_all_day_events BOOLEAN DEFAULT false,
    exclude_personal_events BOOLEAN DEFAULT true, -- Try to detect and exclude personal events
    minimum_attendees INTEGER DEFAULT 0, -- Only consider events with at least N attendees

    -- Suggestion preferences
    minimum_confidence_to_show FLOAT DEFAULT 0.6 CHECK (minimum_confidence_to_show >= 0 AND minimum_confidence_to_show <= 1),
    auto_accept_confidence FLOAT DEFAULT 0.9 CHECK (auto_accept_confidence >= 0 AND auto_accept_confidence <= 1),
    create_tasks_from_events BOOLEAN DEFAULT true,

    -- Calendars to analyze (null means all)
    included_calendar_ids TEXT[],
    excluded_calendar_ids TEXT[],

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

    -- Ensure one preference per user
    UNIQUE(user_id)
);

-- ============================================================================
-- PART 3: Indexes for Performance
-- ============================================================================

-- Indexes for calendar_analyses
CREATE INDEX IF NOT EXISTS idx_calendar_analyses_user_id ON calendar_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_analyses_status ON calendar_analyses(status) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_calendar_analyses_created_at ON calendar_analyses(created_at DESC);

-- Indexes for calendar_project_suggestions
CREATE INDEX IF NOT EXISTS idx_suggestions_analysis_id ON calendar_project_suggestions(analysis_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_user_id ON calendar_project_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON calendar_project_suggestions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_suggestions_confidence ON calendar_project_suggestions(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_project ON calendar_project_suggestions(created_project_id) WHERE created_project_id IS NOT NULL;

-- Indexes for calendar_analysis_events
CREATE INDEX IF NOT EXISTS idx_analysis_events_analysis_id ON calendar_analysis_events(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_events_suggestion_id ON calendar_analysis_events(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_analysis_events_calendar_event ON calendar_analysis_events(calendar_event_id);

-- Indexes for preferences
CREATE INDEX IF NOT EXISTS idx_calendar_analysis_prefs_user ON calendar_analysis_preferences(user_id);

-- ============================================================================
-- PART 4: Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE calendar_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_project_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_analysis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_analysis_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for calendar_analyses
CREATE POLICY "Users can view own analyses" ON calendar_analyses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses" ON calendar_analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses" ON calendar_analyses
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses" ON calendar_analyses
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for calendar_project_suggestions
CREATE POLICY "Users can view own suggestions" ON calendar_project_suggestions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own suggestions" ON calendar_project_suggestions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own suggestions" ON calendar_project_suggestions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own suggestions" ON calendar_project_suggestions
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for calendar_analysis_events
CREATE POLICY "Users can view own analysis events" ON calendar_analysis_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM calendar_analyses
            WHERE calendar_analyses.id = calendar_analysis_events.analysis_id
            AND calendar_analyses.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own analysis events" ON calendar_analysis_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM calendar_analyses
            WHERE calendar_analyses.id = calendar_analysis_events.analysis_id
            AND calendar_analyses.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own analysis events" ON calendar_analysis_events
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM calendar_analyses
            WHERE calendar_analyses.id = calendar_analysis_events.analysis_id
            AND calendar_analyses.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own analysis events" ON calendar_analysis_events
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM calendar_analyses
            WHERE calendar_analyses.id = calendar_analysis_events.analysis_id
            AND calendar_analyses.user_id = auth.uid()
        )
    );

-- Policies for calendar_analysis_preferences
CREATE POLICY "Users can view own preferences" ON calendar_analysis_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON calendar_analysis_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON calendar_analysis_preferences
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences" ON calendar_analysis_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 5: Triggers for updated_at
-- ============================================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_calendar_analyses_updated_at ON calendar_analyses;
CREATE TRIGGER update_calendar_analyses_updated_at
    BEFORE UPDATE ON calendar_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_suggestions_updated_at ON calendar_project_suggestions;
CREATE TRIGGER update_suggestions_updated_at
    BEFORE UPDATE ON calendar_project_suggestions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_analysis_prefs_updated_at ON calendar_analysis_preferences;
CREATE TRIGGER update_analysis_prefs_updated_at
    BEFORE UPDATE ON calendar_analysis_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: Helper Functions
-- ============================================================================

-- Function to get calendar analysis statistics for a user
CREATE OR REPLACE FUNCTION get_calendar_analysis_stats(p_user_id UUID)
RETURNS TABLE (
    total_analyses INTEGER,
    completed_analyses INTEGER,
    total_projects_created INTEGER,
    total_tasks_created INTEGER,
    average_confidence FLOAT,
    last_analysis_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_analyses,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER as completed_analyses,
        COALESCE(SUM(projects_created), 0)::INTEGER as total_projects_created,
        COALESCE(SUM(tasks_created), 0)::INTEGER as total_tasks_created,
        AVG(confidence_average) as average_confidence,
        MAX(completed_at) as last_analysis_at
    FROM calendar_analyses
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending suggestions for a user
CREATE OR REPLACE FUNCTION get_pending_calendar_suggestions(p_user_id UUID)
RETURNS TABLE (
    suggestion_id UUID,
    suggested_name TEXT,
    suggested_description TEXT,
    confidence_score FLOAT,
    event_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        id as suggestion_id,
        suggested_name,
        suggested_description,
        confidence_score,
        event_count,
        created_at
    FROM calendar_project_suggestions
    WHERE user_id = p_user_id
    AND status = 'pending'
    ORDER BY confidence_score DESC, created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7: Comments for Documentation
-- ============================================================================

COMMENT ON TABLE calendar_analyses IS 'Tracks calendar analysis runs, including status, results, and performance metrics';
COMMENT ON TABLE calendar_project_suggestions IS 'Stores AI-generated project suggestions from calendar event patterns';
COMMENT ON TABLE calendar_analysis_events IS 'Snapshot of calendar events analyzed, preserving state at time of analysis';
COMMENT ON TABLE calendar_analysis_preferences IS 'User preferences for calendar analysis behavior and filtering';

COMMENT ON COLUMN calendar_project_suggestions.confidence_score IS 'AI confidence in this being a real project (0-1). Higher scores indicate stronger pattern matching';
COMMENT ON COLUMN calendar_project_suggestions.event_patterns IS 'JSON object containing detected patterns like recurring meetings, common attendees, project keywords';
COMMENT ON COLUMN calendar_project_suggestions.ai_reasoning IS 'Human-readable explanation of why the AI suggested this project';
COMMENT ON COLUMN calendar_analysis_events.exclusion_reason IS 'Why an event was excluded from analysis (declined, personal, all-hands, etc.)';

-- ============================================================================
-- PART 8: Initial Data (Optional)
-- ============================================================================

-- Insert default analysis preferences for existing users who have connected calendars
-- This is optional and can be removed if not needed
INSERT INTO calendar_analysis_preferences (user_id, auto_analyze_on_connect)
SELECT DISTINCT user_id, false
FROM user_calendar_tokens
WHERE NOT EXISTS (
    SELECT 1 FROM calendar_analysis_preferences
    WHERE calendar_analysis_preferences.user_id = user_calendar_tokens.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================