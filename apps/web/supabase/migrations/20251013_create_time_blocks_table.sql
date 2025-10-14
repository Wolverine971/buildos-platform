-- apps/web/supabase/migrations/20251013_create_time_blocks_table.sql
-- Migration: Time blocks table for Time Play MVP

BEGIN;

CREATE TABLE IF NOT EXISTS time_blocks (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	block_type TEXT NOT NULL DEFAULT 'project' CHECK (block_type = 'project'),
	project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	start_time TIMESTAMPTZ NOT NULL,
	end_time TIMESTAMPTZ NOT NULL,
	duration_minutes INTEGER NOT NULL,
	timezone TEXT NOT NULL DEFAULT 'America/New_York',
	calendar_event_id TEXT,
	calendar_event_link TEXT,
	sync_status TEXT NOT NULL DEFAULT 'pending'
		CHECK (sync_status IN ('pending', 'synced', 'failed', 'deleted')),
	last_synced_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT time_blocks_valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
	CONSTRAINT time_blocks_valid_time_range CHECK (end_time > start_time)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_time_blocks_user_id ON time_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_user_time_range
	ON time_blocks(user_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_time_blocks_project_id ON time_blocks(project_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_calendar_event
	ON time_blocks(calendar_event_id)
	WHERE calendar_event_id IS NOT NULL;

-- Enable row level security
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_blocks_user_select
	ON time_blocks
	FOR SELECT
	USING (auth.uid() = user_id);

CREATE POLICY time_blocks_user_insert
	ON time_blocks
	FOR INSERT
	WITH CHECK (auth.uid() = user_id);

CREATE POLICY time_blocks_user_update
	ON time_blocks
	FOR UPDATE
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

CREATE POLICY time_blocks_user_delete
	ON time_blocks
	FOR DELETE
	USING (auth.uid() = user_id);

CREATE TRIGGER update_time_blocks_updated_at
	BEFORE UPDATE ON time_blocks
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE time_blocks IS 'User-configured calendar time blocks created via the Time Play feature';

COMMIT;
