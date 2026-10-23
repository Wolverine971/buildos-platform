-- supabase/migrations/20261023200000_people_rejoin_requests.sql
--
-- Rejoining asks the owner (DJ, 10-23). Someone who left a project, or whom the owner
-- removed, can't walk back in with the project's invite link. Opening the link instead
-- sends the owner a rejoin request (in BuildOS and by email); the owner lets them back
-- in or denies it. A denied rejoin is final for that project: they can't ask again.
--
-- * Rejoin requests are people_requests rows with kind = 'rejoin' and the project_id,
--   so they land in the owner's existing /people inbox and use decide_people_request.
--   project_hint carries the project name for older readers.
-- * One pending request per pair still applies (uq_people_requests_pending_pair). If an
--   ordinary request is already waiting, the visitor hears that a request is waiting.
-- * A block stays silent: the visitor keeps seeing "waiting".
-- * The owner inviting them again by email or @handle, or approving an ordinary
--   request, still adds them directly; only the shared link asks.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.people_requests
	ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'access',
	ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	ADD COLUMN IF NOT EXISTS agent_access_requested text NULL,
	ADD COLUMN IF NOT EXISTS via_invite_link_id uuid NULL
		REFERENCES public.onto_project_invite_links(id) ON DELETE SET NULL;

ALTER TABLE public.people_requests DROP CONSTRAINT IF EXISTS people_requests_kind_check;
ALTER TABLE public.people_requests
	ADD CONSTRAINT people_requests_kind_check CHECK (
		(kind = 'access' AND project_id IS NULL)
		OR (kind = 'rejoin' AND project_id IS NOT NULL)
	);
ALTER TABLE public.people_requests DROP CONSTRAINT IF EXISTS people_requests_agent_access_requested_check;
ALTER TABLE public.people_requests
	ADD CONSTRAINT people_requests_agent_access_requested_check CHECK (
		agent_access_requested IS NULL OR agent_access_requested IN ('off', 'read', 'write')
	);

CREATE INDEX IF NOT EXISTS idx_people_requests_rejoin
	ON public.people_requests (from_user_id, project_id)
	WHERE kind = 'rejoin';

COMMENT ON COLUMN public.people_requests.kind IS
	'access = asked to see the owner''s projects; rejoin = a former member opened the project''s invite link.';

-- Project fold: a rejoin request is about the project it was made for.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'people_requests', 'project_id', 'leave_behind',
				'A rejoin request stays with the archived source; the person can use the destination''s link.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

