-- Migration: Create onto_braindumps table for generic braindump capture
-- This table stores raw thought captures from the agent chat braindump context

-- Create enum for braindump status
DO $$ BEGIN
    CREATE TYPE onto_braindump_status AS ENUM ('pending', 'processing', 'processed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create the onto_braindumps table
CREATE TABLE IF NOT EXISTS onto_braindumps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Content
    content TEXT NOT NULL,
    title TEXT,
    topics TEXT[] DEFAULT '{}',
    summary TEXT,

    -- Processing status
    status onto_braindump_status NOT NULL DEFAULT 'pending',

    -- Optional link to chat session (if user chose to chat about it)
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    -- Processing details
    processed_at TIMESTAMPTZ,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_onto_braindumps_user_id ON onto_braindumps(user_id);
CREATE INDEX IF NOT EXISTS idx_onto_braindumps_status ON onto_braindumps(status);
CREATE INDEX IF NOT EXISTS idx_onto_braindumps_chat_session_id ON onto_braindumps(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_onto_braindumps_created_at ON onto_braindumps(created_at DESC);

-- Enable RLS
ALTER TABLE onto_braindumps ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own braindumps
CREATE POLICY "Users can view their own braindumps"
    ON onto_braindumps
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own braindumps"
    ON onto_braindumps
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own braindumps"
    ON onto_braindumps
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own braindumps"
    ON onto_braindumps
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role bypass for worker processing
CREATE POLICY "Service role can manage all braindumps"
    ON onto_braindumps
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER set_onto_braindumps_updated_at
    BEFORE UPDATE ON onto_braindumps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE onto_braindumps IS 'Stores raw braindump captures from the agent chat braindump context. These are unstructured thought captures that can be saved directly or used as conversation starters.';
COMMENT ON COLUMN onto_braindumps.content IS 'The raw braindump content from the user';
COMMENT ON COLUMN onto_braindumps.title IS 'AI-generated title summarizing the braindump';
COMMENT ON COLUMN onto_braindumps.topics IS 'AI-extracted topics/themes from the braindump';
COMMENT ON COLUMN onto_braindumps.summary IS 'AI-generated summary of the braindump';
COMMENT ON COLUMN onto_braindumps.chat_session_id IS 'Link to chat session if user chose to discuss the braindump';
COMMENT ON COLUMN onto_braindumps.metadata IS 'Additional metadata (source, voice_recording_duration, etc)';

-- Add process_onto_braindump to the queue_type enum for worker processing
DO $$ BEGIN
    ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'process_onto_braindump';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
