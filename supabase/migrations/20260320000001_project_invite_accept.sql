-- supabase/migrations/20260320000001_project_invite_accept.sql
-- Migration: Add accept_project_invite RPC for invite acceptance
-- Description: Security definer function to accept project invites by token hash.

CREATE OR REPLACE FUNCTION accept_project_invite(
  p_token_hash text,
  p_actor_id uuid,
  p_user_email text
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
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RAISE EXCEPTION 'Invite token missing';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor id missing';
  END IF;

  IF p_user_email IS NULL OR length(trim(p_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  SELECT * INTO v_invite
  FROM onto_project_invites
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is not pending';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    UPDATE onto_project_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(v_invite.invitee_email) <> lower(trim(p_user_email)) THEN
    RAISE EXCEPTION 'Invite email mismatch';
  END IF;

  INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
  VALUES (v_invite.project_id, p_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id)
  ON CONFLICT (project_id, actor_id) DO UPDATE
    SET role_key = EXCLUDED.role_key,
        access = EXCLUDED.access,
        removed_at = NULL,
        removed_by_actor_id = NULL;

  UPDATE onto_project_invites
  SET status = 'accepted',
      accepted_by_actor_id = p_actor_id,
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_project_invite(text, uuid, text) TO authenticated;
