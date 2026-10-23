-- supabase/migrations/20261024000500_project_access_events.sql
--
-- Access history: who got access to a project, and when (tasker/141, ambitious).
--
-- * public.project_access_events: one row per change to who can see a project and
--   what their agents can do there. Written only by triggers (and the backfill
--   below); owners read it through list_project_access_events.
-- * Triggers on onto_project_members, onto_project_invites, onto_projects and
--   project_agent_settings. Each insert sits in its own exception block, so a
--   logging failure can never break the write it describes.
-- * No emails or names are copied in. Members are actor ids (plain foreign keys:
--   a deleted person's actor becomes a tombstone, never deleted); invites are an
--   invite_id, and the label (email or @handle) is read from the invite at read
--   time, so account deletion that removes an invite removes its label too.
-- * Backfill: joins, removals, invites sent / accepted / declined / expired, each
--   at the time the data already records. Anything we can't date is left out.
-- * Invites that lapse without any write (status stays 'pending') are shown by
--   list_project_access_events as expired at expires_at, without a cron.
-- * list_project_access_events is server-only and takes the user id explicitly:
--   GET /api/people/history checks the session, then calls it. It resolves names
--   of people who have since left, which RLS on onto_actors would hide.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_access_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	occurred_at timestamptz NOT NULL DEFAULT now(),
	kind text NOT NULL CONSTRAINT project_access_events_kind_check CHECK (kind IN (
		'member_joined',
		'member_removed',
		'member_left',
		'role_changed',
		'agents_changed',
		'invite_sent',
		'invite_resent',
		'invite_accepted',
		'invite_declined',
		'invite_revoked',
		'invite_expired',
		'editors_agents_write_changed',
		'restricted_changed',
		'ownership_transferred'
	)),
	-- Who made the change (NULL when unknown). Authorship: a deleted person's actor
	-- stays as an anonymized tombstone, so these are plain references.
	by_actor_id uuid NULL REFERENCES public.onto_actors(id),
	-- The person the change is about (member events, ownership).
	subject_actor_id uuid NULL REFERENCES public.onto_actors(id),
	-- The invite the change is about. Its email / handle is read at read time.
	invite_id uuid NULL REFERENCES public.onto_project_invites(id) ON DELETE SET NULL,
	via text NULL CONSTRAINT project_access_events_via_check CHECK (
		via IS NULL OR via IN ('invite', 'invite_link', 'request', 'owner')
	),
	-- Role / access / agent values only (role_key, access, agent_access, on).
	before jsonb NULL,
	after jsonb NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_access_events_project_occurred_idx
	ON public.project_access_events (project_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS project_access_events_invite_idx
	ON public.project_access_events (invite_id)
	WHERE invite_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_access_events_by_actor_idx
	ON public.project_access_events (by_actor_id)
	WHERE by_actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_access_events_subject_actor_idx
	ON public.project_access_events (subject_actor_id)
	WHERE subject_actor_id IS NOT NULL;

ALTER TABLE public.project_access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_access_events_select_owner ON public.project_access_events;
CREATE POLICY project_access_events_select_owner
	ON public.project_access_events
	FOR SELECT
	TO authenticated
	USING (public.current_actor_has_project_member_access(project_id, 'admin'));

REVOKE ALL ON TABLE public.project_access_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_access_events TO authenticated;
GRANT ALL ON TABLE public.project_access_events TO service_role;

COMMENT ON TABLE public.project_access_events IS
	'Access history: changes to who can see a project and what their agents can do. Written by triggers only; owners read it via list_project_access_events. Holds ids and role values, never emails or names.';

DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'project_access_events', 'project_id', 'leave_behind',
				'Access history describes the archived source; the destination logs its own joins as they happen.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

-- ---------------------------------------------------------------------------
-- 2. Helpers (server-only)
-- ---------------------------------------------------------------------------

-- An actor id that exists, else NULL (legacy columns can hold a user id).
CREATE OR REPLACE FUNCTION public.project_access_events_actor_or_null(p_actor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT a.id FROM public.onto_actors AS a WHERE a.id = p_actor_id
$$;

REVOKE ALL ON FUNCTION public.project_access_events_actor_or_null(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_access_events_actor_or_null(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

-- Members: joins (and rejoins), removals, role and agent changes. The project's
-- own owner row (written when the project is created) and owner handoffs
-- (logged as ownership_transferred from onto_projects) are not repeated here.
CREATE OR REPLACE FUNCTION public.log_project_member_access_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_by uuid;
	v_owner uuid;
	v_kind text;
	v_via text;
BEGIN
	BEGIN
		v_by := public.current_actor_id();

		IF TG_OP = 'INSERT' OR (OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL) THEN
			IF NEW.removed_at IS NOT NULL THEN
				RETURN NULL;
			END IF;
			SELECT p.created_by INTO v_owner FROM public.onto_projects AS p WHERE p.id = NEW.project_id;
			-- The project's own owner row (created with the project) is not a join.
			IF NEW.role_key = 'owner' AND (
				NEW.actor_id IS NOT DISTINCT FROM v_owner
				OR EXISTS (
					SELECT 1 FROM public.onto_actors AS a
					WHERE a.id = NEW.actor_id AND a.user_id IS NOT DISTINCT FROM v_owner
				)
			) THEN
				RETURN NULL;
			END IF;
			IF NEW.joined_via_invite_link_id IS NOT NULL
				AND (TG_OP = 'INSERT' OR NEW.joined_via_invite_link_id IS DISTINCT FROM OLD.joined_via_invite_link_id) THEN
				v_via := 'invite_link';
			END IF;
			INSERT INTO public.project_access_events (
				project_id, kind, by_actor_id, subject_actor_id, via, after
			) VALUES (
				NEW.project_id,
				'member_joined',
				public.project_access_events_actor_or_null(COALESCE(v_by, NEW.added_by_actor_id)),
				NEW.actor_id,
				v_via,
				jsonb_build_object('role_key', NEW.role_key, 'access', NEW.access, 'agent_access', NEW.agent_access)
			);
			RETURN NULL;
		END IF;

		IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN
			v_kind := CASE
				WHEN COALESCE(NEW.removed_by_actor_id, v_by) = NEW.actor_id THEN 'member_left'
				ELSE 'member_removed'
			END;
			INSERT INTO public.project_access_events (
				project_id, kind, by_actor_id, subject_actor_id, before
			) VALUES (
				NEW.project_id,
				v_kind,
				public.project_access_events_actor_or_null(COALESCE(NEW.removed_by_actor_id, v_by)),
				NEW.actor_id,
				jsonb_build_object('role_key', OLD.role_key, 'access', OLD.access, 'agent_access', OLD.agent_access)
			);
			RETURN NULL;
		END IF;

		IF NEW.removed_at IS NOT NULL THEN
			RETURN NULL;
		END IF;

		IF (OLD.role_key IS DISTINCT FROM NEW.role_key OR OLD.access IS DISTINCT FROM NEW.access)
			AND OLD.role_key <> 'owner'
			AND NEW.role_key <> 'owner' THEN
			INSERT INTO public.project_access_events (
				project_id, kind, by_actor_id, subject_actor_id, before, after
			) VALUES (
				NEW.project_id,
				'role_changed',
				public.project_access_events_actor_or_null(v_by),
				NEW.actor_id,
				jsonb_build_object('role_key', OLD.role_key, 'access', OLD.access),
				jsonb_build_object('role_key', NEW.role_key, 'access', NEW.access)
			);
		END IF;

		IF OLD.agent_access IS DISTINCT FROM NEW.agent_access THEN
			INSERT INTO public.project_access_events (
				project_id, kind, by_actor_id, subject_actor_id, before, after
			) VALUES (
				NEW.project_id,
				'agents_changed',
				public.project_access_events_actor_or_null(v_by),
				NEW.actor_id,
				jsonb_build_object('agent_access', OLD.agent_access),
				jsonb_build_object('agent_access', NEW.agent_access)
			);
		END IF;
	EXCEPTION WHEN OTHERS THEN
		RAISE WARNING 'project_access_events (members) not logged: % %', SQLSTATE, SQLERRM;
	END;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_project_member_access_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_access_events_members ON public.onto_project_members;
CREATE TRIGGER project_access_events_members
	AFTER INSERT OR UPDATE OF role_key, access, agent_access, removed_at
	ON public.onto_project_members
	FOR EACH ROW
	EXECUTE FUNCTION public.log_project_member_access_event();

-- Invites: sent, sent again, accepted (folded into the join when the join is in
-- the same transaction), declined, withdrawn, expired.
CREATE OR REPLACE FUNCTION public.log_project_invite_access_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_by uuid;
	v_after jsonb;
BEGIN
	BEGIN
		v_by := public.current_actor_id();
		v_after := jsonb_build_object('role_key', NEW.role_key, 'access', NEW.access, 'agent_access', NEW.agent_access);

		IF TG_OP = 'INSERT' THEN
			INSERT INTO public.project_access_events (project_id, kind, by_actor_id, invite_id, after)
			VALUES (
				NEW.project_id,
				'invite_sent',
				public.project_access_events_actor_or_null(COALESCE(v_by, NEW.invited_by_actor_id)),
				NEW.id,
				v_after
			);
			RETURN NULL;
		END IF;

		IF NEW.status = 'pending'
			AND (OLD.status IS DISTINCT FROM 'pending' OR OLD.token_hash IS DISTINCT FROM NEW.token_hash) THEN
			INSERT INTO public.project_access_events (project_id, kind, by_actor_id, invite_id, after)
			VALUES (
				NEW.project_id,
				'invite_resent',
				public.project_access_events_actor_or_null(COALESCE(v_by, NEW.invited_by_actor_id)),
				NEW.id,
				v_after
			);
			RETURN NULL;
		END IF;

		IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
			RETURN NULL;
		END IF;

		IF NEW.status = 'accepted' THEN
			-- The join was just logged in this transaction: mark it as from this invite.
			UPDATE public.project_access_events AS e
			SET via = 'invite', invite_id = NEW.id
			WHERE e.project_id = NEW.project_id
				AND e.kind = 'member_joined'
				AND e.subject_actor_id = NEW.accepted_by_actor_id
				AND e.occurred_at = now()
				AND e.via IS NULL;
			IF NOT FOUND THEN
				INSERT INTO public.project_access_events (
					project_id, kind, by_actor_id, subject_actor_id, invite_id, via, after
				) VALUES (
					NEW.project_id,
					'invite_accepted',
					public.project_access_events_actor_or_null(COALESCE(NEW.accepted_by_actor_id, v_by)),
					public.project_access_events_actor_or_null(NEW.accepted_by_actor_id),
					NEW.id,
					'invite',
					v_after
				);
			END IF;
		ELSIF NEW.status = 'declined' THEN
			INSERT INTO public.project_access_events (project_id, kind, by_actor_id, invite_id, after)
			VALUES (NEW.project_id, 'invite_declined', public.project_access_events_actor_or_null(v_by), NEW.id, v_after);
		ELSIF NEW.status = 'revoked' THEN
			-- Accepting one invite withdraws that person's other open invites to the
			-- same project; that is not news.
			IF NOT EXISTS (
				SELECT 1
				FROM public.onto_project_invites AS i
				WHERE i.project_id = NEW.project_id
					AND i.id <> NEW.id
					AND i.status = 'accepted'
					AND i.accepted_at = now()
					AND lower(btrim(i.invitee_email)) = lower(btrim(NEW.invitee_email))
			) THEN
				INSERT INTO public.project_access_events (project_id, kind, by_actor_id, invite_id, after)
				VALUES (NEW.project_id, 'invite_revoked', public.project_access_events_actor_or_null(v_by), NEW.id, v_after);
			END IF;
		ELSIF NEW.status = 'expired' THEN
			IF NOT EXISTS (
				SELECT 1 FROM public.project_access_events AS e
				WHERE e.invite_id = NEW.id AND e.kind = 'invite_expired'
			) THEN
				INSERT INTO public.project_access_events (project_id, occurred_at, kind, invite_id, after)
				VALUES (NEW.project_id, LEAST(NEW.expires_at, now()), 'invite_expired', NEW.id, v_after);
			END IF;
		END IF;
	EXCEPTION WHEN OTHERS THEN
		RAISE WARNING 'project_access_events (invites) not logged: % %', SQLSTATE, SQLERRM;
	END;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_project_invite_access_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_access_events_invites ON public.onto_project_invites;
CREATE TRIGGER project_access_events_invites
	AFTER INSERT OR UPDATE OF status, token_hash
	ON public.onto_project_invites
	FOR EACH ROW
	EXECUTE FUNCTION public.log_project_invite_access_event();

-- Projects: "only agents you pick" (restricted) and ownership handoff.
CREATE OR REPLACE FUNCTION public.log_project_settings_access_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_by uuid;
BEGIN
	BEGIN
		v_by := public.current_actor_id();

		IF OLD.external_agent_access IS DISTINCT FROM NEW.external_agent_access THEN
			INSERT INTO public.project_access_events (project_id, kind, by_actor_id, before, after)
			VALUES (
				NEW.id,
				'restricted_changed',
				public.project_access_events_actor_or_null(v_by),
				jsonb_build_object('restricted', OLD.external_agent_access = 'restricted'),
				jsonb_build_object('restricted', NEW.external_agent_access = 'restricted')
			);
		END IF;

		IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
			INSERT INTO public.project_access_events (
				project_id, kind, by_actor_id, subject_actor_id, before, after
			) VALUES (
				NEW.id,
				'ownership_transferred',
				public.project_access_events_actor_or_null(COALESCE(v_by, OLD.created_by)),
				public.project_access_events_actor_or_null(NEW.created_by),
				jsonb_build_object('owner_actor_id', public.project_access_events_actor_or_null(OLD.created_by)),
				jsonb_build_object('owner_actor_id', public.project_access_events_actor_or_null(NEW.created_by))
			);
		END IF;
	EXCEPTION WHEN OTHERS THEN
		RAISE WARNING 'project_access_events (project) not logged: % %', SQLSTATE, SQLERRM;
	END;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_project_settings_access_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_access_events_projects ON public.onto_projects;
CREATE TRIGGER project_access_events_projects
	AFTER UPDATE OF external_agent_access, created_by
	ON public.onto_projects
	FOR EACH ROW
	WHEN (
		OLD.external_agent_access IS DISTINCT FROM NEW.external_agent_access
		OR OLD.created_by IS DISTINCT FROM NEW.created_by
	)
	EXECUTE FUNCTION public.log_project_settings_access_event();

-- Standing approval: "Editors' agents can make changes".
CREATE OR REPLACE FUNCTION public.log_project_agent_settings_access_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_before boolean;
BEGIN
	BEGIN
		v_before := CASE WHEN TG_OP = 'UPDATE' THEN OLD.editor_agents_write ELSE false END;
		IF v_before IS DISTINCT FROM NEW.editor_agents_write THEN
			INSERT INTO public.project_access_events (project_id, kind, by_actor_id, before, after)
			VALUES (
				NEW.project_id,
				'editors_agents_write_changed',
				public.project_access_events_actor_or_null(public.current_actor_id()),
				jsonb_build_object('on', v_before),
				jsonb_build_object('on', NEW.editor_agents_write)
			);
		END IF;
	EXCEPTION WHEN OTHERS THEN
		RAISE WARNING 'project_access_events (agent settings) not logged: % %', SQLSTATE, SQLERRM;
	END;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_project_agent_settings_access_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_access_events_agent_settings ON public.project_agent_settings;
CREATE TRIGGER project_access_events_agent_settings
	AFTER INSERT OR UPDATE OF editor_agents_write
	ON public.project_agent_settings
	FOR EACH ROW
	EXECUTE FUNCTION public.log_project_agent_settings_access_event();

-- ---------------------------------------------------------------------------
-- 4. Backfill: only what existing rows already date
-- ---------------------------------------------------------------------------

-- Joins, including people who later left. The creator's own row is not a join.
-- The role at join time isn't stored, so an owner (by handoff) joins without one.
INSERT INTO public.project_access_events (
	project_id, occurred_at, kind, by_actor_id, subject_actor_id, invite_id, via, after
)
SELECT
	m.project_id,
	m.created_at,
	'member_joined',
	CASE
		WHEN m.joined_via_invite_link_id IS NOT NULL OR inv.id IS NOT NULL THEN m.actor_id
		ELSE public.project_access_events_actor_or_null(m.added_by_actor_id)
	END,
	m.actor_id,
	inv.id,
	CASE
		WHEN m.joined_via_invite_link_id IS NOT NULL THEN 'invite_link'
		WHEN inv.id IS NOT NULL THEN 'invite'
	END,
	CASE WHEN m.role_key <> 'owner'
		THEN jsonb_build_object('role_key', m.role_key, 'access', m.access)
	END
FROM public.onto_project_members AS m
JOIN public.onto_projects AS p ON p.id = m.project_id
LEFT JOIN LATERAL (
	SELECT i.id
	FROM public.onto_project_invites AS i
	WHERE i.project_id = m.project_id
		AND i.accepted_by_actor_id = m.actor_id
		AND i.status = 'accepted'
	ORDER BY i.accepted_at DESC NULLS LAST
	LIMIT 1
) AS inv ON true
WHERE NOT (
	-- The owner's own row (older owner rows were backfilled long after creation;
	-- created_by can still hold a legacy user id).
	m.role_key = 'owner'
	AND (
		m.actor_id = p.created_by
		OR EXISTS (SELECT 1 FROM public.onto_actors AS a WHERE a.id = m.actor_id AND a.user_id = p.created_by)
	)
)
AND NOT (
	-- The creator's row, written with the project (even if they later handed it off).
	m.created_at <= p.created_at + interval '1 minute'
	AND (m.added_by_actor_id IS NULL OR m.added_by_actor_id = m.actor_id)
	AND m.joined_via_invite_link_id IS NULL
);

-- Removals and people who left.
INSERT INTO public.project_access_events (
	project_id, occurred_at, kind, by_actor_id, subject_actor_id, before
)
SELECT
	m.project_id,
	m.removed_at,
	CASE WHEN m.removed_by_actor_id = m.actor_id THEN 'member_left' ELSE 'member_removed' END,
	public.project_access_events_actor_or_null(m.removed_by_actor_id),
	m.actor_id,
	jsonb_build_object('role_key', m.role_key, 'access', m.access)
FROM public.onto_project_members AS m
WHERE m.removed_at IS NOT NULL;

-- Invites sent.
INSERT INTO public.project_access_events (project_id, occurred_at, kind, by_actor_id, invite_id, after)
SELECT
	i.project_id,
	i.created_at,
	'invite_sent',
	public.project_access_events_actor_or_null(i.invited_by_actor_id),
	i.id,
	jsonb_build_object('role_key', i.role_key, 'access', i.access, 'agent_access', i.agent_access)
FROM public.onto_project_invites AS i;

-- Accepted invites whose join isn't a member row of its own (already a member).
INSERT INTO public.project_access_events (
	project_id, occurred_at, kind, by_actor_id, subject_actor_id, invite_id, via, after
)
SELECT
	i.project_id,
	i.accepted_at,
	'invite_accepted',
	public.project_access_events_actor_or_null(i.accepted_by_actor_id),
	public.project_access_events_actor_or_null(i.accepted_by_actor_id),
	i.id,
	'invite',
	jsonb_build_object('role_key', i.role_key, 'access', i.access, 'agent_access', i.agent_access)
FROM public.onto_project_invites AS i
WHERE i.status = 'accepted'
	AND i.accepted_at IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM public.project_access_events AS e
		WHERE e.invite_id = i.id AND e.kind = 'member_joined'
	);

-- Declined invites.
INSERT INTO public.project_access_events (project_id, occurred_at, kind, invite_id, after)
SELECT
	i.project_id,
	i.declined_at,
	'invite_declined',
	i.id,
	jsonb_build_object('role_key', i.role_key, 'access', i.access, 'agent_access', i.agent_access)
FROM public.onto_project_invites AS i
WHERE i.declined_at IS NOT NULL
	AND i.status = 'declined';

-- Invites that ran out unanswered.
INSERT INTO public.project_access_events (project_id, occurred_at, kind, invite_id, after)
SELECT
	i.project_id,
	i.expires_at,
	'invite_expired',
	i.id,
	jsonb_build_object('role_key', i.role_key, 'access', i.access, 'agent_access', i.agent_access)
FROM public.onto_project_invites AS i
WHERE i.status IN ('pending', 'expired')
	AND i.expires_at < now();

-- ---------------------------------------------------------------------------
-- 5. Reading it: owners only, names and invite labels resolved
-- ---------------------------------------------------------------------------
-- Projects p_user_id owns (admin member), newest first. Invites still marked
-- pending after their expiry show as expired at expires_at. Keyset paging on
-- (occurred_at, id): pass the last row's values as p_before / p_before_id.
-- Server-only: the caller has already checked that p_user_id is the session user.
CREATE OR REPLACE FUNCTION public.list_project_access_events(
	p_user_id uuid,
	p_limit integer DEFAULT 50,
	p_before timestamptz DEFAULT NULL,
	p_before_id uuid DEFAULT NULL,
	p_project_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor uuid;
	v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
	v_cursor_id uuid := COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
	v_rows jsonb;
	v_count integer;
	v_last jsonb;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
	END IF;

	SELECT a.id INTO v_actor FROM public.onto_actors AS a WHERE a.user_id = p_user_id LIMIT 1;
	IF v_actor IS NULL THEN
		RETURN jsonb_build_object('events', '[]'::jsonb, 'next_before', NULL, 'next_before_id', NULL);
	END IF;

	WITH owned AS (
		SELECT p.id, p.name
		FROM public.onto_projects AS p
		JOIN public.onto_project_members AS m
			ON m.project_id = p.id
			AND m.actor_id = v_actor
			AND m.removed_at IS NULL
			AND m.access = 'admin'
		WHERE p.deleted_at IS NULL
			AND (p_project_id IS NULL OR p.id = p_project_id)
	),
	merged AS (
		SELECT e.id, e.occurred_at, e.project_id, e.kind, e.via, e.by_actor_id,
			e.subject_actor_id, e.invite_id, e.before, e.after
		FROM public.project_access_events AS e
		JOIN owned AS o ON o.id = e.project_id
		WHERE p_before IS NULL OR (e.occurred_at, e.id) < (p_before, v_cursor_id)
		UNION ALL
		SELECT i.id, i.expires_at, i.project_id, 'invite_expired', NULL::text, NULL::uuid,
			NULL::uuid, i.id,
			NULL::jsonb,
			jsonb_build_object('role_key', i.role_key, 'access', i.access, 'agent_access', i.agent_access)
		FROM public.onto_project_invites AS i
		JOIN owned AS o ON o.id = i.project_id
		WHERE i.status = 'pending'
			AND i.expires_at < now()
			AND NOT EXISTS (
				SELECT 1 FROM public.project_access_events AS x
				WHERE x.invite_id = i.id AND x.kind = 'invite_expired'
			)
			AND (p_before IS NULL OR (i.expires_at, i.id) < (p_before, v_cursor_id))
	),
	page AS (
		SELECT *
		FROM merged
		ORDER BY occurred_at DESC, id DESC
		LIMIT v_limit + 1
	)
	SELECT
		COALESCE(jsonb_agg(
			jsonb_build_object(
				'id', page.id,
				'occurred_at', page.occurred_at,
				'project_id', page.project_id,
				'project_name', o.name,
				'kind', page.kind,
				'via', page.via,
				'by_actor_id', page.by_actor_id,
				'by_name', by_actor.name,
				'by_is_you', page.by_actor_id IS NOT DISTINCT FROM v_actor AND page.by_actor_id IS NOT NULL,
				'subject_actor_id', page.subject_actor_id,
				'subject_name', subject_actor.name,
				'subject_is_you', page.subject_actor_id IS NOT DISTINCT FROM v_actor AND page.subject_actor_id IS NOT NULL,
				'subject_label', CASE
					WHEN invite.id IS NULL THEN NULL
					WHEN NULLIF(btrim(invite.invitee_handle), '') IS NOT NULL THEN '@' || btrim(invite.invitee_handle)
					ELSE invite.invitee_email
				END,
				'before', page.before,
				'after', page.after
			)
			ORDER BY page.occurred_at DESC, page.id DESC
		), '[]'::jsonb),
		count(*)
	INTO v_rows, v_count
	FROM page
	JOIN owned AS o ON o.id = page.project_id
	LEFT JOIN public.onto_actors AS by_actor ON by_actor.id = page.by_actor_id
	LEFT JOIN public.onto_actors AS subject_actor ON subject_actor.id = page.subject_actor_id
	LEFT JOIN public.onto_project_invites AS invite ON invite.id = page.invite_id;

	IF v_count > v_limit THEN
		v_rows := v_rows - v_limit;
		v_last := v_rows -> (v_limit - 1);
		RETURN jsonb_build_object(
			'events', v_rows,
			'next_before', v_last -> 'occurred_at',
			'next_before_id', v_last -> 'id'
		);
	END IF;

	RETURN jsonb_build_object('events', v_rows, 'next_before', NULL, 'next_before_id', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.list_project_access_events(uuid, integer, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_access_events(uuid, integer, timestamptz, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.list_project_access_events(uuid, integer, timestamptz, uuid, uuid) IS
	'Server-only. Access history for the projects p_user_id owns (admin member), newest first, with names and invite labels. Lapsed pending invites show as expired. Keyset paging on (occurred_at, id). Callers pass the session user id.';

COMMIT;
