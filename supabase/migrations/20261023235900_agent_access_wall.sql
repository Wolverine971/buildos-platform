-- supabase/migrations/20261023235900_agent_access_wall.sql
--
-- When an agent hits a wall in someone else's project, it gets through in one step
-- (tasker/140-agent-access-wall.md).
--
-- * Upgrade requests: a member asks the project owner to let their agents read, let
--   their agents make changes, or make them an editor. They are people_requests rows
--   with kind = 'upgrade', the first project in project_id, and every asked-for
--   project in requested_items ([{ project_id, need }], 1 to 10, one owner). A second
--   ask while one is waiting merges into it, so the owner answers once.
-- * Standing approval: an owner can say "editors' agents can write in this project".
--   While it is on, every editor's agents can make changes unless the owner turned
--   that person's agents Off. It is a live rule (people_layer_effective_agent_access),
--   not a data change, so turning it off reverts at once. It lives in its own
--   owner-only table because editors can update onto_projects rows directly.
-- * external_agent_callers.include_shared_projects: the person lets one connection
--   into projects other people share with them, without granting each one. The
--   owner's per-person agent setting still applies.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Upgrade requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.people_requests
	ADD COLUMN IF NOT EXISTS requested_items jsonb NULL;

ALTER TABLE public.people_requests DROP CONSTRAINT IF EXISTS people_requests_kind_check;
ALTER TABLE public.people_requests
	ADD CONSTRAINT people_requests_kind_check CHECK (
		(kind = 'access' AND project_id IS NULL AND requested_items IS NULL)
		OR (kind = 'rejoin' AND project_id IS NOT NULL AND requested_items IS NULL)
		OR (
			kind = 'upgrade'
			AND project_id IS NOT NULL
			AND requested_items IS NOT NULL
			AND COALESCE(jsonb_typeof(requested_items) = 'array', false)
			AND COALESCE(jsonb_array_length(requested_items) BETWEEN 1 AND 10, false)
		)
	);

COMMENT ON COLUMN public.people_requests.kind IS
	'access = asked to see the owner''s projects; rejoin = a former member opened the project''s invite link; upgrade = a member asked for more in projects they are already in.';
COMMENT ON COLUMN public.people_requests.requested_items IS
	'kind = upgrade only: [{ project_id, need }] with need agents_read, agents_write, or edit. project_id holds the first one.';

