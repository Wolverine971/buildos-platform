-- supabase/migrations/20260514000000_add_paused_project_state.sql
-- Add a first-class paused project state.
-- Paused projects remain visible when explicitly requested, but are excluded
-- from active-work surfaces such as briefs and default project selectors.

ALTER TYPE public.project_state ADD VALUE IF NOT EXISTS 'paused' AFTER 'active';
