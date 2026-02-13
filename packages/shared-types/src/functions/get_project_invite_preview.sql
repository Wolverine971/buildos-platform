-- packages/shared-types/src/functions/get_project_invite_preview.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_project_invite_preview(p_token_hash text)
 RETURNS TABLE(invite_id uuid, project_id uuid, project_name text, role_key text, access text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, invitee_email text, invited_by_actor_id uuid, invited_by_name text, invited_by_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_invite.status := 'expired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM onto_projects p
    WHERE p.id = v_invite.project_id
      AND p.deleted_at IS NULL
  ) THEN
    IF v_invite.status = 'pending' THEN
      UPDATE onto_project_invites
      SET status = 'revoked'
      WHERE id = v_invite.id
        AND status = 'pending';
    END IF;
    RAISE EXCEPTION 'Invite is no longer valid';
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
    CASE
      WHEN auth.role() = 'anon' THEN NULL::text
      ELSE i.invitee_email
    END,
    i.invited_by_actor_id,
    COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
    COALESCE(u.email, a.email) AS invited_by_email
  FROM onto_project_invites i
  JOIN onto_projects p
    ON p.id = i.project_id
    AND p.deleted_at IS NULL
  LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id
  LEFT JOIN public.users u ON u.id = a.user_id
  WHERE i.id = v_invite.id;
END;
$function$
