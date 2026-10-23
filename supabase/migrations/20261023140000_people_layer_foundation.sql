-- supabase/migrations/20261023140000_people_layer_foundation.sql
--
-- People layer V1 (docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md, "DJ direction").
--
-- * Who can find me: users.discoverability ('none' until the person opts in) and
--   users.accepts_agent_requests. Nobody becomes findable without acting.
-- * What a member's agents may do: onto_project_members.agent_access off | read | write.
--   'write' means the guest-agent lane, enforced in the external agent gateway: add
--   tasks and documents, change only items the person created or is assigned to.
-- * Invites carry the agent setting (and optionally the handle they were sent to);
--   a trigger copies it onto the member row when the invite is accepted.
-- * people_requests: a person, or their connected agent, asks someone for access.
--   Only the recipient decides, from a signed-in session (decide_people_request).

-- ---------------------------------------------------------------------------
-- 1. Who can find me
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
	ADD COLUMN IF NOT EXISTS discoverability text NOT NULL DEFAULT 'none',
	ADD COLUMN IF NOT EXISTS accepts_agent_requests boolean NOT NULL DEFAULT true;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.users'::regclass AND conname = 'users_discoverability_check'
	) THEN
		ALTER TABLE public.users
			ADD CONSTRAINT users_discoverability_check
			CHECK (discoverability IN ('none', 'handle'));
	END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. What a member's agents may do
-- ---------------------------------------------------------------------------
ALTER TABLE public.onto_project_members
	ADD COLUMN IF NOT EXISTS agent_access text NOT NULL DEFAULT 'read';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.onto_project_members'::regclass
			AND conname = 'chk_project_member_agent_access'
	) THEN
		ALTER TABLE public.onto_project_members
			ADD CONSTRAINT chk_project_member_agent_access
			CHECK (agent_access IN ('off', 'read', 'write'));
	END IF;
END $$;

-- Existing editors keep agent writes (now limited to their lane); viewers stay read.
UPDATE public.onto_project_members
SET agent_access = 'write'
WHERE access IN ('write', 'admin')
	AND agent_access = 'read';

-- ---------------------------------------------------------------------------
-- 3. Invites carry the agent setting and the handle they were sent to
-- ---------------------------------------------------------------------------
ALTER TABLE public.onto_project_invites
	ADD COLUMN IF NOT EXISTS agent_access text NOT NULL DEFAULT 'read',
	ADD COLUMN IF NOT EXISTS invitee_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS invitee_handle text NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.onto_project_invites'::regclass
			AND conname = 'chk_project_invite_agent_access'
	) THEN
		ALTER TABLE public.onto_project_invites
			ADD CONSTRAINT chk_project_invite_agent_access
			CHECK (agent_access IN ('off', 'read', 'write'));
	END IF;
END $$;

-- The accept RPCs insert or reactivate the member row before marking the invite
-- accepted, so the member row exists when this fires. Agents never get more than
-- their person: 'write' only sticks on a member who can write.
CREATE OR REPLACE FUNCTION public.apply_project_invite_agent_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NEW.status = 'accepted'
		AND OLD.status IS DISTINCT FROM 'accepted'
		AND NEW.accepted_by_actor_id IS NOT NULL
	THEN
		UPDATE public.onto_project_members AS m
		SET agent_access = CASE
			WHEN NEW.agent_access = 'write' AND m.access NOT IN ('write', 'admin') THEN 'read'
			ELSE NEW.agent_access
		END
		WHERE m.project_id = NEW.project_id
			AND m.actor_id = NEW.accepted_by_actor_id
			AND m.removed_at IS NULL
			AND m.role_key <> 'owner';
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_project_invite_agent_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_project_invites_agent_access ON public.onto_project_invites;
CREATE TRIGGER trg_onto_project_invites_agent_access
	AFTER UPDATE OF status ON public.onto_project_invites
	FOR EACH ROW
	EXECUTE FUNCTION public.apply_project_invite_agent_access();

