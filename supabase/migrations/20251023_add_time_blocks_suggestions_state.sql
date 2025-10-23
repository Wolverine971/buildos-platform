-- supabase/migrations/20251023_add_time_blocks_suggestions_state.sql
-- Adds suggestions_state tracking to time_blocks for async AI suggestion generation.

BEGIN;

-- Add suggestions_state column with a default pending state for new rows.
ALTER TABLE public.time_blocks
	ADD COLUMN IF NOT EXISTS suggestions_state JSONB DEFAULT '{"status": "pending"}'::jsonb;

-- Create index to efficiently query by suggestion status (e.g., pending work queue).
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_indexes
		WHERE schemaname = 'public'
			AND indexname = 'idx_time_blocks_suggestions_state'
	) THEN
		CREATE INDEX idx_time_blocks_suggestions_state
			ON public.time_blocks ((suggestions_state ->> 'status'));
	END IF;
END $$;

-- Mark existing records with generated suggestions as completed.
UPDATE public.time_blocks
SET suggestions_state = '{"status": "completed"}'::jsonb
WHERE ai_suggestions IS NOT NULL;

-- Ensure any remaining records have at least a pending state.
UPDATE public.time_blocks
SET suggestions_state = COALESCE(suggestions_state, '{"status": "pending"}'::jsonb);

COMMENT ON COLUMN public.time_blocks.suggestions_state IS
	'Tracks the state of AI suggestion generation: pending, generating, completed, or failed';

COMMIT;