-- ---------------------------------------------------------------------------
-- 2. Helper (server-only): where a former member stands on rejoining
-- ---------------------------------------------------------------------------
--   denied   the owner declined a rejoin for this project (final)
--   pending  a request to this owner is waiting, or the owner blocked them (silent)
--   ask      they may ask
CREATE OR REPLACE FUNCTION public.people_rejoin_state(p_user_id uuid, p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_owner_user uuid;
BEGIN
	SELECT a.user_id INTO v_owner_user
	FROM public.onto_projects AS p
	JOIN public.onto_actors AS a ON a.id = p.created_by
	WHERE p.id = p_project_id;

	IF EXISTS (
		SELECT 1 FROM public.people_requests AS r
		WHERE r.kind = 'rejoin'
			AND r.from_user_id = p_user_id
			AND r.project_id = p_project_id
			AND r.status = 'declined'
	) THEN
		RETURN 'denied';
	END IF;

	IF v_owner_user IS NOT NULL AND EXISTS (
		SELECT 1 FROM public.people_requests AS r
		WHERE r.from_user_id = p_user_id
			AND r.to_user_id = v_owner_user
			AND (
				(r.status = 'pending' AND r.expires_at > now())
				OR r.status = 'blocked'
			)
	) THEN
		RETURN 'pending';
	END IF;

	RETURN 'ask';
END;
$$;

REVOKE ALL ON FUNCTION public.people_rejoin_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_rejoin_state(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Preview: a signed-in former member learns they'd be asking, not joining
-- ---------------------------------------------------------------------------
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
		ELSIF v_viewer_actor IS NOT NULL AND EXISTS (
			SELECT 1 FROM public.onto_project_members AS m
			WHERE m.project_id = v_link.project_id
				AND m.actor_id = v_viewer_actor
				AND m.removed_at IS NOT NULL
		) THEN
			-- A former member: the link asks the owner instead of adding them.
			v_result := v_result || jsonb_build_object(
				'rejoin', public.people_rejoin_state(auth.uid(), v_link.project_id)
			);
		END IF;
	END IF;

	RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Accept: former members ask to rejoin
-- ---------------------------------------------------------------------------
-- Statuses:
--   joined            added with the link's role and agents
--   already_member    nothing changed
--   rejoin_requested  a former member; the owner was asked (request_id returned)
--   rejoin_pending    a request to this owner is already waiting
--   rejoin_denied     the owner declined their rejoin for this project (final)
--   rate_limited      too many requests waiting
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
	v_owner_user uuid;
	v_actor uuid;
	v_member public.onto_project_members%ROWTYPE;
	v_email text;
	v_state text;
	v_was_member boolean;
	v_request public.people_requests%ROWTYPE;
	v_requester_name text;
	v_payload jsonb;
	v_event_id uuid;
	v_delivery_id uuid;
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
	v_was_member := FOUND;

	IF v_was_member AND v_member.removed_at IS NOT NULL THEN
		-- A former member (they left, or the owner removed them): ask the owner.
		SELECT a.user_id INTO v_owner_user FROM public.onto_actors AS a WHERE a.id = v_owner_actor;
		IF v_owner_user IS NULL OR v_owner_user = v_uid THEN
			RETURN jsonb_build_object('status', 'not_found');
		END IF;

		-- Expired requests still hold the one-pending-per-pair slot; free it, as
		-- create_people_request does.
		UPDATE public.people_requests AS r
		SET status = 'canceled', decided_at = now()
		WHERE r.from_user_id = v_uid
			AND r.to_user_id = v_owner_user
			AND r.status = 'pending'
			AND r.expires_at <= now();

		v_state := public.people_rejoin_state(v_uid, v_link.project_id);
		IF v_state = 'denied' THEN
			RETURN jsonb_build_object('status', 'rejoin_denied', 'project_name', v_project_name);
		END IF;
		IF v_state = 'pending' THEN
			RETURN jsonb_build_object('status', 'rejoin_pending', 'project_name', v_project_name);
		END IF;
		IF (
			SELECT count(*) FROM public.people_requests AS r
			WHERE r.from_user_id = v_uid AND r.status = 'pending' AND r.expires_at > now()
		) >= 10 THEN
			RETURN jsonb_build_object('status', 'rate_limited', 'project_name', v_project_name);
		END IF;

		INSERT INTO public.people_requests (
			from_user_id, to_user_id, kind, project_id, project_hint,
			role_requested, agent_access_requested, via, via_invite_link_id
		)
		VALUES (
			v_uid, v_owner_user, 'rejoin', v_link.project_id, left(v_project_name, 120),
			v_link.role_key, v_link.agent_access, 'web', v_link.id
		)
		RETURNING * INTO v_request;

		SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || u.username, 'Someone')
		INTO v_requester_name
		FROM public.users AS u WHERE u.id = v_uid;

		v_payload := jsonb_build_object(
			'title', COALESCE(v_requester_name, 'Someone') || ' wants to rejoin ' || v_project_name,
			'body', 'They used your invite link after leaving. Let them back in or deny it in BuildOS.',
			'action_url', '/people',
			'event_type', 'people.request.received',
			'request_id', v_request.id,
			'project_id', v_link.project_id
		);
		INSERT INTO public.notification_events (event_type, event_source, target_user_id, payload, metadata)
		VALUES ('people.request.received', 'api_action', v_owner_user, v_payload,
			jsonb_build_object('request_id', v_request.id, 'kind', 'rejoin'))
		RETURNING id INTO v_event_id;
		INSERT INTO public.notification_deliveries (
			event_id, recipient_user_id, channel, payload, status, attempts, max_attempts, sent_at, delivered_at
		)
		VALUES (v_event_id, v_owner_user, 'in_app', v_payload, 'delivered', 1, 1, now(), now())
		RETURNING id INTO v_delivery_id;
		INSERT INTO public.user_notifications (
			event_id, delivery_id, user_id, type, title, message, priority, action_url, event_type, data, expires_at
		)
		VALUES (
			v_event_id, v_delivery_id, v_owner_user, 'info', v_payload->>'title', v_payload->>'body',
			'normal', '/people', 'people.request.received',
			jsonb_build_object('request_id', v_request.id, 'kind', 'rejoin'), v_request.expires_at
		);

		RETURN jsonb_build_object(
			'status', 'rejoin_requested',
			'request_id', v_request.id,
			'project_name', v_project_name
		);
	END IF;

	IF v_was_member THEN
		UPDATE public.onto_project_members AS m
		SET role_key = v_link.role_key,
			access = v_link.access,
			agent_access = v_link.agent_access,
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
-- 5. Inbox: say which project a rejoin is about
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_people_requests(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_viewer uuid := public.people_layer_viewer(p_user_id);
	v_incoming jsonb;
	v_outgoing jsonb;
BEGIN
	SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
	INTO v_incoming
	FROM (
		SELECT r.created_at, jsonb_build_object(
			'id', r.id,
			'created_at', r.created_at,
			'expires_at', r.expires_at,
			'kind', r.kind,
			'role_requested', r.role_requested,
			'agent_access_requested', r.agent_access_requested,
			'project_hint', r.project_hint,
			'project', CASE WHEN r.project_id IS NOT NULL THEN jsonb_build_object(
				'id', r.project_id,
				'name', p.name
			) END,
			'note', r.note,
			'via', r.via,
			'via_agent_label', r.via_agent_label,
			'from', jsonb_build_object(
				'name', u.name,
				'handle', u.username,
				-- Without a handle, the email is the only way to know who is asking.
				'email', CASE WHEN u.username IS NULL THEN u.email END
			)
		) AS row_data
		FROM public.people_requests AS r
		JOIN public.users AS u ON u.id = r.from_user_id
		LEFT JOIN public.onto_projects AS p ON p.id = r.project_id
		WHERE r.to_user_id = v_viewer
			AND r.status = 'pending'
			AND r.expires_at > now()
		ORDER BY r.created_at DESC
		LIMIT 50
	) AS incoming;

	SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
	INTO v_outgoing
	FROM (
		SELECT r.created_at, jsonb_build_object(
			'id', r.id,
			'created_at', r.created_at,
			'decided_at', r.decided_at,
			'kind', r.kind,
			-- A block reads as pending to the person who was blocked.
			'status', CASE
				WHEN r.status = 'blocked' THEN 'pending'
				WHEN r.status = 'pending' AND r.expires_at <= now() THEN 'expired'
				ELSE r.status
			END,
			'role_requested', r.role_requested,
			'project_hint', r.project_hint,
			'via', r.via,
			'to', jsonb_build_object('name', u.name, 'handle', u.username)
		) AS row_data
		FROM public.people_requests AS r
		JOIN public.users AS u ON u.id = r.to_user_id
		WHERE r.from_user_id = v_viewer
		ORDER BY r.created_at DESC
		LIMIT 50
	) AS outgoing;

	RETURN jsonb_build_object('incoming', v_incoming, 'outgoing', v_outgoing);
END;
$$;

COMMIT;
