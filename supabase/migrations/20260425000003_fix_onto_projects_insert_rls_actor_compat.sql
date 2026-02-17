-- supabase/migrations/20260425000003_fix_onto_projects_insert_rls_actor_compat.sql
-- Migration: Allow project inserts when created_by is either auth user id (legacy)
--            or an actor id owned by the authenticated user.
-- Date: 2026-04-25

ALTER TABLE public.onto_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_insert_owner_or_actor ON public.onto_projects;

CREATE POLICY project_insert_owner_or_actor
  ON public.onto_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.onto_actors a
      WHERE a.id = created_by
        AND a.user_id = auth.uid()
    )
  );
