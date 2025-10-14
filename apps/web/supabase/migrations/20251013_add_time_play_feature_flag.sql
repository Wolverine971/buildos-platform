-- apps/web/supabase/migrations/20251013_add_time_play_feature_flag.sql
-- Migration: Feature flag infrastructure for Time Play

BEGIN;

CREATE TABLE IF NOT EXISTS feature_flags (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	feature_name TEXT NOT NULL,
	enabled BOOLEAN NOT NULL DEFAULT FALSE,
	enabled_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT feature_flags_user_feature_unique UNIQUE (user_id, feature_name)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_user_id ON feature_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_lookup
	ON feature_flags(user_id, feature_name)
	WHERE enabled IS TRUE;

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own flags
CREATE POLICY feature_flags_user_select
	ON feature_flags
	FOR SELECT
	USING (auth.uid() = user_id);

-- Allow admins and service role to manage feature flags
CREATE POLICY feature_flags_admin_manage
	ON feature_flags
	FOR ALL
	USING (
		auth.role() = 'service_role'
		OR EXISTS (
			SELECT 1
			FROM users
			WHERE users.id = auth.uid()
				AND users.is_admin = TRUE
		)
	)
	WITH CHECK (
		auth.role() = 'service_role'
		OR EXISTS (
			SELECT 1
			FROM users
			WHERE users.id = auth.uid()
				AND users.is_admin = TRUE
		)
	);

-- Maintain updated_at automatically
CREATE TRIGGER update_feature_flags_updated_at
	BEFORE UPDATE ON feature_flags
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE feature_flags IS 'Per-user feature flags for gated feature rollouts';

COMMIT;