-- ---------------------------------------------------------------------------
-- 4. Requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people_requests (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	-- Free text ("9takes"): the requester can't see the owner's projects, so the
	-- owner picks real projects when approving.
	project_hint text NULL CHECK (project_hint IS NULL OR char_length(project_hint) <= 120),
	role_requested text NOT NULL DEFAULT 'viewer' CHECK (role_requested IN ('viewer', 'editor')),
	note text NULL CHECK (note IS NULL OR char_length(note) <= 500),
	via text NOT NULL DEFAULT 'web' CHECK (via IN ('web', 'agent')),
	via_caller_id uuid NULL REFERENCES public.external_agent_callers(id) ON DELETE SET NULL,
	via_oauth_grant_id uuid NULL REFERENCES public.agent_oauth_grants(id) ON DELETE SET NULL,
	via_agent_label text NULL CHECK (via_agent_label IS NULL OR char_length(via_agent_label) <= 80),
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'declined', 'blocked', 'canceled')),
	-- [{ project_id, role, agent_access }] chosen by the recipient.
	decision jsonb NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	decided_at timestamptz NULL,
	expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
	CONSTRAINT people_requests_not_self CHECK (from_user_id <> to_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_requests_pending_pair
	ON public.people_requests (from_user_id, to_user_id)
	WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_people_requests_to_created
	ON public.people_requests (to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_requests_from_created
	ON public.people_requests (from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_requests_caller_created
	ON public.people_requests (via_caller_id, created_at DESC)
	WHERE via_caller_id IS NOT NULL;

ALTER TABLE public.people_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_requests_select_own ON public.people_requests;
CREATE POLICY people_requests_select_own
	ON public.people_requests
	FOR SELECT
	TO authenticated
	USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

REVOKE ALL ON TABLE public.people_requests FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.people_requests TO authenticated;
GRANT ALL ON TABLE public.people_requests TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Notification event types
-- ---------------------------------------------------------------------------
DO $$
DECLARE expression text;
BEGIN
	SELECT pg_get_expr(conbin, conrelid) INTO expression
	FROM pg_constraint
	WHERE conrelid = 'public.notification_events'::regclass
		AND conname = 'notification_events_event_type_check';
	IF expression IS NOT NULL AND position('people.request.received' IN expression) = 0 THEN
		ALTER TABLE public.notification_events DROP CONSTRAINT notification_events_event_type_check;
		EXECUTE 'ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (('
			|| expression
			|| ') OR event_type IN (''people.request.received'', ''people.request.approved'')) NOT VALID';
	END IF;
END $$;
ALTER TABLE public.notification_events VALIDATE CONSTRAINT notification_events_event_type_check;

-- ---------------------------------------------------------------------------
-- 6. Functions
-- ---------------------------------------------------------------------------

-- The PostgREST role of the current request ('authenticated', 'service_role', ...).
CREATE OR REPLACE FUNCTION public.people_layer_jwt_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
	v_claims_text text;
	v_role text;
BEGIN
	v_claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
	IF v_claims_text IS NOT NULL THEN
		v_role := NULLIF((v_claims_text::jsonb)->>'role', '');
	END IF;
	RETURN COALESCE(v_role, NULLIF(current_setting('request.jwt.claim.role', true), ''));
END;
$$;

-- Who is asking: the signed-in user, or (server only) an explicit user id.
CREATE OR REPLACE FUNCTION public.people_layer_viewer(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
	v_role text := public.people_layer_jwt_role();
BEGIN
	IF v_role = 'service_role' THEN
		IF p_user_id IS NULL THEN
			RAISE EXCEPTION 'A user id is required' USING ERRCODE = '22023';
		END IF;
		RETURN p_user_id;
	END IF;
	IF v_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
		IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
			RAISE EXCEPTION 'You can only act as yourself' USING ERRCODE = '42501';
		END IF;
		RETURN auth.uid();
	END IF;
	RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
END;
$$;

-- Normalizes "@Sam " to "sam"; NULL when it can't be a handle.
CREATE OR REPLACE FUNCTION public.people_layer_normalize_handle(p_handle text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
	SELECT CASE
		WHEN h ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(h) BETWEEN 3 AND 24 THEN h
		ELSE NULL
	END
	FROM (SELECT lower(regexp_replace(btrim(COALESCE(p_handle, '')), '^@+', '')) AS h) AS s
$$;

-- A findable person by handle, or NULL. Not-found and not-findable look the same.
CREATE OR REPLACE FUNCTION public.people_layer_findable_user(p_handle text)
RETURNS TABLE (id uuid, username text, name text, bio text, accepts_agent_requests boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT u.id, u.username, u.name, u.bio, u.accepts_agent_requests
	FROM public.users AS u
	WHERE public.people_layer_normalize_handle(p_handle) IS NOT NULL
		AND lower(u.username) = public.people_layer_normalize_handle(p_handle)
		AND u.discoverability = 'handle'
		AND u.deletion_status IS NULL
		AND COALESCE(u.access_restricted, false) = false
	LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.find_person_by_handle(
	p_handle text,
	p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_viewer uuid := public.people_layer_viewer(p_user_id);
	v_handle text := public.people_layer_normalize_handle(p_handle);
	v_target record;
	v_viewer_actor uuid;
	v_shared_count integer := 0;
	v_pending boolean := false;
BEGIN
	IF v_handle IS NULL THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	SELECT * INTO v_target FROM public.people_layer_findable_user(v_handle);
	IF v_target.id IS NULL THEN
		RETURN jsonb_build_object('found', false, 'handle', v_handle);
	END IF;

	IF v_target.id = v_viewer THEN
		RETURN jsonb_build_object(
			'found', true,
			'is_self', true,
			'handle', v_target.username,
			'name', v_target.name
		);
	END IF;

	SELECT a.id INTO v_viewer_actor FROM public.onto_actors AS a WHERE a.user_id = v_viewer LIMIT 1;
	IF v_viewer_actor IS NOT NULL THEN
		SELECT count(*)::integer INTO v_shared_count
		FROM public.onto_projects AS p
		JOIN public.onto_actors AS owner_actor ON owner_actor.id = p.created_by
		JOIN public.onto_project_members AS m
			ON m.project_id = p.id AND m.actor_id = v_viewer_actor AND m.removed_at IS NULL
		WHERE owner_actor.user_id = v_target.id
			AND p.deleted_at IS NULL
			AND p.archived_at IS NULL;
	END IF;

	SELECT EXISTS (
		SELECT 1 FROM public.people_requests AS r
		WHERE r.from_user_id = v_viewer
			AND r.to_user_id = v_target.id
			AND r.status = 'pending'
			AND r.expires_at > now()
	) INTO v_pending;

	RETURN jsonb_build_object(
		'found', true,
		'is_self', false,
		'handle', v_target.username,
		'name', v_target.name,
		'bio', v_target.bio,
		'accepts_agent_requests', v_target.accepts_agent_requests,
		'relationship', jsonb_build_object(
			'pending_request', v_pending,
			'projects_shared_with_you', v_shared_count
		)
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_people_request(
	p_handle text,
	p_role text DEFAULT 'viewer',
	p_project_hint text DEFAULT NULL,
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
	v_target record;
	v_request public.people_requests%ROWTYPE;
	v_requester_name text;
	v_label text := NULLIF(left(btrim(COALESCE(p_agent_label, '')), 80), '');
	v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
	v_hint text := NULLIF(left(btrim(COALESCE(p_project_hint, '')), 120), '');
	v_payload jsonb;
	v_event_id uuid;
	v_delivery_id uuid;
BEGIN
	IF p_role NOT IN ('viewer', 'editor') THEN
		RAISE EXCEPTION 'Role must be viewer or editor' USING ERRCODE = '22023';
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

	SELECT * INTO v_target FROM public.people_layer_findable_user(p_handle);
	IF v_target.id IS NULL THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;
	IF v_target.id = v_viewer THEN
		RETURN jsonb_build_object('status', 'self');
	END IF;
	IF v_via = 'agent' AND NOT v_target.accepts_agent_requests THEN
		RETURN jsonb_build_object('status', 'agent_requests_off');
	END IF;

	-- Expire stale pending requests for this pair so the pending index frees up.
	UPDATE public.people_requests AS r
	SET status = 'canceled', decided_at = now()
	WHERE r.from_user_id = v_viewer
		AND r.to_user_id = v_target.id
		AND r.status = 'pending'
		AND r.expires_at <= now();

	SELECT * INTO v_request
	FROM public.people_requests AS r
	WHERE r.from_user_id = v_viewer AND r.to_user_id = v_target.id AND r.status = 'pending'
	LIMIT 1;
	IF FOUND THEN
		RETURN jsonb_build_object(
			'status', 'pending',
			'already_pending', true,
			'request_id', v_request.id,
			'expires_at', v_request.expires_at
		);
	END IF;

	-- A block is silent: the requester sees an ordinary pending answer.
	IF EXISTS (
		SELECT 1 FROM public.people_requests AS r
		WHERE r.from_user_id = v_viewer AND r.to_user_id = v_target.id AND r.status = 'blocked'
	) THEN
		RETURN jsonb_build_object('status', 'pending');
	END IF;

	IF EXISTS (
		SELECT 1 FROM public.people_requests AS r
		WHERE r.from_user_id = v_viewer
			AND r.to_user_id = v_target.id
			AND r.status = 'declined'
			AND r.decided_at > now() - interval '30 days'
	) THEN
		RETURN jsonb_build_object('status', 'declined_recently');
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
		from_user_id, to_user_id, project_hint, role_requested, note,
		via, via_caller_id, via_oauth_grant_id, via_agent_label
	)
	VALUES (
		v_viewer, v_target.id, v_hint, p_role, v_note,
		v_via, p_caller_id, p_oauth_grant_id, CASE WHEN v_via = 'agent' THEN COALESCE(v_label, 'their agent') END
	)
	RETURNING * INTO v_request;

	SELECT COALESCE(NULLIF(btrim(u.name), ''), '@' || u.username, 'Someone')
	INTO v_requester_name
	FROM public.users AS u WHERE u.id = v_viewer;

	v_payload := jsonb_build_object(
		'title', COALESCE(v_requester_name, 'Someone') || ' wants to see your projects',
		'body', CASE
			WHEN v_via = 'agent' THEN 'Sent by ' || v_request.via_agent_label || '. Choose what to share in BuildOS.'
			ELSE 'Choose what to share in BuildOS.'
		END,
		'action_url', '/people',
		'event_type', 'people.request.received',
		'request_id', v_request.id
	);
	INSERT INTO public.notification_events (event_type, event_source, target_user_id, payload, metadata)
	VALUES ('people.request.received', 'api_action', v_target.id, v_payload,
		jsonb_build_object('request_id', v_request.id))
	RETURNING id INTO v_event_id;
	INSERT INTO public.notification_deliveries (
		event_id, recipient_user_id, channel, payload, status, attempts, max_attempts, sent_at, delivered_at
	)
	VALUES (v_event_id, v_target.id, 'in_app', v_payload, 'delivered', 1, 1, now(), now())
	RETURNING id INTO v_delivery_id;
	INSERT INTO public.user_notifications (
		event_id, delivery_id, user_id, type, title, message, priority, action_url, event_type, data, expires_at
	)
	VALUES (
		v_event_id, v_delivery_id, v_target.id, 'info', v_payload->>'title', v_payload->>'body',
		'normal', '/people', 'people.request.received',
		jsonb_build_object('request_id', v_request.id), v_request.expires_at
	);

	RETURN jsonb_build_object(
		'status', 'pending',
		'request_id', v_request.id,
		'expires_at', v_request.expires_at
	);
END;
$$;

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
			'role_requested', r.role_requested,
			'project_hint', r.project_hint,
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

-- Only the recipient, signed in, decides. Approving adds the requester to the chosen
-- projects (the recipient must own each one) with a role and an agent setting.
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
	v_project_id uuid;
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

	IF jsonb_typeof(p_grants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_grants) = 0 THEN
		RAISE EXCEPTION 'Choose at least one project to share' USING ERRCODE = '22023';
	END IF;
	IF jsonb_array_length(p_grants) > 50 THEN
		RAISE EXCEPTION 'Share at most 50 projects at a time' USING ERRCODE = '22023';
	END IF;

	SELECT a.id INTO v_owner_actor FROM public.onto_actors AS a WHERE a.user_id = v_uid LIMIT 1;
	IF v_owner_actor IS NULL THEN
		RAISE EXCEPTION 'You have no projects to share' USING ERRCODE = '22023';
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
		'projects', v_applied,
		'requester_user_id', v_request.from_user_id,
		'via_caller_id', v_request.via_caller_id,
		'via_oauth_grant_id', v_request.via_oauth_grant_id
	);
END;
$$;

-- The owner changes (or pauses) what one member's agents may do.
CREATE OR REPLACE FUNCTION public.set_project_member_agent_access(
	p_project_id uuid,
	p_member_id uuid,
	p_agent_access text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_owner_actor uuid;
	v_member public.onto_project_members%ROWTYPE;
BEGIN
	IF public.people_layer_jwt_role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
		RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
	END IF;
	IF p_agent_access NOT IN ('off', 'read', 'write') THEN
		RAISE EXCEPTION 'Agent access must be off, read, or write' USING ERRCODE = '22023';
	END IF;

	SELECT a.id INTO v_owner_actor FROM public.onto_actors AS a WHERE a.user_id = auth.uid() LIMIT 1;
	IF v_owner_actor IS NULL OR NOT public.actor_has_project_member_access(v_owner_actor, p_project_id, 'admin') THEN
		RAISE EXCEPTION 'Only the project owner can change this' USING ERRCODE = '42501';
	END IF;

	SELECT * INTO v_member
	FROM public.onto_project_members AS m
	WHERE m.id = p_member_id AND m.project_id = p_project_id AND m.removed_at IS NULL
	FOR UPDATE;
	IF NOT FOUND OR v_member.role_key = 'owner' THEN
		RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
	END IF;
	IF p_agent_access = 'write' AND v_member.access NOT IN ('write', 'admin') THEN
		RAISE EXCEPTION 'Agents can only write where their person can edit' USING ERRCODE = '22023';
	END IF;

	UPDATE public.onto_project_members SET agent_access = p_agent_access WHERE id = v_member.id;
	RETURN jsonb_build_object('member_id', v_member.id, 'agent_access', p_agent_access);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants (functions are server-only by default)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.people_layer_jwt_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.people_layer_viewer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.people_layer_normalize_handle(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.people_layer_findable_user(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_person_by_handle(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_people_request(text, text, text, text, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_people_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_people_request(uuid, text, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_project_member_agent_access(uuid, uuid, text) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.people_layer_jwt_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.people_layer_viewer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.people_layer_normalize_handle(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.people_layer_findable_user(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_person_by_handle(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_people_request(text, text, text, text, uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_people_requests(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_people_request(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_member_agent_access(uuid, uuid, text) TO authenticated;
