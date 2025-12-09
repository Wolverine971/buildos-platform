-- supabase/migrations/20251201_add_chat_topics_column.sql
-- Migration: Add chat_topics column and classify_chat_session job type
-- Purpose: Store extracted topics from chat session conversations for classification

-- Add chat_topics column as a text array
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS chat_topics TEXT[] DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN chat_sessions.chat_topics IS 'Array of topics discussed in the chat session, extracted by LLM classification worker';

-- Create an index for efficient topic-based queries (GIN index for array containment queries)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_topics
ON chat_sessions USING GIN (chat_topics)
WHERE chat_topics IS NOT NULL;

-- Add new queue job type for chat session classification
-- Check if the value already exists before adding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'classify_chat_session' AND enumtypid = 'queue_type'::regtype) THEN
        ALTER TYPE queue_type ADD VALUE 'classify_chat_session';
    END IF;
END $$;
