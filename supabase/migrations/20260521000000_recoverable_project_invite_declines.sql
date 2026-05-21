-- supabase/migrations/20260521000000_recoverable_project_invite_declines.sql
-- Keep declined project invites recoverable for 48 hours so users can undo
-- an accidental decline without requiring a new invite.

BEGIN;

ALTER TABLE public.onto_project_invites
	ADD COLUMN IF NOT EXISTS declined_at timestamptz;

UPDATE public.onto_project_invites
SET declined_at = created_at
WHERE status = 'declined'
	AND declined_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_project_invites_declined_recovery
	ON public.onto_project_invites(invitee_email, declined_at)
	WHERE status = 'declined';

DROP FUNCTION IF EXISTS public.list_pending_project_invites();

CREATE OR REPLACE FUNCTION public.list_pending_project_invites()
RETURNS TABLE (
	invite_id uuid,
	project_id uuid,
	project_name text,
	role_key text,
	access text,
	status text,
	expires_at timestamptz,
	created_at timestamptz,
	declined_at timestamptz,
	recoverable_until timestamptz,
	can_accept boolean,
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
$$;

DROP FUNCTION IF EXISTS public.get_project_invite_preview(text);

CREATE OR REPLACE FUNCTION public.get_project_invite_preview(p_token_hash text)
RETURNS TABLE (
	invite_id uuid,
	project_id uuid,
	project_name text,
	role_key text,
	access text,
	status text,
	expires_at timestamptz,
	created_at timestamptz,
	declined_at timestamptz,
	recoverable_until timestamptz,
	can_accept boolean,
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
	v_invite public.onto_project_invites%ROWTYPE;
BEGIN
	IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
		RAISE EXCEPTION 'Invite token missing';
	END IF;

	SELECT * INTO v_invite
	FROM public.onto_project_invites
	WHERE token_hash = p_token_hash;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Invite not found';
	END IF;

	IF v_invite.status IN ('pending', 'declined') AND v_invite.expires_at < now() THEN
		UPDATE public.onto_project_invites
		SET status = 'expired'
		WHERE id = v_invite.id;
		v_invite.status := 'expired';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.onto_projects p
		WHERE p.id = v_invite.project_id
			AND p.deleted_at IS NULL
	) THEN
		IF v_invite.status IN ('pending', 'declined') THEN
			UPDATE public.onto_project_invites
			SET status = 'revoked'
			WHERE id = v_invite.id
				AND status IN ('pending', 'declined');
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
		CASE
			WHEN auth.role() = 'anon' THEN NULL::text
			ELSE i.invitee_email
		END,
		i.invited_by_actor_id,
		COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
		COALESCE(u.email, a.email) AS invited_by_email
	FROM public.onto_project_invites i
	JOIN public.onto_projects p
		ON p.id = i.project_id
		AND p.deleted_at IS NULL
	LEFT JOIN public.onto_actors a ON a.id = i.invited_by_actor_id
	LEFT JOIN public.users u ON u.id = a.user_id
	WHERE i.id = v_invite.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_project_invite_by_id(p_invite_id uuid)
RETURNS TABLE (project_id uuid, role_key text, access text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_invite public.onto_project_invites%ROWTYPE;
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

	IF v_invite.status = 'declined'
		AND (
			v_invite.declined_at IS NULL
			OR v_invite.declined_at + interval '48 hours' < now()
		) THEN
		RAISE EXCEPTION 'Invite was declined and is no longer recoverable';
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

	IF NOT EXISTS (
		SELECT 1
		FROM public.onto_projects p
		WHERE p.id = v_invite.project_id
			AND p.deleted_at IS NULL
	) THEN
		UPDATE public.onto_project_invites
		SET status = 'revoked'
		WHERE id = v_invite.id
			AND status IN ('pending', 'declined');
		RAISE EXCEPTION 'Invite is no longer valid';
	END IF;

	UPDATE public.onto_project_members AS m
	SET role_key = v_invite.role_key,
		access = v_invite.access,
		removed_at = NULL,
		removed_by_actor_id = NULL
	WHERE m.project_id = v_invite.project_id
		AND m.actor_id = v_actor_id
		AND m.removed_at IS NOT NULL;

	IF NOT FOUND THEN
		INSERT INTO public.onto_project_members (
			project_id,
			actor_id,
			role_key,
			access,
			added_by_actor_id
		)
		VALUES (
			v_invite.project_id,
			v_actor_id,
			v_invite.role_key,
			v_invite.access,
			v_invite.invited_by_actor_id
		)
		ON CONFLICT ON CONSTRAINT unique_project_member DO NOTHING;
	END IF;

	UPDATE public.onto_project_invites
	SET status = 'accepted',
		accepted_by_actor_id = v_actor_id,
		accepted_at = now(),
		declined_at = NULL
	WHERE id = v_invite.id;

	UPDATE public.onto_project_invites
	SET status = 'revoked'
	WHERE id <> v_invite.id
		AND project_id = v_invite.project_id
		AND lower(trim(invitee_email)) = lower(trim(v_invite.invitee_email))
		AND status IN ('pending', 'declined');

	RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_project_invite(
	p_token_hash text,
	p_actor_id uuid,
	p_user_email text
)
RETURNS TABLE (project_id uuid, role_key text, access text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_invite public.onto_project_invites%ROWTYPE;
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

	IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor_id THEN
		RAISE EXCEPTION 'Actor mismatch';
	END IF;

	IF p_user_email IS NOT NULL AND lower(trim(p_user_email)) <> lower(trim(v_user_email)) THEN
		RAISE EXCEPTION 'User email mismatch';
	END IF;

	SELECT * INTO v_invite
	FROM public.onto_project_invites
	WHERE token_hash = p_token_hash
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Invite not found';
	END IF;

	IF v_invite.status NOT IN ('pending', 'declined') THEN
		RAISE EXCEPTION 'Invite is not pending';
	END IF;

	IF v_invite.status = 'declined'
		AND (
			v_invite.declined_at IS NULL
			OR v_invite.declined_at + interval '48 hours' < now()
		) THEN
		RAISE EXCEPTION 'Invite was declined and is no longer recoverable';
	END IF;

	IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
		UPDATE public.onto_project_invites
		SET status = 'expired'
		WHERE id = v_invite.id;
		RAISE EXCEPTION 'Invite has expired';
	END IF;

	IF lower(trim(v_invite.invitee_email)) <> lower(trim(v_user_email)) THEN
		RAISE EXCEPTION 'Invite email mismatch';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.onto_projects p
		WHERE p.id = v_invite.project_id
			AND p.deleted_at IS NULL
	) THEN
		UPDATE public.onto_project_invites
		SET status = 'revoked'
		WHERE id = v_invite.id
			AND status IN ('pending', 'declined');
		RAISE EXCEPTION 'Invite is no longer valid';
	END IF;

	UPDATE public.onto_project_members AS m
	SET role_key = v_invite.role_key,
		access = v_invite.access,
		removed_at = NULL,
		removed_by_actor_id = NULL
	WHERE m.project_id = v_invite.project_id
		AND m.actor_id = v_actor_id
		AND m.removed_at IS NOT NULL;

	IF NOT FOUND THEN
		INSERT INTO public.onto_project_members (
			project_id,
			actor_id,
			role_key,
			access,
			added_by_actor_id
		)
		VALUES (
			v_invite.project_id,
			v_actor_id,
			v_invite.role_key,
			v_invite.access,
			v_invite.invited_by_actor_id
		)
		ON CONFLICT ON CONSTRAINT unique_project_member DO NOTHING;
	END IF;

	UPDATE public.onto_project_invites
	SET status = 'accepted',
		accepted_by_actor_id = v_actor_id,
		accepted_at = now(),
		declined_at = NULL
	WHERE id = v_invite.id;

	UPDATE public.onto_project_invites
	SET status = 'revoked'
	WHERE id <> v_invite.id
		AND project_id = v_invite.project_id
		AND lower(trim(invitee_email)) = lower(trim(v_invite.invitee_email))
		AND status IN ('pending', 'declined');

	RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

DROP FUNCTION IF EXISTS public.decline_project_invite(uuid);

CREATE OR REPLACE FUNCTION public.decline_project_invite(p_invite_id uuid)
RETURNS TABLE (
	invite_id uuid,
	status text,
	declined_at timestamptz,
	recoverable_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_project_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_invite_preview(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_project_invite_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_project_invite_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_project_invite(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_project_invite(uuid) TO authenticated;

COMMIT;
