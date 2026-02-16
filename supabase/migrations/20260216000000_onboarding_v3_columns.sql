-- supabase/migrations/20260216000000_onboarding_v3_columns.sql
-- Onboarding V3: Add intent/stakes columns to users and onboarding_seed to behavioral profiles.

-- V3 onboarding captures two questions behavior alone cannot reveal:
-- 1. Intent: why the user came to BuildOS
-- 2. Stakes: how important this is to them

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_intent TEXT
    CHECK (onboarding_intent IN ('organize', 'plan', 'unstuck', 'explore')),
  ADD COLUMN IF NOT EXISTS onboarding_stakes TEXT
    CHECK (onboarding_stakes IN ('high', 'medium', 'low'));

-- Store the raw onboarding signals that seeded the behavioral profile
ALTER TABLE public.user_behavioral_profiles
  ADD COLUMN IF NOT EXISTS onboarding_seed JSONB DEFAULT NULL;

COMMENT ON COLUMN public.users.onboarding_intent IS 'V3 onboarding: user intent (organize/plan/unstuck/explore)';
COMMENT ON COLUMN public.users.onboarding_stakes IS 'V3 onboarding: stakes level (high/medium/low)';
COMMENT ON COLUMN public.user_behavioral_profiles.onboarding_seed IS 'Raw onboarding signals that seeded the initial behavioral profile';
