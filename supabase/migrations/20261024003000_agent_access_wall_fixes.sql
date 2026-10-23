-- supabase/migrations/20261024003000_agent_access_wall_fixes.sql
--
-- Review fixes for upgrade requests (tasker/140-agent-access-wall.md):
--
-- * The owner approves exactly what they saw. A waiting request can grow after the owner
--   opens it (a second ask merges in, and the stronger need wins), so an approval now
--   carries every item the owner saw ([{ project_id, need, allow }]). If the request
--   changed since, the approval is refused (SQLSTATE PT409) and the owner reloads.
--   Before, "Allow" sent project ids only and granted whatever the row held by then,
--   so "let their agents read" could become "make them an editor".
-- * Each requested project remembers which of the requester's connections asked for it
--   (requested_items[].caller_ids). Asks from two connections merge into one card, and
--   approval connects each project only to the connections that asked for it. Before,
--   the request kept the first connection only, and approval gave it every project.
-- * The person can name the connection that needs the project when asking from the
--   web (p_for_caller_id), so approval also connects it instead of leaving the agent
--   behind a second grant step.
--
-- No upgrade request exists in production yet, so there is nothing to backfill.

BEGIN;
SET LOCAL lock_timeout = '3s';

COMMENT ON COLUMN public.people_requests.requested_items IS
	'kind = upgrade only: [{ project_id, need, caller_ids }] with need agents_read, agents_write, or edit, and caller_ids the requester''s connections that asked for that project (approval connects only those). project_id holds the first one.';

-- ---------------------------------------------------------------------------
-- 1. A member asks the owner for more (web or agent)
-- ---------------------------------------------------------------------------
-- The signature gains p_for_caller_id. Drop the old one so named calls stay unambiguous.
DROP FUNCTION IF EXISTS public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid);