-- ---------------------------------------------------------------------------
-- 2. Standing approval (owner-only setting)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_agent_settings (
	project_id uuid PRIMARY KEY REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	-- Every editor's agents can make changes, unless the owner turned that person's agents Off.
	editor_agents_write boolean NOT NULL DEFAULT false,
	updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_agent_settings_select_member ON public.project_agent_settings;
CREATE POLICY project_agent_settings_select_member
	ON public.project_agent_settings
	FOR SELECT
	TO authenticated
	USING (public.current_actor_has_project_member_access(project_id, 'read'));

REVOKE ALL ON TABLE public.project_agent_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_agent_settings TO authenticated;
GRANT ALL ON TABLE public.project_agent_settings TO service_role;

COMMENT ON TABLE public.project_agent_settings IS
	'Owner-only agent rules for a project. Changed only through set_project_editor_agents_write.';

DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'project_agent_settings', 'project_id', 'leave_behind',
				'An owner''s agent rule is a setting of the archived source; the destination keeps its own.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

-- ---------------------------------------------------------------------------
-- 3. Per-connection: let this agent into projects shared with me
-- ---------------------------------------------------------------------------
ALTER TABLE public.external_agent_callers
	ADD COLUMN IF NOT EXISTS include_shared_projects boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.external_agent_callers.include_shared_projects IS
	'The person lets this connection into projects other people share with them (owner''s agent setting still applies). Off by default.';

-- ---------------------------------------------------------------------------
-- 4. Helpers (server-only)
-- ---------------------------------------------------------------------------

-- What one member's agents may do in a project: off, read, or write. NULL when the
-- actor is not a current member. The owner's standing approval lifts an editor's
-- agents to write unless the owner turned them off.
CREATE OR REPLACE FUNCTION public.people_layer_effective_agent_access(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT CASE
		WHEN m.agent_access = 'off' THEN 'off'
		WHEN m.role_key <> 'owner'
			AND m.access IN ('write', 'admin')
			AND COALESCE(s.editor_agents_write, false) THEN 'write'
		ELSE m.agent_access
	END
	FROM public.onto_project_members AS m
	LEFT JOIN public.project_agent_settings AS s ON s.project_id = m.project_id
	WHERE m.project_id = p_project_id
		AND m.actor_id = p_actor_id
		AND m.removed_at IS NULL
	LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.people_layer_effective_agent_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_layer_effective_agent_access(uuid, uuid) TO service_role;

-- Display name for notifications: name, else @handle, else 'Someone'.
CREATE OR REPLACE FUNCTION public.people_layer_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT COALESCE(
		(SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || NULLIF(btrim(u.username), ''))
			FROM public.users AS u WHERE u.id = p_user_id),
		'Someone'
	)
$$;

REVOKE ALL ON FUNCTION public.people_layer_display_name(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_layer_display_name(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. A member asks the owner for more (web or agent)
-- ---------------------------------------------------------------------------
-- Statuses:
--   pending           sent (request_id); already_pending + merged when it joined a waiting one
--   pending           with no request_id: the owner blocked this person (silent)
--   already_allowed   every project already allows what was asked
--   waiting_other     a different kind of request to this owner is waiting
--   declined_recently the owner said not now to these projects in the last 7 days
--   rate_limited      too_many_pending | agent_daily_limit
--   not_found         a project isn't one this person is a member of (or it's theirs)
--   mixed_owners      the projects belong to different owners
CREATE OR REPLACE FUNCTION public.create_project_upgrade_request(
	p_project_ids uuid[],
	p_need text,
	p_note text DEFAULT NULL,
	p_caller_id uuid DEFAULT NULL,
	p_oauth_grant_id uuid DEFAULT NULL,
	p_agent_label text DEFAULT NULL,
	p_user_id uuid DEFAULT NULL
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
	v_existing jsonb;
	v_merged jsonb;
	v_added integer := 0;
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
	-- connection that belongs to the requester.
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
	ELSIF p_oauth_grant_id IS NOT NULL OR v_label IS NOT NULL THEN
		RAISE EXCEPTION 'Agent details need an agent connection' USING ERRCODE = '22023';
	END IF;

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

		v_items := v_items || jsonb_build_array(
			jsonb_build_object('project_id', v_project_id, 'need', v_need)
		);
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

		-- Merge: one card for the owner. The stronger need wins per project.
		v_existing := v_request.requested_items;
		SELECT jsonb_agg(merged ORDER BY ord), count(*) FILTER (WHERE is_new)
		INTO v_merged, v_added
		FROM (
			SELECT
				jsonb_build_object(
					'project_id', pid,
					'need', CASE GREATEST(old_rank, new_rank)
						WHEN 3 THEN 'edit' WHEN 2 THEN 'agents_write' ELSE 'agents_read' END
				) AS merged,
				COALESCE(old_ord, 100 + new_ord) AS ord,
				(old_rank = 0) AS is_new
			FROM (
				SELECT
					COALESCE(o.pid, n.pid) AS pid,
					COALESCE(o.rank, 0) AS old_rank,
					COALESCE(n.rank, 0) AS new_rank,
					o.ord AS old_ord,
					n.ord AS new_ord
				FROM (
					SELECT (e->>'project_id')::uuid AS pid,
						CASE e->>'need' WHEN 'edit' THEN 3 WHEN 'agents_write' THEN 2 ELSE 1 END AS rank,
						ord
					FROM jsonb_array_elements(v_existing) WITH ORDINALITY AS t(e, ord)
				) AS o
				FULL JOIN (
					SELECT (e->>'project_id')::uuid AS pid,
						CASE e->>'need' WHEN 'edit' THEN 3 WHEN 'agents_write' THEN 2 ELSE 1 END AS rank,
						ord
					FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(e, ord)
				) AS n ON n.pid = o.pid
			) AS joined
		) AS rows_out;

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
			'merged', v_added > 0,
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
-- 6. The owner decides (adds the upgrade branch; access and rejoin unchanged)
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
	-- Upgrade: give exactly what was asked in the projects the owner keeps checked
	-- (p_grants [{ project_id }]; empty means all of them).
	-- -----------------------------------------------------------------------
	IF v_request.kind = 'upgrade' THEN
		SELECT a.id INTO v_requester_actor
		FROM public.onto_actors AS a WHERE a.user_id = v_request.from_user_id LIMIT 1;
		IF v_requester_actor IS NULL THEN
			RAISE EXCEPTION 'That account is no longer available' USING ERRCODE = '22023';
		END IF;

		IF jsonb_typeof(p_grants) = 'array' AND jsonb_array_length(p_grants) > 0 THEN
			BEGIN
				SELECT array_agg((g->>'project_id')::uuid) INTO v_chosen
				FROM jsonb_array_elements(p_grants) AS g;
			EXCEPTION WHEN invalid_text_representation THEN
				RAISE EXCEPTION 'Unknown project' USING ERRCODE = '22023';
			END;
		ELSE
			SELECT array_agg((i->>'project_id')::uuid) INTO v_chosen
			FROM jsonb_array_elements(v_request.requested_items) AS i;
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
				'need', v_need
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

		RETURN jsonb_build_object(
			'status', 'approved',
			'kind', 'upgrade',
			'projects', v_applied,
			'requester_user_id', v_request.from_user_id,
			'via_caller_id', v_request.via_caller_id,
			'via_oauth_grant_id', v_request.via_oauth_grant_id
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
-- 7. Inbox and outbox: name the projects an upgrade is about
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

-- ---------------------------------------------------------------------------
-- 8. The owner turns standing approval on or off
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_project_editor_agents_write(
	p_project_id uuid,
	p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_owner_actor uuid;
BEGIN
	IF public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
		RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
	END IF;
	IF p_enabled IS NULL THEN
		RAISE EXCEPTION 'Say on or off' USING ERRCODE = '22023';
	END IF;

	SELECT a.id INTO v_owner_actor FROM public.onto_actors AS a WHERE a.user_id = auth.uid() LIMIT 1;
	IF v_owner_actor IS NULL OR NOT EXISTS (
		SELECT 1 FROM public.onto_projects AS p
		WHERE p.id = p_project_id
			AND p.created_by = v_owner_actor
			AND p.deleted_at IS NULL
			AND p.archived_at IS NULL
	) THEN
		RAISE EXCEPTION 'Only the project owner can change this' USING ERRCODE = '42501';
	END IF;

	INSERT INTO public.project_agent_settings (project_id, editor_agents_write, updated_at)
	VALUES (p_project_id, p_enabled, now())
	ON CONFLICT (project_id) DO UPDATE
	SET editor_agents_write = EXCLUDED.editor_agents_write, updated_at = now();

	RETURN jsonb_build_object('project_id', p_project_id, 'editor_agents_write', p_enabled);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants (functions are server-only by default)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_people_request(uuid, text, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_people_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_project_editor_agents_write(uuid, boolean) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_people_request(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_people_requests(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_project_editor_agents_write(uuid, boolean) TO authenticated;

COMMIT;
