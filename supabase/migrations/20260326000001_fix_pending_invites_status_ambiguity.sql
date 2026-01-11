-- supabase/migrations/20260326000001_fix_pending_invites_status_ambiguity.sql
-- Migration: Fix ambiguous status reference in list_pending_project_invites
-- Date: 2026-03-26

CREATE OR REPLACE FUNCTION list_pending_project_invites()
RETURNS TABLE (
  invite_id uuid,
  project_id uuid,
  project_name text,
  role_key text,
  access text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  invited_by_actor_id uuid,
  invited_by_name text,
  invited_by_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
  v_user_email text;
BEGIN
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO v_user_email
  FROM public.users
  WHERE id = v_auth_user_id;

  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email
    FROM onto_actors
    WHERE user_id = v_auth_user_id
    LIMIT 1;
  END IF;

  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  UPDATE onto_project_invites AS i
  SET status = 'expired'
  WHERE i.status = 'pending'
    AND i.expires_at < now()
    AND lower(i.invitee_email) = lower(trim(v_user_email));

  RETURN QUERY
  SELECT
    i.id,
    i.project_id,
    p.name,
    i.role_key,
    i.access,
    i.status,
    i.expires_at,
    i.created_at,
    i.invited_by_actor_id,
    COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
    COALESCE(u.email, a.email) AS invited_by_email
  FROM onto_project_invites i
  JOIN onto_projects p ON p.id = i.project_id
  LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id
  LEFT JOIN public.users u ON u.id = a.user_id
  WHERE lower(i.invitee_email) = lower(trim(v_user_email))
    AND i.status = 'pending'
    AND i.expires_at >= now()
    AND p.deleted_at IS NULL
  ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_pending_project_invites() TO authenticated;
