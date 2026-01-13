-- packages/shared-types/src/functions/decline_project_invite.sql
-- decline_project_invite(uuid)
-- Decline a project invite
-- Source: supabase/migrations/20260326000000_invite_pending_flow.sql

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
