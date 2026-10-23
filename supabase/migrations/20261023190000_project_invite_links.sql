-- supabase/migrations/20261023190000_project_invite_links.sql
--
-- Quick invite links (people layer, DJ 10-23). The owner makes one link per project,
-- copies it (or shows its QR code), and pastes it anywhere. Anyone who opens it and
-- signs in joins directly with the role the owner chose (Viewer by default) and that
-- agent setting (Read by default; Write only with Editor). Links expire (7 days by
-- default). The owner can change the settings, reset the link (the old one stops
-- working), or turn it off. People who joined stay members, removable as usual.
--
-- * No raw token is stored: token_hash is the sha256 of the token. The web server
--   derives each link's token from the link id with a server secret, so the owner can
--   copy the current link again without the database ever holding it.
-- * The table has no client access. Everything goes through the RPCs below:
--   owner-only create/reset, change, turn off, and get (settings only, never a token);
--   a preview for signed-out visitors (project name, who invited, role, agents, expiry);
--   and accept for the signed-in visitor.
-- * onto_project_members.joined_via_invite_link_id records the link someone joined
--   with, so the members list can say so.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onto_project_invite_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	token_hash text NOT NULL,
	role_key text NOT NULL DEFAULT 'viewer',
	access text NOT NULL DEFAULT 'read',
	agent_access text NOT NULL DEFAULT 'read',
	created_by_actor_id uuid NULL REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz NULL,
	-- 'reset' (replaced by a new link) or 'turned_off'; tells the visitor which happened.
	revoked_reason text NULL,
	join_count integer NOT NULL DEFAULT 0,
	last_joined_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT onto_project_invite_links_token_hash_key UNIQUE (token_hash),
	CONSTRAINT chk_invite_link_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT chk_invite_link_role CHECK (
		(role_key = 'viewer' AND access = 'read') OR (role_key = 'editor' AND access = 'write')
	),
	-- Agents never get more than their person: Write only for Editors.
	CONSTRAINT chk_invite_link_agent_access CHECK (
		agent_access IN ('off', 'read', 'write') AND (agent_access <> 'write' OR role_key = 'editor')
	),
	CONSTRAINT chk_invite_link_revoked CHECK (
		(revoked_at IS NULL AND revoked_reason IS NULL)
		OR (revoked_at IS NOT NULL AND revoked_reason IN ('reset', 'turned_off'))
	),
	CONSTRAINT chk_invite_link_join_count CHECK (join_count >= 0)
);

