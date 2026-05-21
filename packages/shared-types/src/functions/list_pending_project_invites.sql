-- packages/shared-types/src/functions/list_pending_project_invites.sql
-- Source: Supabase pg_get_functiondef

DROP FUNCTION IF EXISTS public.list_pending_project_invites();

CREATE OR REPLACE FUNCTION public.list_pending_project_invites()
 RETURNS TABLE(invite_id uuid, project_id uuid, project_name text, role_key text, access text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, declined_at timestamp with time zone, recoverable_until timestamp with time zone, can_accept boolean, invited_by_actor_id uuid, invited_by_name text, invited_by_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    FROM public.onto_actors
    WHERE user_id = v_auth_user_id
    LIMIT 1;
  END IF;

  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
    RAISE EXCEPTION 'User email missing';
  END IF;

  UPDATE public.onto_project_invites AS i
  SET status = 'expired'
  WHERE i.status IN ('pending', 'declined')
    AND i.expires_at < now()
    AND lower(trim(i.invitee_email)) = lower(trim(v_user_email));

  UPDATE public.onto_project_invites AS i
  SET status = 'revoked'
  FROM public.onto_projects p
  WHERE p.id = i.project_id
    AND p.deleted_at IS NOT NULL
    AND i.status IN ('pending', 'declined')
    AND lower(trim(i.invitee_email)) = lower(trim(v_user_email));

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
    i.declined_at,
    CASE
      WHEN i.status = 'declined' AND i.declined_at IS NOT NULL
        THEN i.declined_at + interval '48 hours'
      ELSE NULL::timestamptz
    END AS recoverable_until,
    (
      i.status = 'pending'
      OR (
        i.status = 'declined'
        AND i.declined_at IS NOT NULL
        AND i.declined_at + interval '48 hours' >= now()
      )
    ) AS can_accept,
    i.invited_by_actor_id,
    COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
    COALESCE(u.email, a.email) AS invited_by_email
  FROM public.onto_project_invites i
  JOIN public.onto_projects p ON p.id = i.project_id
  LEFT JOIN public.onto_actors a ON a.id = i.invited_by_actor_id
  LEFT JOIN public.users u ON u.id = a.user_id
  WHERE lower(trim(i.invitee_email)) = lower(trim(v_user_email))
    AND i.expires_at >= now()
    AND p.deleted_at IS NULL
    AND (
      i.status = 'pending'
      OR (
        i.status = 'declined'
        AND i.declined_at IS NOT NULL
        AND i.declined_at + interval '48 hours' >= now()
      )
    )
  ORDER BY
    CASE WHEN i.status = 'pending' THEN 0 ELSE 1 END,
    i.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_pending_project_invites() TO authenticated;
