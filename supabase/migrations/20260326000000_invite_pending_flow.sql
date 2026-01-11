-- supabase/migrations/20260326000000_invite_pending_flow.sql
-- Migration: Invite preview + pending list + accept/decline by id
-- Date: 2026-03-26
-- Description: Support invite registration flow for new users.

-- Allow declined invite status
ALTER TABLE onto_project_invites
  DROP CONSTRAINT IF EXISTS chk_project_invite_status;

ALTER TABLE onto_project_invites
  ADD CONSTRAINT chk_project_invite_status
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired', 'declined'));

-- Return safe invite details for a token (no acceptance)
CREATE OR REPLACE FUNCTION get_project_invite_preview(
  p_token_hash text
)
RETURNS TABLE (
  invite_id uuid,
  project_id uuid,
  project_name text,
  role_key text,
  access text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  invitee_email text,
  invited_by_actor_id uuid,
  invited_by_name text,
  invited_by_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite onto_project_invites%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RAISE EXCEPTION 'Invite token missing';
  END IF;

  SELECT * INTO v_invite
  FROM onto_project_invites
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status = 'pending' AND v_invite.expires_at < now() THEN
    UPDATE onto_project_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
  END IF;

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
    i.invitee_email,
    i.invited_by_actor_id,
    COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
    COALESCE(u.email, a.email) AS invited_by_email
  FROM onto_project_invites i
  JOIN onto_projects p ON p.id = i.project_id
  LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id
  LEFT JOIN public.users u ON u.id = a.user_id
  WHERE i.id = v_invite.id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_invite_preview(text) TO anon;
GRANT EXECUTE ON FUNCTION get_project_invite_preview(text) TO authenticated;

-- List pending invites for the authenticated user
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

  UPDATE onto_project_invites
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now()
    AND lower(invitee_email) = lower(trim(v_user_email));

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

-- Accept invite by id (used by pending list)
CREATE OR REPLACE FUNCTION accept_project_invite_by_id(
  p_invite_id uuid
)
RETURNS TABLE (
  project_id uuid,
  role_key text,
  access text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite onto_project_invites%ROWTYPE;
  v_auth_user_id uuid;
  v_actor_id uuid;
  v_user_email text;
BEGIN
  IF p_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invite id missing';
  END IF;

  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_actor_id := ensure_actor_for_user(v_auth_user_id);

  SELECT email INTO v_user_email
  FROM public.users
  WHERE id = v_auth_user_id;

  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email
    FROM onto_actors
    WHERE id = v_actor_id;
  END IF;

  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  SELECT * INTO v_invite
  FROM onto_project_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is not pending';
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE onto_project_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'Invite email mismatch';
  END IF;

  UPDATE onto_project_members AS m
  SET role_key = v_invite.role_key,
      access = v_invite.access,
      removed_at = NULL,
      removed_by_actor_id = NULL
  WHERE m.project_id = v_invite.project_id
    AND m.actor_id = v_actor_id;

  IF NOT FOUND THEN
    INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
    VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id);
  END IF;

  UPDATE onto_project_invites
  SET status = 'accepted',
      accepted_by_actor_id = v_actor_id,
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_project_invite_by_id(uuid) TO authenticated;

-- Decline invite by id
CREATE OR REPLACE FUNCTION decline_project_invite(
  p_invite_id uuid
)
RETURNS TABLE (
  invite_id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite onto_project_invites%ROWTYPE;
  v_auth_user_id uuid;
  v_actor_id uuid;
  v_user_email text;
BEGIN
  IF p_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invite id missing';
  END IF;

  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_actor_id := ensure_actor_for_user(v_auth_user_id);

  SELECT email INTO v_user_email
  FROM public.users
  WHERE id = v_auth_user_id;

  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email
    FROM onto_actors
    WHERE id = v_actor_id;
  END IF;

  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  SELECT * INTO v_invite
  FROM onto_project_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is not pending';
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE onto_project_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'Invite email mismatch';
  END IF;

  UPDATE onto_project_invites
  SET status = 'declined'
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.id, 'declined'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION decline_project_invite(uuid) TO authenticated;