-- One live link per project.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onto_project_invite_links_active
	ON public.onto_project_invite_links (project_id)
	WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_project_invite_links_project_created
	ON public.onto_project_invite_links (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onto_project_invite_links_created_by
	ON public.onto_project_invite_links (created_by_actor_id)
	WHERE created_by_actor_id IS NOT NULL;

ALTER TABLE public.onto_project_invite_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onto_project_invite_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.onto_project_invite_links TO service_role;

COMMENT ON TABLE public.onto_project_invite_links IS
	'Owner-made join links, one live per project. token_hash = sha256(token); the raw token is never stored. No client access: use the *_project_invite_link RPCs.';

-- Which link a member joined with (NULL for owners, email/handle invites, approvals).
ALTER TABLE public.onto_project_members
	ADD COLUMN IF NOT EXISTS joined_via_invite_link_id uuid NULL
		REFERENCES public.onto_project_invite_links(id) ON DELETE SET NULL;

-- Project fold: a link belongs to the project it was made for.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'onto_project_invite_links', 'project_id', 'leave_behind',
				'Invite links stay with the archived source, like pending invites; the destination owner makes a new one.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

-- ---------------------------------------------------------------------------
-- 2. Helpers (server-only)
-- ---------------------------------------------------------------------------

-- The signed-in caller's actor when they own the project; raises otherwise.
CREATE OR REPLACE FUNCTION public.project_invite_link_owner_actor(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor uuid;
BEGIN
	IF public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
		RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
	END IF;
	SELECT a.id INTO v_actor FROM public.onto_actors AS a WHERE a.user_id = auth.uid() LIMIT 1;
	IF v_actor IS NULL OR NOT public.actor_has_project_member_access(v_actor, p_project_id, 'admin') THEN
		RAISE EXCEPTION 'Only the project owner can manage the invite link' USING ERRCODE = '42501';
	END IF;
	RETURN v_actor;
END;
$$;

-- The owner-facing view of a link: settings only, never a token or its hash.
CREATE OR REPLACE FUNCTION public.project_invite_link_settings(p_link_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT jsonb_build_object(
		'id', l.id,
		'project_id', l.project_id,
		'role_key', l.role_key,
		'agent_access', l.agent_access,
		'expires_at', l.expires_at,
		'expired', l.expires_at <= now(),
		'join_count', l.join_count,
		'last_joined_at', l.last_joined_at,
		'created_at', l.created_at,
		'updated_at', l.updated_at
	)
	FROM public.onto_project_invite_links AS l
	WHERE l.id = p_link_id
$$;

-- Shared validation for owner-chosen settings.
CREATE OR REPLACE FUNCTION public.project_invite_link_check_settings(
	p_role_key text,
	p_agent_access text,
	p_expires_in_days integer
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
	IF p_role_key IS NULL OR p_role_key NOT IN ('viewer', 'editor') THEN
		RAISE EXCEPTION 'Role must be viewer or editor' USING ERRCODE = '22023';
	END IF;
	IF p_agent_access IS NULL OR p_agent_access NOT IN ('off', 'read', 'write') THEN
		RAISE EXCEPTION 'Agent access must be off, read, or write' USING ERRCODE = '22023';
	END IF;
	IF p_agent_access = 'write' AND p_role_key <> 'editor' THEN
		RAISE EXCEPTION 'Agents can only write where their person can edit' USING ERRCODE = '22023';
	END IF;
	IF p_expires_in_days IS NOT NULL AND (p_expires_in_days < 1 OR p_expires_in_days > 30) THEN
		RAISE EXCEPTION 'A link can last 1 to 30 days' USING ERRCODE = '22023';
	END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Owner RPCs (signed-in owner only; each checks auth.uid() itself)
-- ---------------------------------------------------------------------------

-- The project's current link (live, or expired but not yet replaced), or null.
CREATE OR REPLACE FUNCTION public.get_project_invite_link(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_link_id uuid;
BEGIN
	PERFORM public.project_invite_link_owner_actor(p_project_id);
	SELECT l.id INTO v_link_id
	FROM public.onto_project_invite_links AS l
	WHERE l.project_id = p_project_id AND l.revoked_at IS NULL
	LIMIT 1;
	RETURN jsonb_build_object('link', public.project_invite_link_settings(v_link_id));
END;
$$;

-- Create the link, or reset it: the current link (if any) stops working and a new one
-- replaces it. The server picks the id and passes the token's sha256; the raw token
-- never reaches the database.
CREATE OR REPLACE FUNCTION public.create_project_invite_link(
	p_project_id uuid,
	p_link_id uuid,
	p_token_hash text,
	p_role_key text DEFAULT 'viewer',
	p_agent_access text DEFAULT 'read',
	p_expires_in_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor uuid := public.project_invite_link_owner_actor(p_project_id);
	v_replaced integer := 0;
BEGIN
	PERFORM public.project_invite_link_check_settings(
		p_role_key, p_agent_access, COALESCE(p_expires_in_days, 7)
	);
	IF p_link_id IS NULL THEN
		RAISE EXCEPTION 'A link id is required' USING ERRCODE = '22023';
	END IF;
	IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
		RAISE EXCEPTION 'A token hash is required' USING ERRCODE = '22023';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM public.onto_projects AS p
		WHERE p.id = p_project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
	) THEN
		RAISE EXCEPTION 'Archived projects can''t have an invite link' USING ERRCODE = '22023';
	END IF;

	UPDATE public.onto_project_invite_links AS l
	SET revoked_at = now(), revoked_reason = 'reset', updated_at = now()
	WHERE l.project_id = p_project_id AND l.revoked_at IS NULL;
	GET DIAGNOSTICS v_replaced = ROW_COUNT;

	INSERT INTO public.onto_project_invite_links (
		id, project_id, token_hash, role_key, access, agent_access, created_by_actor_id, expires_at
	)
	VALUES (
		p_link_id,
		p_project_id,
		p_token_hash,
		p_role_key,
		CASE WHEN p_role_key = 'editor' THEN 'write' ELSE 'read' END,
		p_agent_access,
		v_actor,
		now() + make_interval(days => COALESCE(p_expires_in_days, 7))
	);

	RETURN jsonb_build_object(
		'link', public.project_invite_link_settings(p_link_id),
		'replaced', v_replaced > 0
	);
END;
$$;

-- Change the current link's role, agents, or expiry. The link itself stays the same.
-- p_expires_in_days counts from now; NULL keeps the current expiry.
CREATE OR REPLACE FUNCTION public.update_project_invite_link(
	p_project_id uuid,
	p_role_key text,
	p_agent_access text,
	p_expires_in_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_link_id uuid;
BEGIN
	PERFORM public.project_invite_link_owner_actor(p_project_id);
	PERFORM public.project_invite_link_check_settings(p_role_key, p_agent_access, p_expires_in_days);

	UPDATE public.onto_project_invite_links AS l
	SET role_key = p_role_key,
		access = CASE WHEN p_role_key = 'editor' THEN 'write' ELSE 'read' END,
		agent_access = p_agent_access,
		expires_at = CASE
			WHEN p_expires_in_days IS NULL THEN l.expires_at
			ELSE now() + make_interval(days => p_expires_in_days)
		END,
		updated_at = now()
	WHERE l.project_id = p_project_id AND l.revoked_at IS NULL
	RETURNING l.id INTO v_link_id;

	IF v_link_id IS NULL THEN
		RAISE EXCEPTION 'This project has no invite link' USING ERRCODE = 'P0002';
	END IF;
	RETURN jsonb_build_object('link', public.project_invite_link_settings(v_link_id));
END;
$$;

-- Turn the link off. People who joined with it stay members.
CREATE OR REPLACE FUNCTION public.turn_off_project_invite_link(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_count integer := 0;
BEGIN
	PERFORM public.project_invite_link_owner_actor(p_project_id);
	UPDATE public.onto_project_invite_links AS l
	SET revoked_at = now(), revoked_reason = 'turned_off', updated_at = now()
	WHERE l.project_id = p_project_id AND l.revoked_at IS NULL;
	GET DIAGNOSTICS v_count = ROW_COUNT;
	RETURN jsonb_build_object('turned_off', v_count > 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Visitor RPCs
-- ---------------------------------------------------------------------------

-- What someone holding the link may see before joining. Signed-out safe.
--   active: project name, who invited them (a name, never an email), role, what their
--           agents could do, and when the link stops working. A signed-in visitor who is
--           already in the project also gets already_member + project_id.
--   expired | reset | turned_off | not_found: the status alone.
CREATE OR REPLACE FUNCTION public.get_project_invite_link_preview(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_link public.onto_project_invite_links%ROWTYPE;
	v_project_name text;
	v_owner_actor uuid;
	v_inviter_name text;
	v_viewer_actor uuid;
	v_result jsonb;
BEGIN
	IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	SELECT * INTO v_link FROM public.onto_project_invite_links AS l WHERE l.token_hash = p_token_hash;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;
	IF v_link.revoked_at IS NOT NULL THEN
		RETURN jsonb_build_object('status', v_link.revoked_reason);
	END IF;

	SELECT p.name, p.created_by INTO v_project_name, v_owner_actor
	FROM public.onto_projects AS p
	WHERE p.id = v_link.project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;
	IF v_link.expires_at <= now() THEN
		RETURN jsonb_build_object('status', 'expired');
	END IF;

	-- The person who made the link, else the current owner. A display name or handle only.
	SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || NULLIF(btrim(u.username), ''))
	INTO v_inviter_name
	FROM public.onto_actors AS a
	JOIN public.users AS u ON u.id = a.user_id
	WHERE a.id = COALESCE(v_link.created_by_actor_id, v_owner_actor);
	IF v_inviter_name IS NULL AND v_link.created_by_actor_id IS DISTINCT FROM v_owner_actor THEN
		SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || NULLIF(btrim(u.username), ''))
		INTO v_inviter_name
		FROM public.onto_actors AS a
		JOIN public.users AS u ON u.id = a.user_id
		WHERE a.id = v_owner_actor;
	END IF;

	v_result := jsonb_build_object(
		'status', 'active',
		'project_name', v_project_name,
		'inviter_name', v_inviter_name,
		'role_key', v_link.role_key,
		'agent_access', v_link.agent_access,
		'expires_at', v_link.expires_at
	);

	IF public.people_layer_jwt_role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
		SELECT a.id INTO v_viewer_actor FROM public.onto_actors AS a WHERE a.user_id = auth.uid() LIMIT 1;
		IF v_viewer_actor IS NOT NULL
			AND public.actor_has_project_member_access(v_viewer_actor, v_link.project_id, 'read')
		THEN
			v_result := v_result || jsonb_build_object(
				'already_member', true,
				'project_id', v_link.project_id
			);
		END IF;
	END IF;

	RETURN v_result;
END;
$$;

-- Join with the link, as the signed-in user. Returns a status:
--   joined          added (or re-added after leaving) with the link's role and agents
--   already_member  nothing changed
--   removed         the owner removed this person; a link never adds them back
--   expired | reset | turned_off | not_found
CREATE OR REPLACE FUNCTION public.accept_project_invite_link(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_link public.onto_project_invite_links%ROWTYPE;
	v_project_name text;
	v_owner_actor uuid;
	v_actor uuid;
	v_member public.onto_project_members%ROWTYPE;
	v_email text;
BEGIN
	IF public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' OR v_uid IS NULL THEN
		RAISE EXCEPTION 'Sign in to join this project' USING ERRCODE = '42501';
	END IF;
	IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	SELECT * INTO v_link
	FROM public.onto_project_invite_links AS l
	WHERE l.token_hash = p_token_hash
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;
	IF v_link.revoked_at IS NOT NULL THEN
		RETURN jsonb_build_object('status', v_link.revoked_reason);
	END IF;

	SELECT p.name, p.created_by INTO v_project_name, v_owner_actor
	FROM public.onto_projects AS p
	WHERE p.id = v_link.project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;
	IF v_link.expires_at <= now() THEN
		RETURN jsonb_build_object('status', 'expired');
	END IF;

	v_actor := public.ensure_actor_for_user(v_uid);

	IF public.actor_has_project_member_access(v_actor, v_link.project_id, 'read') THEN
		SELECT * INTO v_member
		FROM public.onto_project_members AS m
		WHERE m.project_id = v_link.project_id AND m.actor_id = v_actor AND m.removed_at IS NULL;
		RETURN jsonb_build_object(
			'status', 'already_member',
			'project_id', v_link.project_id,
			'project_name', v_project_name,
			'role_key', COALESCE(v_member.role_key, 'owner')
		);
	END IF;

	SELECT * INTO v_member
	FROM public.onto_project_members AS m
	WHERE m.project_id = v_link.project_id AND m.actor_id = v_actor
	FOR UPDATE;

	IF FOUND THEN
		-- Someone the owner removed stays out; people who left on their own can come back.
		IF v_member.removed_by_actor_id IS DISTINCT FROM v_actor THEN
			RETURN jsonb_build_object('status', 'removed', 'project_name', v_project_name);
		END IF;
		UPDATE public.onto_project_members AS m
		SET role_key = v_link.role_key,
			access = v_link.access,
			agent_access = v_link.agent_access,
			removed_at = NULL,
			removed_by_actor_id = NULL,
			added_by_actor_id = COALESCE(v_link.created_by_actor_id, v_owner_actor),
			joined_via_invite_link_id = v_link.id
		WHERE m.id = v_member.id;
	ELSE
		INSERT INTO public.onto_project_members (
			project_id, actor_id, role_key, access, agent_access, added_by_actor_id, joined_via_invite_link_id
		)
		VALUES (
			v_link.project_id,
			v_actor,
			v_link.role_key,
			v_link.access,
			v_link.agent_access,
			COALESCE(v_link.created_by_actor_id, v_owner_actor),
			v_link.id
		);
	END IF;

	UPDATE public.onto_project_invite_links AS l
	SET join_count = l.join_count + 1, last_joined_at = now()
	WHERE l.id = v_link.id;

	-- A direct invite still waiting for this person is settled by joining; the owner can
	-- change their role from the members list.
	SELECT u.email INTO v_email FROM public.users AS u WHERE u.id = v_uid;
	UPDATE public.onto_project_invites AS i
	SET status = 'revoked'
	WHERE i.project_id = v_link.project_id
		AND i.status IN ('pending', 'declined')
		AND (
			i.invitee_user_id = v_uid
			OR (v_email IS NOT NULL AND lower(btrim(i.invitee_email)) = lower(btrim(v_email)))
		);

	RETURN jsonb_build_object(
		'status', 'joined',
		'project_id', v_link.project_id,
		'project_name', v_project_name,
		'role_key', v_link.role_key,
		'agent_access', v_link.agent_access,
		'owner_actor_id', v_owner_actor
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants (functions are server-only by default)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.project_invite_link_owner_actor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_invite_link_settings(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_invite_link_check_settings(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_project_invite_link(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_project_invite_link(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_project_invite_link(uuid, text, text, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.turn_off_project_invite_link(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_project_invite_link_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_project_invite_link(text) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.project_invite_link_owner_actor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_invite_link_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_invite_link_check_settings(text, text, integer) TO service_role;
-- Called from the owner's signed-in session (user-scoped client).
GRANT EXECUTE ON FUNCTION public.get_project_invite_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_invite_link(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_invite_link(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.turn_off_project_invite_link(uuid) TO authenticated;
-- The join page loads signed out too.
GRANT EXECUTE ON FUNCTION public.get_project_invite_link_preview(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_project_invite_link(text) TO authenticated;

COMMIT;
