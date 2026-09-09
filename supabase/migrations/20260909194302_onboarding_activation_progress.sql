-- Resume V3 from a committed milestone, independently of browser storage.
-- Existing users/RLS remain the authority; this is navigation state, not authorization.
ALTER TABLE public.users
  ADD COLUMN onboarding_step smallint NOT NULL DEFAULT 0
    CHECK (onboarding_step BETWEEN 0 AND 3),
  ADD COLUMN onboarding_project_id uuid REFERENCES public.onto_projects(id) ON DELETE SET NULL;

CREATE INDEX users_onboarding_project_id_idx ON public.users (onboarding_project_id)
  WHERE onboarding_project_id IS NOT NULL;

UPDATE public.users
SET onboarding_step = CASE WHEN onboarding_completed_at IS NOT NULL THEN 3 ELSE 1 END
WHERE onboarding_completed_at IS NOT NULL
   OR (onboarding_intent IS NOT NULL AND onboarding_stakes IS NOT NULL);

COMMENT ON COLUMN public.users.onboarding_step IS
  'Highest saved V3 milestone: 0 intent, 1 capture, 2 notifications, 3 ready. Completion requires onboarding_completed_at.';
COMMENT ON COLUMN public.users.onboarding_project_id IS
  'Project selected or created during onboarding, used to restore its receipt and the first Today action.';
