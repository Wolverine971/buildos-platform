-- packages/shared-types/src/functions/decline_project_invite.sql
-- Source: Supabase pg_get_functiondef

DROP FUNCTION IF EXISTS public.decline_project_invite(uuid);

CREATE OR REPLACE FUNCTION public.decline_project_invite(p_invite_id uuid)
 RETURNS TABLE(invite_id uuid, status text, declined_at timestamp with time zone, recoverable_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite public.onto_project_invites%ROWTYPE;
  v_auth_user_id uuid;
  v_actor_id uuid;
  v_user_email text;
  v_declined_at timestamptz;
BEGIN
  IF p_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invite id missing';
  END IF;

  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_actor_id := public.ensure_actor_for_user(v_auth_user_id);

  SELECT email INTO v_user_email
  FROM public.users
  WHERE id = v_auth_user_id;

  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email
    FROM public.onto_actors
    WHERE id = v_actor_id;
  END IF;

  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  SELECT * INTO v_invite
  FROM public.onto_project_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status NOT IN ('pending', 'declined') THEN
    RAISE EXCEPTION 'Invite is not pending';
  END IF;

  IF v_invite.status = 'declined' THEN
    IF v_invite.declined_at IS NULL
      OR v_invite.declined_at + interval '48 hours' < now()
    THEN
      RAISE EXCEPTION 'Invite was declined and is no longer recoverable';
    END IF;

    RETURN QUERY
    SELECT
      v_invite.id,
      'declined'::text,
      v_invite.declined_at,
      v_invite.declined_at + interval '48 hours';
    RETURN;
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE public.onto_project_invites
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  IF lower(trim(v_invite.invitee_email)) <> lower(trim(v_user_email)) THEN
    RAISE EXCEPTION 'Invite email mismatch';
  END IF;

  v_declined_at := now();

  UPDATE public.onto_project_invites
  SET status = 'declined',
      declined_at = v_declined_at
  WHERE id = v_invite.id;

  RETURN QUERY
  SELECT
    v_invite.id,
    'declined'::text,
    v_declined_at,
    v_declined_at + interval '48 hours';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.decline_project_invite(uuid) TO authenticated;
