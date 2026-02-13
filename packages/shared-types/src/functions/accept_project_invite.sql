-- packages/shared-types/src/functions/accept_project_invite.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.accept_project_invite(p_token_hash text, p_actor_id uuid, p_user_email text)
 RETURNS TABLE(project_id uuid, role_key text, access text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite onto_project_invites%ROWTYPE;
  v_auth_user_id uuid;
  v_actor_id uuid;
  v_user_email text;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RAISE EXCEPTION 'Invite token missing';
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

  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor_id THEN
    RAISE EXCEPTION 'Actor mismatch';
  END IF;

  IF p_user_email IS NOT NULL AND lower(trim(p_user_email)) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'User email mismatch';
  END IF;

  SELECT * INTO v_invite
  FROM onto_project_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

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

  IF lower(trim(v_invite.invitee_email)) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'Invite email mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM onto_projects p
    WHERE p.id = v_invite.project_id
      AND p.deleted_at IS NULL
  ) THEN
    UPDATE onto_project_invites
    SET status = 'revoked'
    WHERE id = v_invite.id
      AND status = 'pending';
    RAISE EXCEPTION 'Invite is no longer valid';
  END IF;

  -- Reactivate removed memberships only. Active memberships keep their current role/access.
  UPDATE onto_project_members AS m
  SET role_key = v_invite.role_key,
      access = v_invite.access,
      removed_at = NULL,
      removed_by_actor_id = NULL
  WHERE m.project_id = v_invite.project_id
    AND m.actor_id = v_actor_id
    AND m.removed_at IS NOT NULL;

  IF NOT FOUND THEN
    INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
    VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id)
    ON CONFLICT ON CONSTRAINT unique_project_member DO NOTHING;
  END IF;

  UPDATE onto_project_invites
  SET status = 'accepted',
      accepted_by_actor_id = v_actor_id,
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$function$
