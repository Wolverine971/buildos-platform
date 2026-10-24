-- supabase/migrations/20261024023325_four_ways_project_join.sql
-- Task 143: one transactional completion path for project joins.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.people_requests
	ADD COLUMN settled_elsewhere boolean NOT NULL DEFAULT false;

-- Called only after a public entry point has authenticated and authorized the join.
-- All entry points take the same per-person advisory lock BEFORE row locks. This
-- also serializes owner approvals with invite/link acceptance for that person.
CREATE OR REPLACE FUNCTION private.finish_project_join(
	p_project_id uuid,
	p_user_id uuid,
	p_source text,
	p_changed boolean,
	p_request_id uuid DEFAULT NULL,
	p_invite_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor uuid;
	v_member public.onto_project_members%ROWTYPE;
	v_project public.onto_projects%ROWTYPE;
	v_email text;
	v_owner_user uuid;
	v_name text;
	v_shared jsonb;
	v_enabled boolean;
	v_effective_agents text;
	v_request public.people_requests%ROWTYPE;
	v_remaining jsonb;
	v_settled jsonb;
	v_grant jsonb;
BEGIN
	SELECT a.id, u.email INTO v_actor, v_email
	FROM public.onto_actors a JOIN public.users u ON u.id = a.user_id
	WHERE u.id = p_user_id;
	SELECT * INTO v_project FROM public.onto_projects
	WHERE id = p_project_id AND deleted_at IS NULL AND archived_at IS NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable'; END IF;
	SELECT * INTO v_member FROM public.onto_project_members
	WHERE project_id = p_project_id AND actor_id = v_actor AND removed_at IS NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Active membership required'; END IF;
	SELECT a.user_id INTO v_owner_user FROM public.onto_actors a WHERE a.id = v_project.created_by;

	UPDATE public.onto_project_invites i SET status = 'revoked'
	WHERE i.project_id = p_project_id
		AND (p_invite_id IS NULL OR i.id <> p_invite_id)
		AND i.status IN ('pending', 'declined')
		AND (i.invitee_user_id = p_user_id
			OR lower(btrim(i.invitee_email)) = lower(btrim(v_email)));

	-- Off is explicit. Standing editor approval may elevate Read to effective Write.
	v_effective_agents := CASE
		WHEN v_member.agent_access = 'off' THEN 'off'
		WHEN v_member.access IN ('write', 'admin') AND EXISTS (
			SELECT 1 FROM public.project_agent_settings s
			WHERE s.project_id = p_project_id AND s.editor_agents_write
		) THEN 'write'
		ELSE v_member.agent_access END;
	v_grant := jsonb_build_object('project_id', p_project_id, 'role', v_member.role_key,
		'agent_access', v_member.agent_access, 'status', 'joined_elsewhere');

	FOR v_request IN
		SELECT r.* FROM public.people_requests r
		WHERE r.from_user_id = p_user_id AND r.to_user_id = v_owner_user
			AND r.status = 'pending' AND r.expires_at > now()
			AND (p_request_id IS NULL OR r.id <> p_request_id)
			AND r.kind IN ('rejoin', 'upgrade')
		ORDER BY r.id FOR UPDATE
	LOOP
		IF v_request.kind = 'rejoin' THEN
			IF v_request.project_id = p_project_id
				AND (v_request.role_requested = 'viewer' OR v_member.access IN ('write', 'admin'))
				AND (v_request.agent_access_requested = 'off'
					OR (v_request.agent_access_requested = 'read' AND v_effective_agents IN ('read', 'write'))
					OR (v_request.agent_access_requested = 'write' AND v_effective_agents = 'write')) THEN
				UPDATE public.people_requests SET status = 'canceled', settled_elsewhere = true,
					decision = jsonb_build_array(v_grant), decided_at = now()
				WHERE id = v_request.id;
			END IF;
		ELSE
			SELECT COALESCE(jsonb_agg(item ORDER BY ord) FILTER (WHERE NOT satisfied), '[]'::jsonb),
				COALESCE(jsonb_agg(v_grant || jsonb_build_object('need', item->>'need') ORDER BY ord)
					FILTER (WHERE satisfied), '[]'::jsonb)
			INTO v_remaining, v_settled
			FROM (
				SELECT item, ord, (item->>'project_id')::uuid = p_project_id AND CASE item->>'need'
					WHEN 'edit' THEN v_member.access IN ('write', 'admin') AND v_effective_agents = 'write'
					WHEN 'agents_write' THEN v_member.access IN ('write', 'admin') AND v_effective_agents = 'write'
					WHEN 'agents_read' THEN v_effective_agents IN ('read', 'write')
					ELSE false END AS satisfied
				FROM jsonb_array_elements(v_request.requested_items) WITH ORDINALITY t(item, ord)
			) items;
			IF jsonb_array_length(v_settled) > 0 THEN
				UPDATE public.people_requests SET
					-- Keep original items when closed (the schema requires a nonempty array).
					requested_items = CASE WHEN jsonb_array_length(v_remaining) = 0
						THEN requested_items ELSE v_remaining END,
					project_id = CASE WHEN jsonb_array_length(v_remaining) = 0
						THEN project_id ELSE (v_remaining->0->>'project_id')::uuid END,
					decision = COALESCE(decision, '[]'::jsonb) || v_settled,
					settled_elsewhere = true,
					status = CASE WHEN jsonb_array_length(v_remaining) = 0 THEN 'canceled' ELSE 'pending' END,
					decided_at = CASE WHEN jsonb_array_length(v_remaining) = 0 THEN now() ELSE NULL END
				WHERE id = v_request.id;
			END IF;
		END IF;
	END LOOP;
	-- Broad requests have no structured project identity. Only an explicit owner
	-- decision closes them; neither project_hint nor natural-language notes are matched.
	-- Settling a request never grants its connection access to a project.
	IF NOT p_changed THEN RETURN; END IF;

	v_shared := v_project.props #> '{notifications,shared_project_activity}';
	v_enabled := CASE
		WHEN jsonb_typeof(v_shared->'member_overrides'->v_actor::text) = 'boolean'
			THEN (v_shared->'member_overrides'->>v_actor::text)::boolean
		WHEN jsonb_typeof(v_shared->'enabled_by_default') = 'boolean'
			THEN (v_shared->>'enabled_by_default')::boolean
		ELSE (SELECT count(*) > 1 FROM (
			SELECT m.actor_id FROM public.onto_project_members m
			WHERE m.project_id = p_project_id AND m.removed_at IS NULL
			UNION SELECT v_project.created_by
		) members) END;
	IF v_enabled THEN
		INSERT INTO public.notification_subscriptions (user_id, event_type, is_active, admin_only, created_by)
		VALUES (p_user_id, 'project.activity.batched', true, false, p_user_id)
		ON CONFLICT (user_id, event_type) DO NOTHING;
	END IF;

	-- Enqueue once in the membership transaction; the existing notification worker
	-- owns delivery/retries. Never change any channel preference or existing opt-out.
	IF p_source IN ('invite', 'invite_link') AND v_owner_user IS NOT NULL AND v_owner_user <> p_user_id THEN
		INSERT INTO public.notification_subscriptions (user_id, event_type, is_active, admin_only, created_by)
		VALUES (v_owner_user, 'project.invite.accepted', true, false, p_user_id)
		ON CONFLICT (user_id, event_type) DO NOTHING;
		v_name := public.people_layer_display_name(p_user_id);
		PERFORM public.emit_notification_event(
			p_event_type := 'project.invite.accepted', p_event_source := 'api_action',
			p_actor_user_id := p_user_id, p_target_user_id := v_owner_user,
			p_payload := jsonb_build_object(
				'title', v_name || ' joined ' || v_project.name,
				'body', v_name || ' joined as ' || v_member.role_key || '.',
				'action_url', '/projects/' || p_project_id::text,
				'project_id', p_project_id, 'project_name', v_project.name,
				'actor_user_id', p_user_id, 'actor_name', v_name,
				'role_key', v_member.role_key, 'via', p_source),
			p_metadata := jsonb_build_object('projectId', p_project_id, 'via', p_source));
	END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.finish_project_join(uuid, uuid, text, boolean, uuid, uuid)
	FROM PUBLIC, anon, authenticated, service_role;

-- Membership permissions are now written together, before accepting the invite.
-- The old status trigger could overwrite a newer membership from a stale invite.
DROP TRIGGER IF EXISTS trg_onto_project_invites_agent_access ON public.onto_project_invites;
DROP FUNCTION IF EXISTS public.apply_project_invite_agent_access();

DROP FUNCTION public.accept_project_invite_by_id(uuid);
CREATE FUNCTION public.accept_project_invite_by_id(p_invite_id uuid)
RETURNS TABLE (project_id uuid, role_key text, access text, agent_access text, project_name text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_actor uuid;
	v_email text;
	v_invite public.onto_project_invites%ROWTYPE;
	v_member public.onto_project_members%ROWTYPE;
	v_project public.onto_projects%ROWTYPE;
	v_status text;
BEGIN
	IF v_uid IS NULL OR public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-join:' || v_uid::text, 0));
	v_actor := public.ensure_actor_for_user(v_uid);
	SELECT COALESCE(u.email, a.email) INTO v_email FROM public.users u
	JOIN public.onto_actors a ON a.id = v_actor WHERE u.id = v_uid;
	SELECT * INTO v_invite FROM public.onto_project_invites i WHERE i.id = p_invite_id FOR UPDATE;
	IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
	IF (v_invite.invitee_user_id IS NOT NULL AND v_invite.invitee_user_id <> v_uid)
		OR (v_invite.invitee_user_id IS NULL AND
			(v_email IS NULL OR lower(btrim(v_invite.invitee_email)) IS DISTINCT FROM lower(btrim(v_email)))) THEN
		RAISE EXCEPTION 'Invite email mismatch' USING ERRCODE = '42501';
	END IF;
	SELECT * INTO v_project FROM public.onto_projects p
	WHERE p.id = v_invite.project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Invite is no longer valid'; END IF;
	SELECT * INTO v_member FROM public.onto_project_members m
	WHERE m.project_id = v_invite.project_id AND m.actor_id = v_actor FOR UPDATE;
	IF FOUND AND v_member.removed_at IS NULL THEN
		-- A stale invite is only a way to open an existing membership, never to change it.
		PERFORM private.finish_project_join(v_project.id, v_uid, 'invite', false);
		RETURN QUERY SELECT v_project.id, v_member.role_key, v_member.access,
			v_member.agent_access, v_project.name, 'already_member'::text;
		RETURN;
	END IF;
	v_status := CASE WHEN v_member.id IS NULL THEN 'joined' ELSE 'rejoined' END;
	IF v_invite.status NOT IN ('pending', 'declined') THEN RAISE EXCEPTION 'Invite is not pending'; END IF;
	IF v_invite.status = 'declined' AND (v_invite.declined_at IS NULL
		OR v_invite.declined_at + interval '48 hours' < now()) THEN
		RAISE EXCEPTION 'Invite was declined and is no longer recoverable';
	END IF;
	IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'Invite has expired'; END IF;
	INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access, added_by_actor_id)
	VALUES (v_project.id, v_actor, v_invite.role_key, v_invite.access, v_invite.agent_access, v_invite.invited_by_actor_id)
	ON CONFLICT ON CONSTRAINT unique_project_member DO UPDATE SET
		role_key = EXCLUDED.role_key, access = EXCLUDED.access, agent_access = EXCLUDED.agent_access,
		removed_at = NULL, removed_by_actor_id = NULL, added_by_actor_id = EXCLUDED.added_by_actor_id
	RETURNING * INTO v_member;
	UPDATE public.onto_project_invites i SET status = 'accepted', accepted_by_actor_id = v_actor,
		accepted_at = now(), declined_at = NULL WHERE i.id = v_invite.id;
	PERFORM private.finish_project_join(v_project.id, v_uid, 'invite', true, NULL, v_invite.id);
	RETURN QUERY SELECT v_project.id, v_member.role_key, v_member.access,
		v_member.agent_access, v_project.name, v_status;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_project_invite_by_id(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_project_invite_by_id(uuid) TO authenticated;

-- Keep the legacy token signature; route it through the same authorization and transition.
CREATE OR REPLACE FUNCTION public.accept_project_invite(p_token_hash text, p_actor_id uuid, p_user_email text)
RETURNS TABLE (project_id uuid, role_key text, access text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_invite_id uuid; v_actor uuid; v_email text;
BEGIN
	IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-join:' || auth.uid()::text, 0));
	v_actor := public.ensure_actor_for_user(auth.uid());
	SELECT a.id, COALESCE(u.email, a.email) INTO v_actor, v_email
	FROM public.onto_actors a JOIN public.users u ON u.id = a.user_id WHERE u.id = auth.uid();
	IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'Actor mismatch'; END IF;
	IF p_user_email IS NOT NULL AND lower(btrim(p_user_email)) IS DISTINCT FROM lower(btrim(v_email)) THEN
		RAISE EXCEPTION 'User email mismatch';
	END IF;
	SELECT i.id INTO v_invite_id FROM public.onto_project_invites i WHERE i.token_hash = p_token_hash;
	RETURN QUERY SELECT r.project_id, r.role_key, r.access FROM public.accept_project_invite_by_id(v_invite_id) r;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_project_invite(text, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_project_invite(text, uuid, text) TO authenticated;


-- Link joins retain the former-member request gate.
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

	PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-join:' || v_uid::text, 0));
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
			'role_key', COALESCE(v_member.role_key, 'owner'),
			'agent_access', COALESCE(v_member.agent_access, 'write')
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

	PERFORM private.finish_project_join(v_link.project_id, v_uid, 'invite_link', true);

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

-- Owner approvals keep task 140 connection scoping and structured upgrade review.
CREATE OR REPLACE FUNCTION public.decide_people_request(
	p_request_id uuid,
	p_decision text,
	p_grants jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_request public.people_requests%ROWTYPE;
	v_owner_actor uuid;
	v_requester_actor uuid;
	v_requester record;
	v_grant jsonb;
	v_item jsonb;
	v_member public.onto_project_members%ROWTYPE;
	v_project_id uuid;
	v_chosen uuid[];
	v_need text;
	v_role text;
	v_agent_access text;
	v_access text;
	v_applied jsonb := '[]'::jsonb;
	v_project_names text[] := ARRAY[]::text[];
	v_owner_name text;
	v_payload jsonb;
	v_event_id uuid;
	v_delivery_id uuid;
	v_join_status text;
	v_action_url text;
BEGIN
	IF public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' OR v_uid IS NULL THEN
		RAISE EXCEPTION 'Decide requests from your signed-in BuildOS session' USING ERRCODE = '42501';
	END IF;
	IF p_decision NOT IN ('approve', 'decline', 'block') THEN
		RAISE EXCEPTION 'Decision must be approve, decline, or block' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_request FROM public.people_requests WHERE id = p_request_id;
	IF NOT FOUND OR v_request.to_user_id IS DISTINCT FROM v_uid THEN
		RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
	END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-join:' || v_request.from_user_id::text, 0));
	SELECT * INTO v_request FROM public.people_requests WHERE id = p_request_id FOR UPDATE;
	IF NOT FOUND OR v_request.to_user_id IS DISTINCT FROM v_uid THEN
		RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
	END IF;
	IF v_request.status <> 'pending' OR v_request.expires_at <= now() THEN
		RAISE EXCEPTION 'This request is no longer open' USING ERRCODE = '22023';
	END IF;

	IF p_decision IN ('decline', 'block') THEN
		UPDATE public.people_requests
		SET status = CASE WHEN p_decision = 'block' THEN 'blocked' ELSE 'declined' END,
			decided_at = now()
		WHERE id = v_request.id;
		RETURN jsonb_build_object('status', CASE WHEN p_decision = 'block' THEN 'blocked' ELSE 'declined' END);
	END IF;

	SELECT a.id INTO v_owner_actor FROM public.onto_actors AS a WHERE a.user_id = v_uid LIMIT 1;
	IF v_owner_actor IS NULL THEN
		RAISE EXCEPTION 'You have no projects to share' USING ERRCODE = '22023';
	END IF;

	-- -----------------------------------------------------------------------
	-- Upgrade: p_grants lists every item the owner saw, [{ project_id, need, allow }].
	-- It must match the request exactly; then the items with allow = true are given.
	-- -----------------------------------------------------------------------
	IF v_request.kind = 'upgrade' THEN
		SELECT a.id INTO v_requester_actor
		FROM public.onto_actors AS a WHERE a.user_id = v_request.from_user_id LIMIT 1;
		IF v_requester_actor IS NULL THEN
			RAISE EXCEPTION 'That account is no longer available' USING ERRCODE = '22023';
		END IF;

		IF jsonb_typeof(p_grants) IS DISTINCT FROM 'array'
			OR jsonb_array_length(p_grants) <> jsonb_array_length(v_request.requested_items)
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_request.requested_items) AS i
				WHERE (
					SELECT count(*)
					FROM jsonb_array_elements(p_grants) AS g
					WHERE jsonb_typeof(g) = 'object'
						AND lower(g->>'project_id') = lower(i->>'project_id')
						AND g->>'need' = i->>'need'
				) <> 1
			)
		THEN
			RAISE EXCEPTION 'This request changed after you opened it. Look again before you allow it.'
				USING ERRCODE = 'PT409';
		END IF;

		BEGIN
			SELECT array_agg((g->>'project_id')::uuid) INTO v_chosen
			FROM jsonb_array_elements(p_grants) AS g
			WHERE COALESCE((g->>'allow')::boolean, true);
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION 'Unknown project' USING ERRCODE = '22023';
		END;
		IF v_chosen IS NULL OR cardinality(v_chosen) = 0 THEN
			RAISE EXCEPTION 'Choose at least one project to allow' USING ERRCODE = '22023';
		END IF;

		FOR v_item IN SELECT value FROM jsonb_array_elements(v_request.requested_items)
		LOOP
			v_project_id := (v_item->>'project_id')::uuid;
			CONTINUE WHEN (v_project_id = ANY (v_chosen)) IS NOT TRUE;
			v_need := v_item->>'need';

			CONTINUE WHEN NOT EXISTS (
				SELECT 1 FROM public.onto_projects AS p
				WHERE p.id = v_project_id
					AND p.created_by = v_owner_actor
					AND p.deleted_at IS NULL
					AND p.archived_at IS NULL
			);

			SELECT * INTO v_member
			FROM public.onto_project_members AS m
			WHERE m.project_id = v_project_id
				AND m.actor_id = v_requester_actor
				AND m.removed_at IS NULL
				AND m.role_key <> 'owner'
			FOR UPDATE;
			CONTINUE WHEN NOT FOUND;

			IF v_need = 'edit' THEN
				v_role := 'editor';
				v_access := 'write';
				v_agent_access := 'write';
			ELSIF v_need = 'agents_write' THEN
				-- Agents never write where their person can't edit.
				CONTINUE WHEN v_member.access NOT IN ('write', 'admin');
				v_role := v_member.role_key;
				v_access := v_member.access;
				v_agent_access := 'write';
			ELSE
				v_role := v_member.role_key;
				v_access := v_member.access;
				v_agent_access := CASE WHEN v_member.agent_access = 'write' THEN 'write' ELSE 'read' END;
			END IF;

			UPDATE public.onto_project_members
			SET role_key = v_role, access = v_access, agent_access = v_agent_access
			WHERE id = v_member.id;

			PERFORM private.finish_project_join(v_project_id, v_request.from_user_id, 'approval', false, v_request.id);

			v_applied := v_applied || jsonb_build_array(jsonb_build_object(
				'project_id', v_project_id,
				'role', v_role,
				'agent_access', v_agent_access,
				'need', v_need,
				'status', 'already_member',
				-- The requester's connections that asked for this project; only they get it.
				'caller_ids', CASE
					WHEN jsonb_typeof(v_item->'caller_ids') = 'array' THEN v_item->'caller_ids'
					ELSE '[]'::jsonb
				END
			));
			v_project_names := v_project_names || (SELECT p.name FROM public.onto_projects AS p WHERE p.id = v_project_id);
		END LOOP;

		IF jsonb_array_length(v_applied) = 0 THEN
			RAISE EXCEPTION 'Nothing left to allow. They may have left the project, or it changed.' USING ERRCODE = '22023';
		END IF;

		UPDATE public.people_requests
		SET status = 'approved', decision = v_applied, decided_at = now()
		WHERE id = v_request.id;

		v_owner_name := public.people_layer_display_name(v_uid);
		v_action_url := CASE WHEN jsonb_array_length(v_applied) = 1
			THEN '/projects/' || (v_applied->0->>'project_id')
			ELSE '/profile?tab=people#requests' END;
		v_payload := jsonb_build_object(
			'title', v_owner_name || CASE v_applied->0->>'need'
				WHEN 'edit' THEN ' made you an editor and let your agents make changes in '
				WHEN 'agents_write' THEN ' let your agents make changes in '
				ELSE ' let your agents see '
			END || CASE
				WHEN array_length(v_project_names, 1) = 1 THEN v_project_names[1]
				ELSE array_length(v_project_names, 1)::text || ' projects'
			END,
			'body', 'Your agent can pick up where it left off.',
			'action_url', v_action_url,
			'event_type', 'people.request.approved',
			'request_id', v_request.id
		);
		INSERT INTO public.notification_events (event_type, event_source, target_user_id, payload, metadata)
		VALUES ('people.request.approved', 'api_action', v_request.from_user_id, v_payload,
			jsonb_build_object('request_id', v_request.id, 'kind', 'upgrade'))
		RETURNING id INTO v_event_id;
		INSERT INTO public.notification_deliveries (
			event_id, recipient_user_id, channel, payload, status, attempts, max_attempts, sent_at, delivered_at
		)
		VALUES (v_event_id, v_request.from_user_id, 'in_app', v_payload, 'delivered', 1, 1, now(), now())
		RETURNING id INTO v_delivery_id;
		INSERT INTO public.user_notifications (
			event_id, delivery_id, user_id, type, title, message, priority, action_url, event_type, data
		)
		VALUES (
			v_event_id, v_delivery_id, v_request.from_user_id, 'info', v_payload->>'title', v_payload->>'body',
			'normal', v_action_url, 'people.request.approved',
			jsonb_build_object('request_id', v_request.id, 'kind', 'upgrade')
		);

		-- No via_caller_id here: connections are per project (projects[].caller_ids).
		RETURN jsonb_build_object(
			'status', 'approved',
			'kind', 'upgrade',
			'projects', v_applied,
			'requester_user_id', v_request.from_user_id
		);
	END IF;

	-- -----------------------------------------------------------------------
	-- Access and rejoin: the owner picks projects, roles and agent settings.
	-- -----------------------------------------------------------------------
	IF jsonb_typeof(p_grants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_grants) = 0 THEN
		RAISE EXCEPTION 'Choose at least one project to share' USING ERRCODE = '22023';
	END IF;
	IF jsonb_array_length(p_grants) > 50 THEN
		RAISE EXCEPTION 'Share at most 50 projects at a time' USING ERRCODE = '22023';
	END IF;

	SELECT u.id, u.name, u.email INTO v_requester
	FROM public.users AS u
	WHERE u.id = v_request.from_user_id AND u.deletion_status IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'That account is no longer available' USING ERRCODE = '22023';
	END IF;

	SELECT a.id INTO v_requester_actor FROM public.onto_actors AS a WHERE a.user_id = v_requester.id LIMIT 1;
	IF v_requester_actor IS NULL THEN
		INSERT INTO public.onto_actors (kind, name, email, user_id)
		VALUES (
			'human',
			COALESCE(NULLIF(btrim(v_requester.name), ''), NULLIF(btrim(v_requester.email), ''), 'BuildOS User'),
			v_requester.email,
			v_requester.id
		)
		ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING
		RETURNING id INTO v_requester_actor;
		IF v_requester_actor IS NULL THEN
			SELECT a.id INTO v_requester_actor FROM public.onto_actors AS a WHERE a.user_id = v_requester.id LIMIT 1;
		END IF;
	END IF;

	FOR v_grant IN SELECT value FROM jsonb_array_elements(p_grants)
	LOOP
		BEGIN
			v_project_id := (v_grant->>'project_id')::uuid;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION 'Unknown project' USING ERRCODE = '22023';
		END;
		v_role := COALESCE(v_grant->>'role', 'viewer');
		v_agent_access := COALESCE(v_grant->>'agent_access', 'read');
		IF v_role NOT IN ('viewer', 'editor') THEN
			RAISE EXCEPTION 'Role must be viewer or editor' USING ERRCODE = '22023';
		END IF;
		IF v_agent_access NOT IN ('off', 'read', 'write') THEN
			RAISE EXCEPTION 'Agent access must be off, read, or write' USING ERRCODE = '22023';
		END IF;
		IF v_agent_access = 'write' AND v_role <> 'editor' THEN
			RAISE EXCEPTION 'Agents can only write where their person can edit' USING ERRCODE = '22023';
		END IF;
		v_access := CASE WHEN v_role = 'editor' THEN 'write' ELSE 'read' END;

		-- Sharing stays owner-only.
		IF NOT EXISTS (
			SELECT 1 FROM public.onto_projects AS p
			WHERE p.id = v_project_id
				AND p.created_by = v_owner_actor
				AND p.deleted_at IS NULL
				AND p.archived_at IS NULL
		) THEN
			RAISE EXCEPTION 'You can only share projects you own' USING ERRCODE = '42501';
		END IF;

		IF v_request.kind = 'rejoin' AND (v_project_id IS DISTINCT FROM v_request.project_id
			OR jsonb_array_length(p_grants) <> 1) THEN
			RAISE EXCEPTION 'A rejoin approval must name only the requested project' USING ERRCODE = '22023';
		END IF;
		SELECT * INTO v_member FROM public.onto_project_members m
		WHERE m.project_id = v_project_id AND m.actor_id = v_requester_actor FOR UPDATE;
		v_join_status := CASE WHEN NOT FOUND THEN 'joined'
			WHEN v_member.removed_at IS NOT NULL THEN 'rejoined' ELSE 'already_member' END;

		UPDATE public.onto_project_members AS m
		SET role_key = v_role,
			access = v_access,
			agent_access = v_agent_access,
			removed_at = NULL,
			removed_by_actor_id = NULL
		WHERE m.project_id = v_project_id AND m.actor_id = v_requester_actor;
		IF NOT FOUND THEN
			INSERT INTO public.onto_project_members (
				project_id, actor_id, role_key, access, agent_access, added_by_actor_id
			)
			VALUES (v_project_id, v_requester_actor, v_role, v_access, v_agent_access, v_owner_actor);
		END IF;
		PERFORM private.finish_project_join(v_project_id, v_request.from_user_id, 'approval',
			v_join_status <> 'already_member', v_request.id);

		v_applied := v_applied || jsonb_build_array(jsonb_build_object(
			'project_id', v_project_id,
			'role', v_role,
			'agent_access', v_agent_access,
			'status', v_join_status
		));
		v_project_names := v_project_names || (SELECT p.name FROM public.onto_projects AS p WHERE p.id = v_project_id);
	END LOOP;

	UPDATE public.people_requests
	SET status = 'approved', decision = v_applied, decided_at = now()
	WHERE id = v_request.id;

	SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || u.username, 'Someone')
	INTO v_owner_name
	FROM public.users AS u WHERE u.id = v_uid;

	v_action_url := CASE WHEN jsonb_array_length(v_applied) = 1
		THEN '/projects/' || (v_applied->0->>'project_id') ||
			CASE WHEN v_applied->0->>'status' = 'already_member' THEN '' ELSE '?joined=1' END
		ELSE '/profile?tab=people#requests' END;
	v_payload := jsonb_build_object(
		'title', COALESCE(v_owner_name, 'Someone') || ' shared ' || CASE
			WHEN array_length(v_project_names, 1) = 1 THEN v_project_names[1]
			ELSE array_length(v_project_names, 1)::text || ' projects'
		END || ' with you',
		'body', 'Open it in BuildOS.',
		'action_url', v_action_url,
		'event_type', 'people.request.approved',
		'request_id', v_request.id
	);
	INSERT INTO public.notification_events (event_type, event_source, target_user_id, payload, metadata)
	VALUES ('people.request.approved', 'api_action', v_request.from_user_id, v_payload,
		jsonb_build_object('request_id', v_request.id))
	RETURNING id INTO v_event_id;
	INSERT INTO public.notification_deliveries (
		event_id, recipient_user_id, channel, payload, status, attempts, max_attempts, sent_at, delivered_at
	)
	VALUES (v_event_id, v_request.from_user_id, 'in_app', v_payload, 'delivered', 1, 1, now(), now())
	RETURNING id INTO v_delivery_id;
	INSERT INTO public.user_notifications (
		event_id, delivery_id, user_id, type, title, message, priority, action_url, event_type, data
	)
	VALUES (
		v_event_id, v_delivery_id, v_request.from_user_id, 'info', v_payload->>'title', v_payload->>'body',
		'normal', v_action_url, 'people.request.approved', jsonb_build_object('request_id', v_request.id)
	);

	RETURN jsonb_build_object(
		'status', 'approved',
		'kind', v_request.kind,
		'projects', v_applied,
		'requester_user_id', v_request.from_user_id,
		'via_caller_id', v_request.via_caller_id,
		'via_oauth_grant_id', v_request.via_oauth_grant_id
	);
END;
$$;

-- Outgoing requests provide an authorized project choice, including settled requests.
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
			-- Upgrade: each project with what was asked and where the person stands now.
			'items', CASE WHEN r.kind = 'upgrade' THEN (
				SELECT COALESCE(jsonb_agg(jsonb_build_object(
					'project_id', ip.id,
					'project_name', ip.name,
					'need', item->>'need',
					'role', im.role_key,
					'agent_access', im.agent_access,
					'editor_agents_write', COALESCE(s.editor_agents_write, false)
				) ORDER BY ord), '[]'::jsonb)
				FROM jsonb_array_elements(r.requested_items) WITH ORDINALITY AS t(item, ord)
				JOIN public.onto_projects AS ip ON ip.id = (item->>'project_id')::uuid
				LEFT JOIN public.onto_actors AS ia ON ia.user_id = r.from_user_id
				LEFT JOIN public.onto_project_members AS im
					ON im.project_id = ip.id AND im.actor_id = ia.id AND im.removed_at IS NULL
				LEFT JOIN public.project_agent_settings AS s ON s.project_id = ip.id
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
			'settled_elsewhere', r.settled_elsewhere,
			'projects', (
				SELECT COALESCE(jsonb_agg(jsonb_build_object(
					'project_id', dp.id, 'project_name', dp.name, 'role', dm.role_key,
					'agent_access', dm.agent_access, 'status', d->>'status') ORDER BY ord), '[]'::jsonb)
				FROM jsonb_array_elements(COALESCE(r.decision, '[]'::jsonb)) WITH ORDINALITY t(d, ord)
				JOIN public.onto_projects dp ON dp.id = (d->>'project_id')::uuid
				JOIN public.onto_actors da ON da.user_id = v_viewer
				JOIN public.onto_project_members dm ON dm.project_id = dp.id AND dm.actor_id = da.id
				WHERE dm.removed_at IS NULL AND dp.deleted_at IS NULL AND dp.archived_at IS NULL
			),
			'kind', r.kind,
			-- A block reads as pending to the person who was blocked.
			'status', CASE
				WHEN r.status = 'blocked' THEN 'pending'
				WHEN r.status = 'pending' AND r.expires_at <= now() THEN 'expired'
				ELSE r.status
			END,
			'role_requested', r.role_requested,
			'project_hint', r.project_hint,
			'items', CASE WHEN r.kind = 'upgrade' THEN (
				SELECT COALESCE(jsonb_agg(jsonb_build_object(
					'project_id', item->>'project_id',
					'need', item->>'need'
				) ORDER BY ord), '[]'::jsonb)
				FROM jsonb_array_elements(r.requested_items) WITH ORDINALITY AS t(item, ord)
			) END,
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

DROP FUNCTION public.list_pending_project_invites();
CREATE OR REPLACE FUNCTION public.list_pending_project_invites()
RETURNS TABLE (
	invite_id uuid,
	project_id uuid,
	project_name text,
	role_key text,
	access text,
	agent_access text,
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
		i.agent_access,
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
		AND p.deleted_at IS NULL AND p.archived_at IS NULL
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

DROP FUNCTION public.get_project_invite_preview(text);
CREATE OR REPLACE FUNCTION public.get_project_invite_preview(p_token_hash text)
RETURNS TABLE (
	invite_id uuid,
	project_id uuid,
	project_name text,
	role_key text,
	access text,
	agent_access text,
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
			AND p.deleted_at IS NULL AND p.archived_at IS NULL
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
		i.agent_access,
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
		AND p.deleted_at IS NULL AND p.archived_at IS NULL
	LEFT JOIN public.onto_actors a ON a.id = i.invited_by_actor_id
	LEFT JOIN public.users u ON u.id = a.user_id
	WHERE i.id = v_invite.id;
END;
$$;

-- The activity producer follows the same global opt-out policy as joining.
CREATE OR REPLACE FUNCTION public.queue_project_activity_notification_batch(
	p_project_id uuid,
	p_actor_user_id uuid DEFAULT NULL,
	p_actor_actor_id uuid DEFAULT NULL,
	p_entity_type text DEFAULT NULL,
	p_action text DEFAULT NULL,
	p_occurred_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_props jsonb;
	v_notifications jsonb;
	v_shared jsonb;
	v_overrides jsonb;
	v_owner_actor_id uuid;
	v_member_count integer := 0;
	v_is_shared boolean := false;
	v_default_enabled boolean := false;
	v_window_start timestamptz;
	v_window_end timestamptz;
	v_action_key text;
	v_batch_id uuid;
	v_actor_user_id uuid := p_actor_user_id;
	v_member_enabled boolean;
	v_job_id uuid;
	rec record;
BEGIN
	IF p_project_id IS NULL THEN
		RETURN;
	END IF;

	IF v_actor_user_id IS NULL AND p_actor_actor_id IS NOT NULL THEN
		SELECT user_id
		INTO v_actor_user_id
		FROM onto_actors
		WHERE id = p_actor_actor_id;
	END IF;

	SELECT props, created_by
	INTO v_props, v_owner_actor_id
	FROM onto_projects
	WHERE id = p_project_id
		AND deleted_at IS NULL;

	IF NOT FOUND THEN
		RETURN;
	END IF;

	SELECT COUNT(DISTINCT m.actor_id)
	INTO v_member_count
	FROM onto_project_members m
	WHERE m.project_id = p_project_id
		AND m.removed_at IS NULL;

	IF v_owner_actor_id IS NOT NULL AND NOT EXISTS (
		SELECT 1
		FROM onto_project_members m
		WHERE m.project_id = p_project_id
			AND m.actor_id = v_owner_actor_id
			AND m.removed_at IS NULL
	) THEN
		v_member_count := v_member_count + 1;
	END IF;

	v_is_shared := v_member_count > 1;
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

	v_default_enabled := CASE
		WHEN jsonb_typeof(v_shared->'enabled_by_default') = 'boolean'
			THEN (v_shared->>'enabled_by_default')::boolean
		ELSE v_is_shared
	END;

	v_window_start := to_timestamp(
		floor(extract(epoch from COALESCE(p_occurred_at, NOW())) / 300) * 300
	);
	v_window_end := v_window_start + INTERVAL '5 minutes';
	v_action_key := format(
		'%s.%s',
		COALESCE(NULLIF(lower(trim(p_entity_type)), ''), 'project'),
		COALESCE(NULLIF(lower(trim(p_action)), ''), 'updated')
	);

	FOR rec IN
		WITH actor_set AS (
			SELECT m.actor_id
			FROM onto_project_members m
			WHERE m.project_id = p_project_id
				AND m.removed_at IS NULL
			UNION
			SELECT v_owner_actor_id
		)
		SELECT DISTINCT
			a.id AS actor_id,
			a.user_id
		FROM actor_set s
		JOIN onto_actors a ON a.id = s.actor_id
		WHERE s.actor_id IS NOT NULL
			AND a.user_id IS NOT NULL
			AND (p_actor_actor_id IS NULL OR a.id <> p_actor_actor_id)
			AND (v_actor_user_id IS NULL OR a.user_id <> v_actor_user_id)
	LOOP
		v_member_enabled := CASE
			WHEN v_overrides ? rec.actor_id::text
				THEN COALESCE((v_overrides->>rec.actor_id::text)::boolean, v_default_enabled)
			ELSE v_default_enabled
		END;

		IF v_member_enabled IS NOT TRUE THEN
			CONTINUE;
		END IF;

		-- Seed missing preferences only; activity must never reactivate an opt-out.
		INSERT INTO notification_subscriptions (
			user_id,
			event_type,
			is_active,
			admin_only,
			created_by,
			updated_at
		)
		VALUES (
			rec.user_id,
			'project.activity.batched',
			true,
			false,
			COALESCE(v_actor_user_id, rec.user_id),
			NOW()
		)
		ON CONFLICT (user_id, event_type) DO NOTHING;
		-- An existing inactive subscription is a deliberate global opt-out.
		IF NOT EXISTS (SELECT 1 FROM notification_subscriptions s
			WHERE s.user_id = rec.user_id AND s.event_type = 'project.activity.batched' AND s.is_active) THEN
			CONTINUE;
		END IF;

		INSERT INTO project_notification_batches (
			project_id,
			recipient_user_id,
			window_start,
			window_end,
			flush_after,
			status,
			event_count,
			action_counts,
			actor_counts,
			latest_event_at,
			created_at,
			updated_at
		)
		VALUES (
			p_project_id,
			rec.user_id,
			v_window_start,
			v_window_end,
			v_window_end,
			'pending',
			1,
			jsonb_build_object(v_action_key, 1),
			CASE
				WHEN v_actor_user_id IS NOT NULL THEN jsonb_build_object(v_actor_user_id::text, 1)
				ELSE '{}'::jsonb
			END,
			COALESCE(p_occurred_at, NOW()),
			NOW(),
			NOW()
		)
		ON CONFLICT (recipient_user_id, project_id, window_start)
		DO UPDATE SET
			event_count = project_notification_batches.event_count + 1,
			action_counts = jsonb_increment_counter(
				project_notification_batches.action_counts,
				v_action_key,
				1
			),
			actor_counts = CASE
				WHEN v_actor_user_id IS NULL THEN project_notification_batches.actor_counts
				ELSE jsonb_increment_counter(
					project_notification_batches.actor_counts,
					v_actor_user_id::text,
					1
				)
			END,
			latest_event_at = GREATEST(
				COALESCE(project_notification_batches.latest_event_at, EXCLUDED.latest_event_at),
				EXCLUDED.latest_event_at
			),
			flush_after = GREATEST(
				COALESCE(project_notification_batches.flush_after, EXCLUDED.flush_after),
				EXCLUDED.flush_after
			),
			status = CASE
				WHEN project_notification_batches.status IN ('flushed', 'failed') THEN 'pending'
				ELSE project_notification_batches.status
			END,
			last_error = NULL,
			updated_at = NOW()
		RETURNING id INTO v_batch_id;

		v_job_id := add_queue_job(
			p_user_id => rec.user_id,
			p_job_type => 'project_activity_batch_flush',
			p_metadata => jsonb_build_object(
				'batch_id', v_batch_id,
				'recipient_user_id', rec.user_id,
				'project_id', p_project_id
			),
			p_priority => 8,
			p_scheduled_for => v_window_end,
			p_dedup_key => format('project_activity_batch_flush:%s', v_batch_id)
		);
	END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_project_invite_link(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_project_invite_link(text) TO authenticated;
REVOKE ALL ON FUNCTION public.decide_people_request(uuid, text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.decide_people_request(uuid, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.list_people_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_people_requests(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_pending_project_invites() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_project_invites() TO authenticated;
REVOKE ALL ON FUNCTION public.get_project_invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_invite_preview(text) TO anon, authenticated, service_role;
COMMIT;
