-- supabase/migrations/20261023180000_onboarding_people_step.sql
--
-- Onboarding V3 gains an optional "People" step (claim a handle, invite someone) between
-- Notifications and Ready. Milestones are now 0 intent, 1 capture, 2 notifications,
-- 3 people, 4 ready. Saved values keep their meaning up to 2; a saved 3 used to mean
-- "reached Ready" and now resumes on the People step, which is skippable.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_onboarding_step_check;
ALTER TABLE public.users
	ADD CONSTRAINT users_onboarding_step_check CHECK (onboarding_step BETWEEN 0 AND 4);

COMMENT ON COLUMN public.users.onboarding_step IS
	'Highest saved V3 milestone: 0 intent, 1 capture, 2 notifications, 3 people, 4 ready. Completion requires onboarding_completed_at.';
