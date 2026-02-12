-- supabase/migrations/20260423000000_project_collaboration_race_fixes.sql
-- Fix race conditions for invite acceptance and project notification settings.
-- Date: 2026-04-23

BEGIN;

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

	SELECT *
	INTO v_invite
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

	IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
		RAISE EXCEPTION 'Invite email mismatch';
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
		VALUES (
			v_invite.project_id,
			v_actor_id,
			v_invite.role_key,
			v_invite.access,
			v_invite.invited_by_actor_id
		)
		ON CONFLICT (project_id, actor_id) DO NOTHING;
	END IF;

	UPDATE onto_project_invites
	SET status = 'accepted',
		accepted_by_actor_id = v_actor_id,
		accepted_at = now()
	WHERE id = v_invite.id;

	RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

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

	SELECT *
	INTO v_invite
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
		VALUES (
			v_invite.project_id,
			v_actor_id,
			v_invite.role_key,
			v_invite.access,
			v_invite.invited_by_actor_id
		)
		ON CONFLICT (project_id, actor_id) DO NOTHING;
	END IF;

	UPDATE onto_project_invites
	SET status = 'accepted',
		accepted_by_actor_id = v_actor_id,
		accepted_at = now()
	WHERE id = v_invite.id;

	RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_notification_settings(
	p_project_id uuid,
	p_member_enabled boolean DEFAULT NULL,
	p_project_default_enabled boolean DEFAULT NULL
)
RETURNS TABLE(
	project_id uuid,
	member_count integer,
	is_shared_project boolean,
	project_default_enabled boolean,
	member_enabled boolean,
	effective_enabled boolean,
	member_overridden boolean,
	can_manage_default boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_actor_id uuid;
	v_is_collaborator boolean := false;
	v_props jsonb;
	v_notifications jsonb;
	v_shared jsonb;
	v_overrides jsonb;
	v_project_default_enabled boolean;
	v_current record;
BEGIN
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION 'Project ID is required';
	END IF;

	IF p_member_enabled IS NULL AND p_project_default_enabled IS NULL THEN
		RAISE EXCEPTION 'At least one setting must be provided';
	END IF;

	IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
		RAISE EXCEPTION 'Access denied';
	END IF;

	v_actor_id := current_actor_id();
	IF v_actor_id IS NULL THEN
		RAISE EXCEPTION 'Actor not found for current user';
	END IF;

	v_is_collaborator := EXISTS (
		SELECT 1
		FROM onto_projects p
		WHERE p.id = p_project_id
			AND p.created_by = v_actor_id
			AND p.deleted_at IS NULL
	) OR EXISTS (
		SELECT 1
		FROM onto_project_members m
		WHERE m.project_id = p_project_id
			AND m.actor_id = v_actor_id
			AND m.removed_at IS NULL
	);

	IF NOT v_is_collaborator THEN
		RAISE EXCEPTION 'Only collaborators can update project notification settings';
	END IF;

	SELECT p.props
	INTO v_props
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Project not found';
	END IF;

	v_props := COALESCE(v_props, '{}'::jsonb);
	v_notifications := CASE
		WHEN jsonb_typeof(v_props->'notifications') = 'object' THEN v_props->'notifications'
		ELSE '{}'::jsonb
	END;
	v_shared := CASE
		WHEN jsonb_typeof(v_notifications->'shared_project_activity') = 'object'
			THEN v_notifications->'shared_project_activity'
		ELSE '{}'::jsonb
	END;
	v_overrides := CASE
		WHEN jsonb_typeof(v_shared->'member_overrides') = 'object'
			THEN v_shared->'member_overrides'
		ELSE '{}'::jsonb
	END;

	-- Read effective defaults after row lock to avoid lost updates from concurrent writes.
	SELECT *
	INTO v_current
	FROM get_project_notification_settings(p_project_id)
	LIMIT 1;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Project not found';
	END IF;

	v_project_default_enabled := CASE
		WHEN jsonb_typeof(v_shared->'enabled_by_default') = 'boolean'
			THEN (v_shared->>'enabled_by_default')::boolean
		ELSE v_current.project_default_enabled
	END;

	IF p_project_default_enabled IS NOT NULL THEN
		IF NOT current_actor_has_project_access(p_project_id, 'admin') THEN
			RAISE EXCEPTION 'Only project admins can update the project default';
		END IF;
		v_project_default_enabled := p_project_default_enabled;
	END IF;

	IF p_member_enabled IS NOT NULL THEN
		IF p_member_enabled = v_project_default_enabled THEN
			v_overrides := v_overrides - v_actor_id::text;
		ELSE
			v_overrides := jsonb_set(v_overrides, ARRAY[v_actor_id::text], to_jsonb(p_member_enabled), true);
		END IF;
	END IF;

	v_shared := jsonb_set(v_shared, '{enabled_by_default}', to_jsonb(v_project_default_enabled), true);
	v_shared := jsonb_set(v_shared, '{member_overrides}', v_overrides, true);
	v_shared := jsonb_set(v_shared, '{updated_at}', to_jsonb(NOW()), true);

	v_notifications := jsonb_set(v_notifications, '{shared_project_activity}', v_shared, true);
	v_props := jsonb_set(v_props, '{notifications}', v_notifications, true);

	UPDATE onto_projects
	SET
		props = v_props,
		updated_at = NOW()
	WHERE id = p_project_id;

	RETURN QUERY
	SELECT *
	FROM get_project_notification_settings(p_project_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION accept_project_invite(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_project_invite_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_notification_settings(uuid, boolean, boolean)
	TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_notification_settings(uuid, boolean, boolean)
	TO service_role;

COMMIT;
