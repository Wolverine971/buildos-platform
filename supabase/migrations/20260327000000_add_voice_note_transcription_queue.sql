-- supabase/migrations/20260327000000_add_voice_note_transcription_queue.sql
-- Description: Adds transcribe_voice_note to the queue_type enum for background voice note transcription

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'transcribe_voice_note';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