-- Statuses:
--   pending           sent (request_id); already_pending + merged when it joined a waiting one
--   pending           with no request_id: the owner blocked this person (silent)
--   already_allowed   every project already allows what was asked
--   waiting_other     a different kind of request to this owner is waiting
--   declined_recently the owner said not now to these projects in the last 7 days
--   rate_limited      too_many_pending | agent_daily_limit | too_many_projects
--   not_found         a project isn't one this person is a member of (or it's theirs)
--   mixed_owners      the projects belong to different owners
CREATE FUNCTION public.create_project_upgrade_request(
	p_project_ids uuid[],
	p_need text,
	p_note text DEFAULT NULL,
	p_caller_id uuid DEFAULT NULL,
	p_oauth_grant_id uuid DEFAULT NULL,
	p_agent_label text DEFAULT NULL,
	p_user_id uuid DEFAULT NULL,
	p_for_caller_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_role text := public.people_layer_jwt_role();
	v_viewer uuid := public.people_layer_viewer(p_user_id);
	v_via text := CASE WHEN p_caller_id IS NULL THEN 'web' ELSE 'agent' END;
	v_label text := NULLIF(left(btrim(COALESCE(p_agent_label, '')), 80), '');
	v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
	v_for_caller uuid;
	v_callers jsonb;
	v_viewer_actor uuid;
	v_owner_actor uuid;
	v_owner_user uuid;
	v_project_owner_actor uuid;
	v_project_id uuid;
	v_member public.onto_project_members%ROWTYPE;
	v_effective text;
	v_need text;
	v_items jsonb := '[]'::jsonb;
	v_cooling uuid[] := ARRAY[]::uuid[];
	v_request public.people_requests%ROWTYPE;
	v_merged jsonb;
	v_new jsonb;
	v_old jsonb;
	v_index integer;
	v_first_name text;
	v_requester_name text;
	v_title text;
	v_payload jsonb;
	v_event_id uuid;
	v_delivery_id uuid;
BEGIN
	IF p_need NOT IN ('agents_read', 'agents_write', 'edit') THEN
		RAISE EXCEPTION 'need must be agents_read, agents_write, or edit' USING ERRCODE = '22023';
	END IF;
	IF p_project_ids IS NULL OR cardinality(p_project_ids) = 0 THEN
		RAISE EXCEPTION 'Name at least one project' USING ERRCODE = '22023';
	END IF;
	IF cardinality(p_project_ids) > 10 THEN
		RAISE EXCEPTION 'Ask for at most 10 projects at a time' USING ERRCODE = '22023';
	END IF;

	-- Only the server may say a request came from an agent, and only for a
	-- connection that belongs to the requester. An agent asks for itself.
	IF v_via = 'agent' THEN
		IF v_role IS DISTINCT FROM 'service_role' THEN
			RAISE EXCEPTION 'Agent requests come from the agent gateway' USING ERRCODE = '42501';
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM public.external_agent_callers AS c
			WHERE c.id = p_caller_id AND c.user_id = v_viewer AND c.status = 'trusted'
		) THEN
			RAISE EXCEPTION 'Unknown agent connection' USING ERRCODE = '42501';
		END IF;
		IF p_oauth_grant_id IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM public.agent_oauth_grants AS g
			WHERE g.id = p_oauth_grant_id
				AND g.user_id = v_viewer
				AND g.external_agent_caller_id = p_caller_id
				AND g.status = 'active'
		) THEN
			RAISE EXCEPTION 'Unknown agent authorization' USING ERRCODE = '42501';
		END IF;
		IF p_for_caller_id IS NOT NULL AND p_for_caller_id <> p_caller_id THEN
			RAISE EXCEPTION 'An agent asks only for its own connection' USING ERRCODE = '42501';
		END IF;
		v_for_caller := p_caller_id;
	ELSE
		IF p_oauth_grant_id IS NOT NULL OR v_label IS NOT NULL THEN
			RAISE EXCEPTION 'Agent details need an agent connection' USING ERRCODE = '22023';
		END IF;
		-- On the web the person may name one of their own connections to receive the project.
		IF p_for_caller_id IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM public.external_agent_callers AS c
			WHERE c.id = p_for_caller_id AND c.user_id = v_viewer AND c.status = 'trusted'
		) THEN
			RAISE EXCEPTION 'Unknown agent connection' USING ERRCODE = '42501';
		END IF;
		v_for_caller := p_for_caller_id;
	END IF;
	v_callers := CASE WHEN v_for_caller IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_for_caller) END;

	SELECT a.id INTO v_viewer_actor FROM public.onto_actors AS a WHERE a.user_id = v_viewer LIMIT 1;
	IF v_viewer_actor IS NULL THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	FOR v_project_id IN SELECT DISTINCT unnest(p_project_ids)
	LOOP
		SELECT p.created_by INTO v_project_owner_actor
		FROM public.onto_projects AS p
		WHERE p.id = v_project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL;
		IF NOT FOUND OR v_project_owner_actor = v_viewer_actor THEN
			RETURN jsonb_build_object('status', 'not_found', 'project_id', v_project_id);
		END IF;

		SELECT * INTO v_member
		FROM public.onto_project_members AS m
		WHERE m.project_id = v_project_id
			AND m.actor_id = v_viewer_actor
			AND m.removed_at IS NULL
			AND m.role_key <> 'owner';
		IF NOT FOUND THEN
			RETURN jsonb_build_object('status', 'not_found', 'project_id', v_project_id);
		END IF;

		IF v_owner_actor IS NULL THEN
			v_owner_actor := v_project_owner_actor;
		ELSIF v_owner_actor <> v_project_owner_actor THEN
			RETURN jsonb_build_object('status', 'mixed_owners');
		END IF;

		-- Ask only for what's missing; a viewer who wants their agents to write needs
		-- to be an editor first.
		v_effective := public.people_layer_effective_agent_access(v_project_id, v_viewer_actor);
		IF p_need = 'agents_read' THEN
			CONTINUE WHEN v_effective IN ('read', 'write');
			v_need := 'agents_read';
		ELSIF v_member.access NOT IN ('write', 'admin') THEN
			v_need := 'edit';
		ELSE
			CONTINUE WHEN v_effective = 'write';
			v_need := 'agents_write';
		END IF;

		v_items := v_items || jsonb_build_array(jsonb_build_object(
			'project_id', v_project_id,
			'need', v_need,
			'caller_ids', v_callers
		));
	END LOOP;

	IF jsonb_array_length(v_items) = 0 THEN
		RETURN jsonb_build_object('status', 'already_allowed');
	END IF;

	SELECT a.user_id INTO v_owner_user FROM public.onto_actors AS a WHERE a.id = v_owner_actor;
	IF v_owner_user IS NULL OR v_owner_user = v_viewer OR NOT EXISTS (
		SELECT 1 FROM public.users AS u WHERE u.id = v_owner_user AND u.deletion_status IS NULL
	) THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	-- Expired requests still hold the one-pending-per-pair slot; free it.
	UPDATE public.people_requests AS r
	SET status = 'canceled', decided_at = now()
	WHERE r.from_user_id = v_viewer
		AND r.to_user_id = v_owner_user
		AND r.status = 'pending'
		AND r.expires_at <= now();

	-- A block is silent: the requester sees an ordinary pending answer.
	IF EXISTS (
		SELECT 1 FROM public.people_requests AS r
		WHERE r.from_user_id = v_viewer AND r.to_user_id = v_owner_user AND r.status = 'blocked'
	) THEN
		RETURN jsonb_build_object('status', 'pending');
	END IF;

	-- "Not now" on a project holds for 7 days.
	SELECT COALESCE(array_agg(DISTINCT (item->>'project_id')::uuid), ARRAY[]::uuid[])
	INTO v_cooling
	FROM public.people_requests AS r
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE WHEN r.kind = 'upgrade' THEN r.requested_items ELSE '[]'::jsonb END
	) AS item
	WHERE r.kind = 'upgrade'
		AND r.from_user_id = v_viewer
		AND r.to_user_id = v_owner_user
		AND r.status = 'declined'
		AND r.decided_at > now() - interval '7 days';
	IF cardinality(v_cooling) > 0 THEN
		SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items
		FROM jsonb_array_elements(v_items) AS item
		WHERE NOT ((item->>'project_id')::uuid = ANY (v_cooling));
		IF jsonb_array_length(v_items) = 0 THEN
			RETURN jsonb_build_object('status', 'declined_recently');
		END IF;
	END IF;

	SELECT * INTO v_request
	FROM public.people_requests AS r
	WHERE r.from_user_id = v_viewer AND r.to_user_id = v_owner_user AND r.status = 'pending'
	FOR UPDATE;
	IF FOUND THEN
		IF v_request.kind <> 'upgrade' THEN
			RETURN jsonb_build_object(
				'status', 'waiting_other',
				'request_id', v_request.id,
				'kind', v_request.kind
			);
		END IF;

		-- Merge: one card for the owner. Per project the stronger need wins and the
		-- connections that asked add up.
		v_merged := v_request.requested_items;
		FOR v_new IN SELECT value FROM jsonb_array_elements(v_items)
		LOOP
			v_index := NULL;
			SELECT (t.ord - 1)::integer INTO v_index
			FROM jsonb_array_elements(v_merged) WITH ORDINALITY AS t(e, ord)
			WHERE t.e->>'project_id' = v_new->>'project_id';

			IF v_index IS NULL THEN
				v_merged := v_merged || jsonb_build_array(v_new);
			ELSE
				v_old := v_merged->v_index;
				v_merged := jsonb_set(v_merged, ARRAY[v_index::text], jsonb_build_object(
					'project_id', v_old->>'project_id',
					'need', CASE GREATEST(
							CASE v_old->>'need' WHEN 'edit' THEN 3 WHEN 'agents_write' THEN 2 ELSE 1 END,
							CASE v_new->>'need' WHEN 'edit' THEN 3 WHEN 'agents_write' THEN 2 ELSE 1 END
						)
						WHEN 3 THEN 'edit' WHEN 2 THEN 'agents_write' ELSE 'agents_read' END,
					'caller_ids', (
						SELECT COALESCE(jsonb_agg(DISTINCT c.value), '[]'::jsonb)
						FROM jsonb_array_elements(
							CASE WHEN jsonb_typeof(v_old->'caller_ids') = 'array' THEN v_old->'caller_ids' ELSE '[]'::jsonb END
							|| (v_new->'caller_ids')
						) AS c
					)
				));
			END IF;
		END LOOP;

		IF jsonb_array_length(v_merged) > 10 THEN
			RETURN jsonb_build_object('status', 'rate_limited', 'reason', 'too_many_projects');
		END IF;

		UPDATE public.people_requests
		SET requested_items = v_merged,
			role_requested = CASE
				WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_merged) AS e WHERE e->>'need' = 'edit')
					THEN 'editor' ELSE role_requested END,
			agent_access_requested = CASE
				WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_merged) AS e WHERE e->>'need' <> 'agents_read')
					THEN 'write' ELSE 'read' END,
			note = COALESCE(note, v_note)
		WHERE id = v_request.id;

		RETURN jsonb_build_object(
			'status', 'pending',
			'already_pending', true,
			'merged', v_merged IS DISTINCT FROM v_request.requested_items,
			'request_id', v_request.id,
			'expires_at', v_request.expires_at
		);
	END IF;

	IF (
		SELECT count(*) FROM public.people_requests AS r
		WHERE r.from_user_id = v_viewer AND r.status = 'pending' AND r.expires_at > now()
	) >= 10 THEN
		RETURN jsonb_build_object('status', 'rate_limited', 'reason', 'too_many_pending');
	END IF;
	IF v_via = 'agent' AND (
		SELECT count(*) FROM public.people_requests AS r
		WHERE r.via_caller_id = p_caller_id AND r.created_at > now() - interval '24 hours'
	) >= 5 THEN
		RETURN jsonb_build_object('status', 'rate_limited', 'reason', 'agent_daily_limit');
	END IF;

	INSERT INTO public.people_requests (
		from_user_id, to_user_id, kind, project_id, requested_items, project_hint,
		role_requested, agent_access_requested, note,
		via, via_caller_id, via_oauth_grant_id, via_agent_label
	)
	SELECT
		v_viewer,
		v_owner_user,
		'upgrade',
		(v_items->0->>'project_id')::uuid,
		v_items,
		left(p.name, 120),
		CASE
			WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) AS e WHERE e->>'need' = 'edit')
				OR m.role_key = 'editor' THEN 'editor'
			ELSE 'viewer'
		END,
		CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) AS e WHERE e->>'need' <> 'agents_read')
			THEN 'write' ELSE 'read' END,
		v_note,
		v_via,
		p_caller_id,
		p_oauth_grant_id,
		CASE WHEN v_via = 'agent' THEN COALESCE(v_label, 'their agent') END
	FROM public.onto_projects AS p
	JOIN public.onto_project_members AS m
		ON m.project_id = p.id AND m.actor_id = v_viewer_actor AND m.removed_at IS NULL
	WHERE p.id = (v_items->0->>'project_id')::uuid
	RETURNING * INTO v_request;
	IF v_request.id IS NULL THEN
		-- They left the project between the checks above and the insert.
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	v_requester_name := public.people_layer_display_name(v_viewer);
	SELECT p.name INTO v_first_name FROM public.onto_projects AS p WHERE p.id = v_request.project_id;
	v_title := v_requester_name || CASE v_items->0->>'need'
		WHEN 'edit' THEN ' wants to edit '
		WHEN 'agents_write' THEN ' wants their agents to make changes in '
		ELSE ' wants their agents to see '
	END || CASE
		WHEN jsonb_array_length(v_items) = 1 THEN COALESCE(v_first_name, 'your project')
		ELSE jsonb_array_length(v_items)::text || ' of your projects'
	END;

	v_payload := jsonb_build_object(
		'title', v_title,
		'body', CASE
			WHEN v_via = 'agent' THEN 'Sent by ' || v_request.via_agent_label || '. Allow it or say not now in BuildOS.'
			ELSE 'Allow it or say not now in BuildOS.'
		END,
		'action_url', '/people',
		'event_type', 'people.request.received',
		'request_id', v_request.id,
		'project_id', v_request.project_id
	);
	INSERT INTO public.notification_events (event_type, event_source, target_user_id, payload, metadata)
	VALUES ('people.request.received', 'api_action', v_owner_user, v_payload,
		jsonb_build_object('request_id', v_request.id, 'kind', 'upgrade'))
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
		jsonb_build_object('request_id', v_request.id, 'kind', 'upgrade'), v_request.expires_at
	);

	RETURN jsonb_build_object(
		'status', 'pending',
		'request_id', v_request.id,
		'expires_at', v_request.expires_at
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The owner decides. Upgrade approvals must match what the owner saw.
--    Access and rejoin are unchanged.
-- ---------------------------------------------------------------------------
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
BEGIN
	IF public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' OR v_uid IS NULL THEN
		RAISE EXCEPTION 'Decide requests from your signed-in BuildOS session' USING ERRCODE = '42501';
	END IF;
	IF p_decision NOT IN ('approve', 'decline', 'block') THEN
		RAISE EXCEPTION 'Decision must be approve, decline, or block' USING ERRCODE = '22023';
	END IF;

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

			v_applied := v_applied || jsonb_build_array(jsonb_build_object(
				'project_id', v_project_id,
				'role', v_role,
				'agent_access', v_agent_access,
				'need', v_need,
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
			'action_url', '/people',
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
			'normal', '/people', 'people.request.approved',
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

		v_applied := v_applied || jsonb_build_array(jsonb_build_object(
			'project_id', v_project_id,
			'role', v_role,
			'agent_access', v_agent_access
		));
		v_project_names := v_project_names || (SELECT p.name FROM public.onto_projects AS p WHERE p.id = v_project_id);
	END LOOP;

	UPDATE public.people_requests
	SET status = 'approved', decision = v_applied, decided_at = now()
	WHERE id = v_request.id;

	SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || u.username, 'Someone')
	INTO v_owner_name
	FROM public.users AS u WHERE u.id = v_uid;

	v_payload := jsonb_build_object(
		'title', COALESCE(v_owner_name, 'Someone') || ' shared ' || CASE
			WHEN array_length(v_project_names, 1) = 1 THEN v_project_names[1]
			ELSE array_length(v_project_names, 1)::text || ' projects'
		END || ' with you',
		'body', 'Open it in BuildOS.',
		'action_url', '/people',
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
		'normal', '/people', 'people.request.approved', jsonb_build_object('request_id', v_request.id)
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

-- ---------------------------------------------------------------------------
-- 3. Grants (functions are server-only by default)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_people_request(uuid, text, jsonb) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_people_request(uuid, text, jsonb) TO authenticated;

COMMIT;
