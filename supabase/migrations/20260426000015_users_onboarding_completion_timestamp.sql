-- supabase/migrations/20260426000015_users_onboarding_completion_timestamp.sql
-- Consolidate onboarding completion on users.onboarding_completed_at.
-- This migration:
-- 1) Renames users.onboarding_v2_completed_at -> users.onboarding_completed_at
-- 2) Backfills onboarding_completed_at from legacy completed_onboarding and user_context
-- 3) Drops legacy users.completed_onboarding and trigger/function that maintained it

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'users'
			AND column_name = 'onboarding_v2_completed_at'
	) THEN
		IF EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'users'
				AND column_name = 'onboarding_completed_at'
		) THEN
			UPDATE public.users
			SET onboarding_completed_at = COALESCE(
				onboarding_completed_at,
				onboarding_v2_completed_at
			)
			WHERE onboarding_v2_completed_at IS NOT NULL;

			ALTER TABLE public.users
			DROP COLUMN onboarding_v2_completed_at;
		ELSE
			ALTER TABLE public.users
			RENAME COLUMN onboarding_v2_completed_at TO onboarding_completed_at;
		END IF;
	END IF;
END
$$;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'users'
			AND column_name = 'completed_onboarding'
	) THEN
		UPDATE public.users
		SET onboarding_completed_at = COALESCE(onboarding_completed_at, updated_at, created_at, now())
		WHERE completed_onboarding IS TRUE
			AND onboarding_completed_at IS NULL;
	END IF;
END
$$;

UPDATE public.users AS u
SET onboarding_completed_at = uc.onboarding_completed_at
FROM public.user_context AS uc
WHERE u.id = uc.user_id
	AND u.onboarding_completed_at IS NULL
	AND uc.onboarding_completed_at IS NOT NULL;

DROP TRIGGER IF EXISTS update_onboarding_status_trigger ON public.user_context;
DROP FUNCTION IF EXISTS public.update_user_onboarding_status() CASCADE;

ALTER TABLE public.users
DROP COLUMN IF EXISTS completed_onboarding;

COMMENT ON COLUMN public.users.onboarding_completed_at IS
	'Timestamp when onboarding was completed; onboarding is complete when this is non-null.';

-- Keep helper RPC aligned with the canonical onboarding completion source.
CREATE OR REPLACE FUNCTION public.check_onboarding_complete(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
SELECT COALESCE(
	(
		SELECT onboarding_completed_at IS NOT NULL
		FROM public.users
		WHERE id = p_user_id
	),
	false
);
$$;

COMMENT ON FUNCTION public.check_onboarding_complete(uuid) IS
	'Returns true when users.onboarding_completed_at is non-null.';
