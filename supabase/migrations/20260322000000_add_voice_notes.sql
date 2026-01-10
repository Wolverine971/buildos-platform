-- supabase/migrations/20260322000000_add_voice_notes.sql
-- Migration: Voice notes storage + metadata
-- Description: Adds voice_notes table, RLS, and storage bucket policies
-- Author: Codex (Agent)
-- Date: 2026-03-22

-- ============================================================================
-- PART 1: Voice notes metadata table
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_notes (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

	-- File info
	storage_path TEXT NOT NULL,
	storage_bucket TEXT NOT NULL DEFAULT 'voice_notes',
	file_size_bytes INTEGER NOT NULL,
	duration_seconds NUMERIC(10, 2),
	mime_type TEXT NOT NULL,

	-- Transcription (optional)
	transcript TEXT,
	transcription_model TEXT,
	transcription_status TEXT NOT NULL DEFAULT 'pending',
	transcription_error TEXT,

	-- Context (optional)
	linked_entity_type TEXT,
	linked_entity_id UUID,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

	-- Soft delete
	deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_notes_user_id ON voice_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_linked ON voice_notes (linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_active ON voice_notes (deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_voice_notes_updated
	BEFORE UPDATE ON voice_notes
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_notes_user_access"
	ON voice_notes
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PART 2: Storage bucket and policies
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice_notes', 'voice_notes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "voice_notes_upload_own"
	ON storage.objects
	FOR INSERT
	WITH CHECK (
		bucket_id = 'voice_notes'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = auth.uid()::text
	);

CREATE POLICY "voice_notes_read_own"
	ON storage.objects
	FOR SELECT
	USING (
		bucket_id = 'voice_notes'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = auth.uid()::text
	);

CREATE POLICY "voice_notes_delete_own"
	ON storage.objects
	FOR DELETE
	USING (
		bucket_id = 'voice_notes'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = auth.uid()::text
	);
