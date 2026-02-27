-- supabase/migrations/20260426000017_onto_event_sync_user_scope.sql
-- Phase 2 foundation: make onto_event_sync explicitly user-scoped for collaboration-safe mapping.

BEGIN;

ALTER TABLE public.onto_event_sync
	ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'onto_event_sync_user_id_fkey'
	) THEN
		ALTER TABLE public.onto_event_sync
			ADD CONSTRAINT onto_event_sync_user_id_fkey
			FOREIGN KEY (user_id)
			REFERENCES public.users(id)
			ON DELETE SET NULL;
	END IF;
END $$;

-- Backfill user scope from project calendar ownership for existing rows.
UPDATE public.onto_event_sync AS oes
SET user_id = pc.user_id
FROM public.project_calendars AS pc
WHERE oes.user_id IS NULL
	AND pc.id = oes.calendar_id;

-- Remove duplicated legacy rows before adding user-scoped uniqueness.
WITH ranked AS (
	SELECT
		id,
		row_number() OVER (
			PARTITION BY event_id, user_id, provider
			ORDER BY updated_at DESC, created_at DESC, id DESC
		) AS row_rank
	FROM public.onto_event_sync
	WHERE user_id IS NOT NULL
)
DELETE FROM public.onto_event_sync AS oes
USING ranked
WHERE oes.id = ranked.id
	AND ranked.row_rank > 1;

CREATE INDEX IF NOT EXISTS idx_onto_event_sync_user_id
	ON public.onto_event_sync(user_id);

CREATE INDEX IF NOT EXISTS idx_onto_event_sync_event_user
	ON public.onto_event_sync(event_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_onto_event_sync_event_user_provider
	ON public.onto_event_sync(event_id, user_id, provider)
	WHERE user_id IS NOT NULL;

COMMIT;
