-- supabase/migrations/20260324000000_add_voice_note_groups.sql
-- Migration: Voice note groups + segment metadata
-- Description: Adds voice_note_groups table and extends voice_notes with grouping fields
-- Author: Codex (Agent)
-- Date: 2026-03-24

-- ============================================================================
-- PART 1: voice_note_groups table
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_note_groups (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

	linked_entity_type TEXT,
	linked_entity_id UUID,
	chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,

	status TEXT NOT NULL DEFAULT 'draft',
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_note_groups_user ON voice_note_groups (user_id);
CREATE INDEX IF NOT EXISTS idx_voice_note_groups_linked
	ON voice_note_groups (linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_voice_note_groups_session ON voice_note_groups (chat_session_id);
CREATE INDEX IF NOT EXISTS idx_voice_note_groups_active
	ON voice_note_groups (deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_voice_note_groups_updated
	BEFORE UPDATE ON voice_note_groups
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

ALTER TABLE voice_note_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_note_groups_user_access"
	ON voice_note_groups
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PART 2: voice_notes grouping fields
-- ============================================================================

ALTER TABLE voice_notes
	ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES voice_note_groups(id) ON DELETE CASCADE;

ALTER TABLE voice_notes
	ADD COLUMN IF NOT EXISTS segment_index INTEGER;

ALTER TABLE voice_notes
	ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

ALTER TABLE voice_notes
	ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_voice_notes_group_id ON voice_notes (group_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_group_segment ON voice_notes (group_id, segment_index);
