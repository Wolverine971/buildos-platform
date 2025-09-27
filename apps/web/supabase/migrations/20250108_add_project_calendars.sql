-- Migration: Add Google Calendar support for individual projects
-- Description: Creates project_calendars table and updates projects table for per-project calendar integration

-- Create enum for calendar sync status if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_sync_status') THEN
        CREATE TYPE calendar_sync_status AS ENUM ('active', 'paused', 'error');
    END IF;
END $$;

-- Create enum for calendar visibility if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_visibility') THEN
        CREATE TYPE calendar_visibility AS ENUM ('public', 'private', 'shared');
    END IF;
END $$;

-- Create project_calendars table for mapping projects to Google Calendars
CREATE TABLE IF NOT EXISTS project_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL, -- Google Calendar ID
    calendar_name TEXT NOT NULL,
    color_id TEXT DEFAULT '7', -- Google color ID (1-11), default to Peacock blue
    hex_color TEXT, -- Store hex color for UI display
    is_primary BOOLEAN DEFAULT false, -- false for project calendars
    sync_enabled BOOLEAN DEFAULT true,
    visibility calendar_visibility DEFAULT 'private',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    sync_status calendar_sync_status DEFAULT 'active',
    sync_error TEXT,
    
    -- Ensure one calendar per project per user
    UNIQUE(user_id, project_id),
    -- Ensure unique calendar ID per user (can't have same Google Calendar for multiple projects)
    UNIQUE(user_id, calendar_id)
);

-- Create calendar_themes table for color theme management
CREATE TABLE IF NOT EXISTS calendar_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_name TEXT NOT NULL,
    color_mappings JSONB NOT NULL DEFAULT '{}', -- Stores color mappings like high_priority, medium_priority, etc.
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    
    -- Ensure unique theme names per user
    UNIQUE(user_id, theme_name),
    -- Only one default theme per user
    CONSTRAINT only_one_default_theme_per_user EXCLUDE USING btree (user_id WITH =) WHERE (is_default = true)
);

-- Add calendar-related fields to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS calendar_color_id TEXT DEFAULT '7', -- Google color ID (1-11)
ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS calendar_settings JSONB DEFAULT '{}'; -- Flexible settings storage

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_calendars_user_project ON project_calendars(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_calendars_calendar_id ON project_calendars(calendar_id);
CREATE INDEX IF NOT EXISTS idx_project_calendars_sync_status ON project_calendars(sync_status) WHERE sync_status != 'active';
CREATE INDEX IF NOT EXISTS idx_calendar_themes_user_default ON calendar_themes(user_id, is_default) WHERE is_default = true;

-- Update task_calendar_events to support project calendars better
-- Add column to track which calendar the event belongs to
ALTER TABLE task_calendar_events
ADD COLUMN IF NOT EXISTS project_calendar_id UUID REFERENCES project_calendars(id) ON DELETE SET NULL;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_task_calendar_events_project_calendar ON task_calendar_events(project_calendar_id);

-- Create or update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_project_calendars_updated_at ON project_calendars;
CREATE TRIGGER update_project_calendars_updated_at
    BEFORE UPDATE ON project_calendars
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_themes_updated_at ON calendar_themes;
CREATE TRIGGER update_calendar_themes_updated_at
    BEFORE UPDATE ON calendar_themes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for project_calendars
ALTER TABLE project_calendars ENABLE ROW LEVEL SECURITY;

-- Users can view their own project calendars
CREATE POLICY "Users can view own project calendars" ON project_calendars
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own project calendars
CREATE POLICY "Users can insert own project calendars" ON project_calendars
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own project calendars
CREATE POLICY "Users can update own project calendars" ON project_calendars
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own project calendars
CREATE POLICY "Users can delete own project calendars" ON project_calendars
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add RLS policies for calendar_themes
ALTER TABLE calendar_themes ENABLE ROW LEVEL SECURITY;

-- Users can view their own calendar themes
CREATE POLICY "Users can view own calendar themes" ON calendar_themes
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own calendar themes
CREATE POLICY "Users can insert own calendar themes" ON calendar_themes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own calendar themes
CREATE POLICY "Users can update own calendar themes" ON calendar_themes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own calendar themes
CREATE POLICY "Users can delete own calendar themes" ON calendar_themes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Insert default Google Calendar color mappings as a reference (not a table, just a comment for documentation)
COMMENT ON COLUMN project_calendars.color_id IS 'Google Calendar color IDs: 1=Lavender (#7986cb), 2=Sage (#33b679), 3=Grape (#8e24aa), 4=Flamingo (#e67c73), 5=Banana (#f6bf26), 6=Tangerine (#f4511e), 7=Peacock (#039be5), 8=Graphite (#616161), 9=Blueberry (#3f51b5), 10=Basil (#0b8043), 11=Tomato (#d50000)';

-- Add helpful comments
COMMENT ON TABLE project_calendars IS 'Maps projects to dedicated Google Calendars for better organization and visual separation';
COMMENT ON TABLE calendar_themes IS 'Stores user-defined color themes for consistent calendar coloring across projects';
COMMENT ON COLUMN project_calendars.calendar_id IS 'The Google Calendar ID returned when creating a calendar via Google Calendar API';
COMMENT ON COLUMN project_calendars.hex_color IS 'Cached hex color value for UI display without needing to map from Google color ID';
COMMENT ON COLUMN calendar_themes.color_mappings IS 'JSON object with keys like high_priority, medium_priority, low_priority, completed, overdue mapped to Google color IDs';