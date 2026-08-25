-- supabase/migrations/20260825181727_harden_ontology_actor_access_rpcs.sql
-- Harden actor provisioning and project-member access helpers.
--
-- Existing Supabase projects grant EXECUTE on new public functions to anon,
-- authenticated, and service_role through default privileges. Revoke every
-- unintended role explicitly; revoking PUBLIC alone is not sufficient.

CREATE OR REPLACE FUNCTION public.ensure_actor_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor_id uuid;
	v_user_name text;
	v_user_email text;
	v_claims_text text;
	v_jwt_role text;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'ensure_actor_for_user requires a user id'
			USING ERRCODE = '22004';
	END IF;

	-- PostgREST provides the current claims as JSON. Keep the legacy scalar
	-- fallback because local/disposable database tests commonly set that form.
	v_claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
	IF v_claims_text IS NOT NULL THEN
		v_jwt_role := NULLIF((v_claims_text::jsonb)->>'role', '');
	END IF;
	v_jwt_role := COALESCE(
		v_jwt_role,
		NULLIF(current_setting('request.jwt.claim.role', true), '')
	);

	IF v_jwt_role = 'service_role' THEN
		-- Trusted server callers intentionally resolve actors for explicit users.
		NULL;
	ELSIF v_jwt_role = 'authenticated' THEN
		IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
			RAISE EXCEPTION 'ensure_actor_for_user may only resolve the authenticated user'
				USING ERRCODE = '42501';
		END IF;
	ELSIF v_jwt_role IS NOT NULL THEN
		RAISE EXCEPTION 'ensure_actor_for_user requires authentication'
			USING ERRCODE = '42501';
	ELSIF session_user NOT IN ('postgres', 'supabase_admin') THEN
		-- Allow owner-run migrations, maintenance, triggers, and SQL functions
		-- outside a Data API request. API calls always carry JWT claims.
		RAISE EXCEPTION 'ensure_actor_for_user requires a trusted database session'
			USING ERRCODE = '42501';
	END IF;

	SELECT a.id
	INTO v_actor_id
	FROM public.onto_actors AS a
	WHERE a.user_id = p_user_id
	LIMIT 1;

	IF v_actor_id IS NOT NULL THEN
		RETURN v_actor_id;
	END IF;

	SELECT u.name, u.email
	INTO v_user_name, v_user_email
	FROM public.users AS u
	WHERE u.id = p_user_id
	LIMIT 1;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'User not found: %', p_user_id;
	END IF;

	INSERT INTO public.onto_actors (kind, name, email, user_id)
	VALUES (
		'human',
		COALESCE(
			NULLIF(BTRIM(v_user_name), ''),
			NULLIF(BTRIM(v_user_email), ''),
			'BuildOS User'
		),
		v_user_email,
		p_user_id
	)
	ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING
	RETURNING id INTO v_actor_id;

	-- A concurrent first call may have inserted the canonical row while this
	-- call waited on the unique user_id index.
	IF v_actor_id IS NULL THEN
		SELECT a.id
		INTO v_actor_id
		FROM public.onto_actors AS a
		WHERE a.user_id = p_user_id
		LIMIT 1;
	END IF;

	IF v_actor_id IS NULL THEN
		RAISE EXCEPTION 'Failed to resolve actor for user: %', p_user_id;
	END IF;

	RETURN v_actor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(
	p_actor_id uuid,
	p_project_id uuid,
	p_required_access text DEFAULT 'read'::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT
		p_actor_id IS NOT NULL
		AND p_project_id IS NOT NULL
		AND (
			EXISTS (
				SELECT 1
				FROM public.onto_projects AS p
				WHERE p.id = p_project_id
					AND p.deleted_at IS NULL
					AND p.created_by = p_actor_id
			)
			OR EXISTS (
				SELECT 1
				FROM public.onto_project_members AS m
				JOIN public.onto_projects AS p ON p.id = m.project_id
				WHERE m.project_id = p_project_id
					AND p.deleted_at IS NULL
					AND m.actor_id = p_actor_id
					AND m.removed_at IS NULL
					AND (
						(p_required_access = 'read' AND m.access IN ('read', 'write', 'admin'))
						OR (p_required_access = 'write' AND m.access IN ('write', 'admin'))
						OR (p_required_access = 'admin' AND m.access = 'admin')
					)
			)
		)
$$;

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text DEFAULT 'read'::text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor_id uuid;
BEGIN
	IF p_project_id IS NULL THEN
		RETURN false;
	END IF;

	IF public.is_admin() THEN
		RETURN true;
	END IF;

	v_actor_id := public.current_actor_id();
	IF v_actor_id IS NULL THEN
		RETURN false;
	END IF;

	RETURN public.actor_has_project_member_access(
		v_actor_id,
		p_project_id,
		p_required_access
	);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_actor_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_actor_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_actor_for_user(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.ensure_actor_for_user(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.ensure_actor_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_actor_for_user(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.current_actor_has_project_member_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_actor_has_project_member_access(uuid, text) TO service_role;

COMMENT ON FUNCTION public.ensure_actor_for_user(uuid) IS
	'Ensures the authenticated user (or a trusted service caller''s explicit user) has one canonical ontology actor.';

COMMENT ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) IS
	'Service-role-only check for a specific ontology actor''s owner/member project access.';

COMMENT ON FUNCTION public.current_actor_has_project_member_access(uuid, text) IS
	'Checks owner/member/admin project access for the current authenticated actor without public-project fallback.';
