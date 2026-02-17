-- supabase/migrations/20260425000004_fix_project_owner_membership_actor_resolution.sql
-- Ensure owner membership trigger supports both actor-id and legacy user-id created_by values.

CREATE OR REPLACE FUNCTION public.add_project_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_actor_id uuid;
BEGIN
  -- Preferred path: created_by is already an actor id.
  SELECT a.id
  INTO v_owner_actor_id
  FROM public.onto_actors a
  WHERE a.id = NEW.created_by
  LIMIT 1;

  -- Compatibility path: created_by is a legacy auth user id.
  IF v_owner_actor_id IS NULL THEN
    v_owner_actor_id := ensure_actor_for_user(NEW.created_by);
  END IF;

  INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
  VALUES (NEW.id, v_owner_actor_id, 'owner', 'admin', v_owner_actor_id)
  ON CONFLICT (project_id, actor_id) DO UPDATE
    SET role_key = EXCLUDED.role_key,
        access = EXCLUDED.access,
        removed_at = NULL,
        removed_by_actor_id = NULL;

  RETURN NEW;
END;
$$;

-- Backfill owner membership rows for existing projects using the same resolution logic.
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
SELECT
  p.id,
  owner_actor.actor_id,
  'owner',
  'admin',
  owner_actor.actor_id
FROM public.onto_projects p
JOIN LATERAL (
  SELECT COALESCE(
    (
      SELECT a.id
      FROM public.onto_actors a
      WHERE a.id = p.created_by
      LIMIT 1
    ),
    (
      SELECT ensure_actor_for_user(p.created_by)
      WHERE EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = p.created_by
      )
    )
  ) AS actor_id
) owner_actor ON owner_actor.actor_id IS NOT NULL
WHERE p.deleted_at IS NULL
ON CONFLICT (project_id, actor_id) DO UPDATE
  SET role_key = EXCLUDED.role_key,
      access = EXCLUDED.access,
      removed_at = NULL,
      removed_by_actor_id = NULL;
