-- supabase/migrations/20261118300000_knowledge_project_sharing.sql
-- Knowledge in shared projects (tasker 168; design docs/research/knowledge-shared-projects-2026-11-18.md).
--
-- Everyone keeps their own private graph. Inside a project with other members, a name's card
-- also shows what OTHER active members' entries hold about it ("From DJ's People"):
--   * facts that came from the public web or from this project's own tasks/docs → shown;
--   * personal contact details and other personal facts → counted ("DJ has 2 contact details")
--     and opened only by the owner's grant ("Ask" → Share);
--   * notes, "knows", birthdays, links to the owner's other work → never.
-- Nothing is copied: every read recomputes from the owner's live facts, both people's current
-- membership and live grants, so leaving a project, revoking, or editing a fact takes effect on
-- the next read. Ownership never moves (knowledge_entities_guard), and the existing RLS on the
-- knowledge tables is unchanged: shared reads go only through the SECURITY DEFINER functions
-- below, which check the viewer (knowledge_viewer) and membership themselves.
--
--   knowledge_shares         one row per ask or grant (requested → granted | declined |
--                            canceled, granted → revoked). Durations: while both are members of
--                            the project (default, checked live), always, or until a date.
--   knowledge_share_events   trigger-written history (who asked, who granted/revoked, when).
--   knowledge_fact_share_level(...)   the per-fact rule table (shared / request / never / owner).
--   knowledge_project_lens(...)       what other members' entries show on these records.
--   knowledge_request_share / knowledge_decide_share / knowledge_share_entity /
--   knowledge_revoke_share / knowledge_cancel_share_request / knowledge_entity_shares /
--   knowledge_share_inbox            the Ask → Share flow, "Who can see Kyle", the inbox.
--
-- Grants, approvals and revokes need a signed-in human (auth.uid()); agents can ask (via the
-- service role with p_viewer) but never approve.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.knowledge_project_lens(uuid, text, uuid[], uuid),
--     public.knowledge_request_share(uuid, uuid, text, uuid, text),
--     public.knowledge_decide_share(uuid, text, text, text[], text, timestamptz),
--     public.knowledge_share_entity(uuid, uuid, uuid, text, text[], text, timestamptz),
--     public.knowledge_revoke_share(uuid), public.knowledge_cancel_share_request(uuid),
--     public.knowledge_entity_shares(uuid), public.knowledge_share_inbox(),
--     public.knowledge_project_member_users(uuid), public.knowledge_share_is_live(uuid, timestamptz),
--     public.knowledge_fact_share_level(text, text, text, jsonb, boolean, boolean),
--     public.knowledge_share_events_log();
--   DROP TABLE IF EXISTS public.knowledge_share_events, public.knowledge_shares;
--   DROP INDEX IF EXISTS public.knowledge_record_links_by_record;

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. "Who else linked this task/doc" needs an index that doesn't lead with the owner.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS knowledge_record_links_by_record
	ON public.knowledge_record_links (record_kind, record_id)
	INCLUDE (owner_user_id, entity_id);

-- ---------------------------------------------------------------------------
-- 2. Asks and grants
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_shares (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- The entry's owner (the one who decides).
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	-- The project the ask came from / the grant is scoped to.
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	-- Who sees it; NULL = every current member of project_id.
	grantee_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	requested_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	status text NOT NULL CHECK (status IN ('requested', 'granted', 'declined', 'canceled', 'revoked')),
	-- contact = email/phone/address; all = every askable fact; picked = predicates below.
	what text NOT NULL DEFAULT 'contact' CHECK (what IN ('contact', 'all', 'picked')),
	predicates text[] NOT NULL DEFAULT '{}',
	-- membership = while both are members of project_id (checked live); always; until expires_at.
	duration text NOT NULL DEFAULT 'membership' CHECK (duration IN ('membership', 'always', 'until')),
	expires_at timestamptz,
	via text NOT NULL DEFAULT 'web' CHECK (via IN ('web', 'agent')),
	created_at timestamptz NOT NULL DEFAULT now(),
	decided_at timestamptz,
	revoked_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_shares_audience CHECK (grantee_user_id IS NOT NULL OR project_id IS NOT NULL),
	CONSTRAINT knowledge_shares_membership_needs_project CHECK (duration <> 'membership' OR project_id IS NOT NULL),
	CONSTRAINT knowledge_shares_until_needs_date CHECK (duration <> 'until' OR expires_at IS NOT NULL),
	CONSTRAINT knowledge_shares_picked_needs_predicates CHECK (what <> 'picked' OR cardinality(predicates) > 0),
	CONSTRAINT knowledge_shares_not_self CHECK (grantee_user_id IS DISTINCT FROM owner_user_id)
);

-- One open ask per person per entry.
CREATE UNIQUE INDEX knowledge_shares_one_open_ask
	ON public.knowledge_shares (entity_id, requested_by_user_id)
	WHERE status = 'requested';
CREATE INDEX knowledge_shares_entity_live
	ON public.knowledge_shares (entity_id) WHERE status IN ('requested', 'granted');
CREATE INDEX knowledge_shares_owner ON public.knowledge_shares (owner_user_id, status, created_at DESC);
CREATE INDEX knowledge_shares_grantee
	ON public.knowledge_shares (grantee_user_id) WHERE grantee_user_id IS NOT NULL;

-- Folding this project into another: grants and asks stay with the archived source and lapse with
-- it (membership is checked live); owners share again in the destination if they want.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'knowledge_shares', 'project_id', 'leave_behind',
				'Knowledge grants are scoped to the archived source and lapse with it; the owner shares again in the destination.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

COMMENT ON TABLE public.knowledge_shares IS
	'Asks and grants to see more of one knowledge entry (tasker 168). Written only through the knowledge_*_share functions.';

ALTER TABLE public.knowledge_shares ENABLE ROW LEVEL SECURITY;

-- The owner sees every ask and grant on their entries; the asker / grantee sees their own.
CREATE POLICY knowledge_shares_parties_read ON public.knowledge_shares
	FOR SELECT TO authenticated
	USING (
		owner_user_id = (SELECT auth.uid())
		OR grantee_user_id = (SELECT auth.uid())
		OR requested_by_user_id = (SELECT auth.uid())
	);

REVOKE ALL ON TABLE public.knowledge_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.knowledge_shares TO authenticated;
GRANT ALL ON TABLE public.knowledge_shares TO service_role;

-- ---------------------------------------------------------------------------
-- 3. History (trigger-written; no per-read logging)
-- ---------------------------------------------------------------------------
CREATE TABLE public.knowledge_share_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	share_id uuid NOT NULL REFERENCES public.knowledge_shares(id) ON DELETE CASCADE,
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	event text NOT NULL CHECK (event IN ('requested', 'granted', 'declined', 'canceled', 'revoked', 'changed')),
	detail jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_share_events_share ON public.knowledge_share_events (share_id, created_at);
CREATE INDEX knowledge_share_events_owner ON public.knowledge_share_events (owner_user_id, created_at DESC);

ALTER TABLE public.knowledge_share_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_share_events_owner_read ON public.knowledge_share_events
	FOR SELECT TO authenticated
	USING (owner_user_id = (SELECT auth.uid()));
REVOKE ALL ON TABLE public.knowledge_share_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.knowledge_share_events TO authenticated;
GRANT ALL ON TABLE public.knowledge_share_events TO service_role;

CREATE OR REPLACE FUNCTION public.knowledge_share_events_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_event text;
BEGIN
	IF TG_OP = 'INSERT' THEN
		v_event := CASE NEW.status WHEN 'requested' THEN 'requested' ELSE 'granted' END;
	ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
		v_event := NEW.status;
	ELSIF NEW.what IS DISTINCT FROM OLD.what OR NEW.predicates IS DISTINCT FROM OLD.predicates
		OR NEW.duration IS DISTINCT FROM OLD.duration OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
		v_event := 'changed';
	ELSE
		RETURN NEW;
	END IF;
	INSERT INTO public.knowledge_share_events (share_id, owner_user_id, actor_user_id, event, detail)
	VALUES (
		NEW.id, NEW.owner_user_id, auth.uid(), v_event,
		jsonb_build_object(
			'what', NEW.what, 'predicates', to_jsonb(NEW.predicates), 'duration', NEW.duration,
			'expires_at', NEW.expires_at, 'project_id', NEW.project_id,
			'grantee_user_id', NEW.grantee_user_id, 'via', NEW.via
		)
	);
	RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_shares_log
	AFTER INSERT OR UPDATE ON public.knowledge_shares
	FOR EACH ROW EXECUTE FUNCTION public.knowledge_share_events_log();

REVOKE ALL ON FUNCTION public.knowledge_share_events_log() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The rule table: what a fellow member sees of one fact on someone else's entry
-- ---------------------------------------------------------------------------
-- shared   shown by default
-- request  counted ("2 contact details · Ask"), shown only with a grant
-- never    never leaves the owner's graph (notes, knows, birthdays)
-- owner    unverified (suggested / disputed / superseded): not shown, not counted
-- A fact read from THIS project's own task or doc is always shared (members can read the text).
-- A fact that would be shared but has no public-web source (contacts import, chat, typed by
-- the owner, another project's records) drops to request.
CREATE OR REPLACE FUNCTION public.knowledge_fact_share_level(
	p_predicate text,
	p_subject_kind text,
	p_status text,
	p_qualifiers jsonb,
	p_has_public_source boolean,
	p_has_project_source boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
	SELECT CASE
		WHEN p_predicate IN ('note', 'knows', 'birthday') THEN 'never'
		WHEN p_status IS DISTINCT FROM 'active' THEN 'owner'
		WHEN p_has_project_source THEN 'shared'
		WHEN (
			-- People: their professional, public face only.
			(p_subject_kind = 'person' AND p_predicate IN (
				'alias', 'description', 'headline', 'homepage', 'profile_url', 'url', 'thumbnail_url', 'owns'
			))
			OR (p_subject_kind = 'person' AND p_predicate = 'works_at'
				AND coalesce(p_qualifiers ->> 'current', 'true') <> 'false'
				AND NOT (coalesce(p_qualifiers, '{}'::jsonb) ? 'end'))
			-- Everything else (orgs, places, websites, media): all but loose links.
			OR (p_subject_kind <> 'person' AND p_predicate <> 'related_to')
		) THEN CASE WHEN p_has_public_source THEN 'shared' ELSE 'request' END
		ELSE 'request'
	END
$$;

REVOKE ALL ON FUNCTION public.knowledge_fact_share_level(text, text, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_fact_share_level(text, text, text, jsonb, boolean, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Helpers (server-only)
-- ---------------------------------------------------------------------------
-- Users who can currently open a project: its creator and every member not removed.
CREATE OR REPLACE FUNCTION public.knowledge_project_member_users(p_project uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT a.user_id
	FROM public.onto_projects p
	JOIN public.onto_actors a ON a.id = p.created_by
	WHERE p.id = p_project AND p.deleted_at IS NULL AND a.user_id IS NOT NULL
	UNION
	SELECT a.user_id
	FROM public.onto_project_members m
	JOIN public.onto_projects p ON p.id = m.project_id AND p.deleted_at IS NULL
	JOIN public.onto_actors a ON a.id = m.actor_id
	WHERE m.project_id = p_project AND m.removed_at IS NULL AND a.user_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.knowledge_project_member_users(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_project_member_users(uuid) TO service_role;

-- Whether a granted share still applies to this viewer right now.
CREATE OR REPLACE FUNCTION public.knowledge_share_is_live(p_share uuid, p_viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT EXISTS (
		SELECT 1 FROM public.knowledge_shares s
		WHERE s.id = p_share
			AND s.status = 'granted'
			AND (s.expires_at IS NULL OR s.expires_at > now())
			AND (
				s.grantee_user_id = p_viewer
				OR (s.grantee_user_id IS NULL
					AND p_viewer IN (SELECT public.knowledge_project_member_users(s.project_id)))
			)
			AND (
				s.duration <> 'membership'
				OR (
					p_viewer IN (SELECT public.knowledge_project_member_users(s.project_id))
					AND s.owner_user_id IN (SELECT public.knowledge_project_member_users(s.project_id))
				)
			)
	)
$$;

REVOKE ALL ON FUNCTION public.knowledge_share_is_live(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_share_is_live(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The project lens
-- ---------------------------------------------------------------------------
-- What other current members' entries show for the names on these records (tasks or docs of
-- p_project). The viewer must be a current member. Records outside the project are ignored.
-- Returns { entries: [ { owner: {user_id, name}, entity: {id, kind, name, summary},
--   record_ids, quotes, facts: [{id, predicate, value, object_name, object_kind, qualifiers,
--   via: 'project'|'web'|'grant'}], hidden: {contact, other}, ask: {id, status, created_at} |
--   null, grant: {id, what, duration, expires_at} | null } ] }
CREATE OR REPLACE FUNCTION public.knowledge_project_lens(
	p_project uuid,
	p_record_kind text,
	p_record_ids uuid[],
	p_viewer uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_result jsonb;
BEGIN
	IF p_record_kind NOT IN ('task', 'document') THEN
		RAISE EXCEPTION 'Unsupported record kind' USING ERRCODE = '22023';
	END IF;
	IF NOT v_viewer IN (SELECT public.knowledge_project_member_users(p_project)) THEN
		RAISE EXCEPTION 'Not a member of this project' USING ERRCODE = '42501';
	END IF;

	WITH members AS (
		SELECT public.knowledge_project_member_users(p_project) AS user_id
	),
	-- Only this project's records (never trust the ids the caller sent).
	records AS (
		SELECT t.id FROM public.onto_tasks t
		WHERE p_record_kind = 'task' AND t.id = ANY (p_record_ids[1:100])
			AND t.project_id = p_project AND t.deleted_at IS NULL
		UNION
		SELECT d.id FROM public.onto_documents d
		WHERE p_record_kind = 'document' AND d.id = ANY (p_record_ids[1:100])
			AND d.project_id = p_project AND d.deleted_at IS NULL
	),
	project_records AS (
		SELECT t.id FROM public.onto_tasks t WHERE t.project_id = p_project
		UNION ALL
		SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_project
	),
	links AS (
		SELECT l.owner_user_id, l.entity_id,
			array_agg(DISTINCT l.record_id) AS record_ids,
			array_remove(array_agg(DISTINCT l.quote), NULL) AS quotes
		FROM public.knowledge_record_links l
		JOIN records r ON r.id = l.record_id
		WHERE l.record_kind = p_record_kind
			AND l.owner_user_id <> v_viewer
			AND l.owner_user_id IN (SELECT user_id FROM members)
		GROUP BY l.owner_user_id, l.entity_id
	),
	entries AS (
		SELECT k.*, e.kind, e.name, e.summary
		FROM links k
		JOIN public.knowledge_entities e ON e.id = k.entity_id
		WHERE e.scope = 'private' AND e.owner_user_id = k.owner_user_id AND e.status = 'active'
	),
	grants AS (
		SELECT DISTINCT ON (s.entity_id) s.entity_id, s.id, s.what, s.predicates, s.duration, s.expires_at
		FROM public.knowledge_shares s
		WHERE s.entity_id IN (SELECT entity_id FROM entries)
			AND public.knowledge_share_is_live(s.id, v_viewer)
		ORDER BY s.entity_id, (s.what = 'all') DESC, s.decided_at DESC NULLS LAST
	),
	asks AS (
		SELECT DISTINCT ON (s.entity_id) s.entity_id, s.id, s.status, s.created_at
		FROM public.knowledge_shares s
		WHERE s.entity_id IN (SELECT entity_id FROM entries)
			AND s.requested_by_user_id = v_viewer
			AND s.status IN ('requested', 'declined')
			AND (s.status <> 'requested' OR s.created_at > now() - interval '14 days')
		ORDER BY s.entity_id, s.created_at DESC
	),
	facts AS (
		SELECT f.id, f.entity_id, f.predicate, f.value_text, f.qualifiers, o.name AS object_name,
			o.kind AS object_kind, en.kind AS subject_kind,
			public.knowledge_fact_share_level(
				f.predicate, en.kind, f.status, f.qualifiers,
				EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
				),
				EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('task', 'document')
						AND src.record_id IN (SELECT id FROM project_records)
				)
			) AS level
		FROM public.knowledge_facts f
		JOIN entries en ON en.entity_id = f.entity_id
		LEFT JOIN public.knowledge_entities o ON o.id = f.object_entity_id
		WHERE f.owner_user_id = en.owner_user_id
			-- A link to the owner's own person entry ("Me") says nothing about the name.
			AND (o.id IS NULL OR NOT o.is_self)
	),
	judged AS (
		SELECT f.*,
			CASE
				WHEN f.level = 'shared' THEN 'project_or_web'
				WHEN f.level = 'request' AND g.id IS NOT NULL AND (
					g.what = 'all'
					OR (g.what = 'contact' AND f.predicate IN ('email', 'phone', 'address'))
					OR f.predicate = ANY (g.predicates)
				) THEN 'grant'
				ELSE NULL
			END AS shown_via
		FROM facts f
		LEFT JOIN grants g ON g.entity_id = f.entity_id
	)
	SELECT jsonb_build_object('entries', coalesce(jsonb_agg(entry ORDER BY entry ->> 'sort'), '[]'::jsonb))
	INTO v_result
	FROM (
		SELECT jsonb_build_object(
			'sort', en.name,
			'owner', jsonb_build_object(
				'user_id', en.owner_user_id,
				'name', public.people_layer_display_name(en.owner_user_id)
			),
			'entity', jsonb_build_object('id', en.entity_id, 'kind', en.kind, 'name', en.name, 'summary', en.summary),
			'record_ids', to_jsonb(en.record_ids),
			'quotes', to_jsonb(en.quotes[1:5]),
			'facts', coalesce((
				SELECT jsonb_agg(jsonb_build_object(
					'id', j.id, 'predicate', j.predicate, 'value', j.value_text,
					'object_name', j.object_name, 'object_kind', j.object_kind,
					'qualifiers', j.qualifiers,
					'via', CASE WHEN j.shown_via = 'grant' THEN 'grant' ELSE 'shared' END
				) ORDER BY j.predicate)
				FROM judged j WHERE j.entity_id = en.entity_id AND j.shown_via IS NOT NULL
			), '[]'::jsonb),
			'hidden', jsonb_build_object(
				'contact', (SELECT count(*) FROM judged j WHERE j.entity_id = en.entity_id
					AND j.level = 'request' AND j.shown_via IS NULL
					AND j.predicate IN ('email', 'phone', 'address')),
				'other', (SELECT count(*) FROM judged j WHERE j.entity_id = en.entity_id
					AND j.level = 'request' AND j.shown_via IS NULL
					AND j.predicate NOT IN ('email', 'phone', 'address'))
			),
			'ask', (SELECT jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at)
				FROM asks a WHERE a.entity_id = en.entity_id),
			'grant', (SELECT jsonb_build_object('id', g.id, 'what', g.what, 'duration', g.duration, 'expires_at', g.expires_at)
				FROM grants g WHERE g.entity_id = en.entity_id)
		) AS entry
		FROM entries en
	) rows_;

	RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_project_lens(uuid, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_project_lens(uuid, text, uuid[], uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Ask (signed-in or an agent acting for the viewer)
-- ---------------------------------------------------------------------------
-- Statuses: requested (new or merged into the open ask) | declined (owner said no; silent, no
-- new ask) | already_shared | not_found (no such entry on this project's work for this viewer).
CREATE OR REPLACE FUNCTION public.knowledge_request_share(
	p_entity uuid,
	p_project uuid,
	p_what text DEFAULT 'contact',
	p_viewer uuid DEFAULT NULL,
	p_via text DEFAULT 'web'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_owner uuid;
	v_open public.knowledge_shares%ROWTYPE;
	v_id uuid;
BEGIN
	IF p_what NOT IN ('contact', 'all') THEN
		RAISE EXCEPTION 'Ask for contact details or everything' USING ERRCODE = '22023';
	END IF;
	IF p_via NOT IN ('web', 'agent') THEN
		RAISE EXCEPTION 'Invalid via' USING ERRCODE = '22023';
	END IF;
	IF NOT v_viewer IN (SELECT public.knowledge_project_member_users(p_project)) THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	-- Only an entry another current member linked to this project's tasks or docs: you can ask
	-- about names you can see in the project, never probe arbitrary entries.
	SELECT e.owner_user_id INTO v_owner
	FROM public.knowledge_entities e
	WHERE e.id = p_entity AND e.scope = 'private' AND e.status = 'active'
		AND e.owner_user_id <> v_viewer
		AND e.owner_user_id IN (SELECT public.knowledge_project_member_users(p_project))
		AND EXISTS (
			SELECT 1 FROM public.knowledge_record_links l
			WHERE l.entity_id = e.id AND l.owner_user_id = e.owner_user_id
				AND (
					(l.record_kind = 'task' AND l.record_id IN (
						SELECT id FROM public.onto_tasks WHERE project_id = p_project AND deleted_at IS NULL))
					OR (l.record_kind = 'document' AND l.record_id IN (
						SELECT id FROM public.onto_documents WHERE project_id = p_project AND deleted_at IS NULL))
				)
		);
	IF v_owner IS NULL THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	-- Already open to this viewer for what they asked.
	IF EXISTS (
		SELECT 1 FROM public.knowledge_shares s
		WHERE s.entity_id = p_entity AND public.knowledge_share_is_live(s.id, v_viewer)
			AND (s.what = 'all' OR s.what = p_what)
	) THEN
		RETURN jsonb_build_object('status', 'already_shared');
	END IF;

	-- The owner said no in the last 30 days: stay quiet, don't nag.
	IF EXISTS (
		SELECT 1 FROM public.knowledge_shares s
		WHERE s.entity_id = p_entity AND s.requested_by_user_id = v_viewer
			AND s.status = 'declined' AND s.decided_at > now() - interval '30 days'
	) THEN
		RETURN jsonb_build_object('status', 'declined');
	END IF;

	-- Merge into the open ask (widening contact → all), or expire a stale one and start fresh.
	SELECT * INTO v_open FROM public.knowledge_shares s
	WHERE s.entity_id = p_entity AND s.requested_by_user_id = v_viewer AND s.status = 'requested'
	FOR UPDATE;
	IF FOUND AND v_open.created_at > now() - interval '14 days' THEN
		IF p_what = 'all' AND v_open.what <> 'all' THEN
			UPDATE public.knowledge_shares SET what = 'all', updated_at = now() WHERE id = v_open.id;
		END IF;
		RETURN jsonb_build_object('status', 'requested', 'id', v_open.id, 'merged', true);
	ELSIF FOUND THEN
		UPDATE public.knowledge_shares SET status = 'canceled', updated_at = now() WHERE id = v_open.id;
	END IF;

	-- Rate limit: 30 open asks per person.
	IF (SELECT count(*) FROM public.knowledge_shares s
		WHERE s.requested_by_user_id = v_viewer AND s.status = 'requested'
			AND s.created_at > now() - interval '14 days') >= 30 THEN
		RETURN jsonb_build_object('status', 'rate_limited');
	END IF;

	INSERT INTO public.knowledge_shares (
		owner_user_id, entity_id, project_id, grantee_user_id, requested_by_user_id,
		status, what, duration, via
	) VALUES (
		v_owner, p_entity, p_project, v_viewer, v_viewer, 'requested', p_what, 'membership', p_via
	) RETURNING id INTO v_id;
	RETURN jsonb_build_object('status', 'requested', 'id', v_id, 'merged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_request_share(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_request_share(uuid, uuid, text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Owner decisions (signed-in humans only; never the service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_require_signed_in()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := auth.uid();
BEGIN
	IF v_uid IS NULL THEN
		RAISE EXCEPTION 'Sign in to share' USING ERRCODE = '42501';
	END IF;
	RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_require_signed_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_require_signed_in() TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_validate_share_terms(
	p_what text, p_predicates text[], p_duration text, p_expires_at timestamptz, p_project uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF p_what NOT IN ('contact', 'all', 'picked') THEN
		RAISE EXCEPTION 'Invalid share' USING ERRCODE = '22023';
	END IF;
	IF p_what = 'picked' AND coalesce(cardinality(p_predicates), 0) = 0 THEN
		RAISE EXCEPTION 'Pick what to share' USING ERRCODE = '22023';
	END IF;
	IF p_predicates && ARRAY['note', 'knows', 'birthday'] THEN
		RAISE EXCEPTION 'Notes, birthdays and who you know are never shared' USING ERRCODE = '22023';
	END IF;
	IF p_duration NOT IN ('membership', 'always', 'until') THEN
		RAISE EXCEPTION 'Invalid duration' USING ERRCODE = '22023';
	END IF;
	IF p_duration = 'membership' AND p_project IS NULL THEN
		RAISE EXCEPTION 'Pick a project' USING ERRCODE = '22023';
	END IF;
	IF p_duration = 'until' AND (p_expires_at IS NULL OR p_expires_at <= now()) THEN
		RAISE EXCEPTION 'Pick a date in the future' USING ERRCODE = '22023';
	END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_validate_share_terms(text, text[], text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_validate_share_terms(text, text[], text, timestamptz, uuid) TO authenticated;

-- Approve or decline an ask on your own entry.
CREATE OR REPLACE FUNCTION public.knowledge_decide_share(
	p_share uuid,
	p_decision text,
	p_what text DEFAULT NULL,
	p_predicates text[] DEFAULT '{}',
	p_duration text DEFAULT 'membership',
	p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := public.knowledge_require_signed_in();
	v_share public.knowledge_shares%ROWTYPE;
	v_what text;
BEGIN
	SELECT * INTO v_share FROM public.knowledge_shares WHERE id = p_share FOR UPDATE;
	IF NOT FOUND OR v_share.owner_user_id <> v_uid THEN
		RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
	END IF;
	IF v_share.status <> 'requested' THEN
		RETURN jsonb_build_object('status', v_share.status, 'id', v_share.id);
	END IF;
	IF p_decision = 'decline' THEN
		UPDATE public.knowledge_shares
		SET status = 'declined', decided_at = now(), updated_at = now() WHERE id = p_share;
		RETURN jsonb_build_object('status', 'declined', 'id', p_share);
	ELSIF p_decision <> 'grant' THEN
		RAISE EXCEPTION 'Grant or decline' USING ERRCODE = '22023';
	END IF;
	v_what := coalesce(p_what, v_share.what);
	PERFORM public.knowledge_validate_share_terms(
		v_what, p_predicates, p_duration, p_expires_at, v_share.project_id
	);
	UPDATE public.knowledge_shares
	SET status = 'granted', what = v_what,
		predicates = CASE WHEN v_what = 'picked' THEN p_predicates ELSE '{}' END,
		duration = p_duration,
		expires_at = CASE WHEN p_duration = 'until' THEN p_expires_at ELSE NULL END,
		decided_at = now(), updated_at = now()
	WHERE id = p_share;
	RETURN jsonb_build_object('status', 'granted', 'id', p_share);
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_decide_share(uuid, text, text, text[], text, timestamptz) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_decide_share(uuid, text, text, text[], text, timestamptz) TO authenticated;

-- Share without being asked: with one person (p_grantee) or everyone in a project (NULL).
CREATE OR REPLACE FUNCTION public.knowledge_share_entity(
	p_entity uuid,
	p_project uuid,
	p_grantee uuid DEFAULT NULL,
	p_what text DEFAULT 'contact',
	p_predicates text[] DEFAULT '{}',
	p_duration text DEFAULT 'membership',
	p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := public.knowledge_require_signed_in();
	v_id uuid;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM public.knowledge_entities
		WHERE id = p_entity AND owner_user_id = v_uid AND scope = 'private' AND status = 'active'
	) THEN
		RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
	END IF;
	PERFORM public.knowledge_validate_share_terms(p_what, p_predicates, p_duration, p_expires_at, p_project);
	IF p_project IS NOT NULL AND NOT v_uid IN (SELECT public.knowledge_project_member_users(p_project)) THEN
		RAISE EXCEPTION 'Not a member of this project' USING ERRCODE = '42501';
	END IF;
	IF p_grantee IS NOT NULL AND p_project IS NOT NULL
		AND NOT p_grantee IN (SELECT public.knowledge_project_member_users(p_project)) THEN
		RAISE EXCEPTION 'They are not in this project' USING ERRCODE = '22023';
	END IF;
	IF p_grantee IS NULL AND p_project IS NULL THEN
		RAISE EXCEPTION 'Share with a person or a project' USING ERRCODE = '22023';
	END IF;
	IF p_grantee = v_uid THEN
		RAISE EXCEPTION 'That is you' USING ERRCODE = '22023';
	END IF;
	INSERT INTO public.knowledge_shares (
		owner_user_id, entity_id, project_id, grantee_user_id, requested_by_user_id, status,
		what, predicates, duration, expires_at, decided_at
	) VALUES (
		v_uid, p_entity, p_project, p_grantee, NULL, 'granted', p_what,
		CASE WHEN p_what = 'picked' THEN p_predicates ELSE '{}' END,
		p_duration, CASE WHEN p_duration = 'until' THEN p_expires_at ELSE NULL END, now()
	) RETURNING id INTO v_id;
	-- A waiting ask from that person on this entry is answered by this grant.
	IF p_grantee IS NOT NULL THEN
		UPDATE public.knowledge_shares SET status = 'canceled', updated_at = now()
		WHERE entity_id = p_entity AND requested_by_user_id = p_grantee AND status = 'requested';
	END IF;
	RETURN jsonb_build_object('status', 'granted', 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_share_entity(uuid, uuid, uuid, text, text[], text, timestamptz) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_share_entity(uuid, uuid, uuid, text, text[], text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.knowledge_revoke_share(p_share uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := public.knowledge_require_signed_in();
BEGIN
	UPDATE public.knowledge_shares
	SET status = 'revoked', revoked_at = now(), updated_at = now()
	WHERE id = p_share AND owner_user_id = v_uid AND status = 'granted';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
	END IF;
	RETURN jsonb_build_object('status', 'revoked', 'id', p_share);
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_revoke_share(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_revoke_share(uuid) TO authenticated;

-- The asker withdraws (web or their agent).
CREATE OR REPLACE FUNCTION public.knowledge_cancel_share_request(p_share uuid, p_viewer uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
BEGIN
	UPDATE public.knowledge_shares
	SET status = 'canceled', updated_at = now()
	WHERE id = p_share AND requested_by_user_id = v_viewer AND status = 'requested';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
	END IF;
	RETURN jsonb_build_object('status', 'canceled', 'id', p_share);
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_cancel_share_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_cancel_share_request(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. "Who can see Kyle" (owner) and the owner's inbox
-- ---------------------------------------------------------------------------
-- { projects: [{ project_id, project_name, members: [{user_id, name}] }]  -- shared by default
--   shares: [{ id, status, what, predicates, duration, expires_at, project_id, project_name,
--              grantee: {user_id, name} | null, requested_by: {user_id, name} | null,
--              created_at, decided_at, live }] }
CREATE OR REPLACE FUNCTION public.knowledge_entity_shares(p_entity uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := public.knowledge_require_signed_in();
	v_projects jsonb;
	v_shares jsonb;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.knowledge_entities WHERE id = p_entity AND owner_user_id = v_uid) THEN
		RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
	END IF;

	-- Projects where this entry is linked to work and other people are members.
	SELECT coalesce(jsonb_agg(jsonb_build_object(
		'project_id', p.id, 'project_name', p.name,
		'members', (
			SELECT coalesce(jsonb_agg(jsonb_build_object(
				'user_id', m.user_id, 'name', public.people_layer_display_name(m.user_id))), '[]'::jsonb)
			FROM public.knowledge_project_member_users(p.id) AS m(user_id)
			WHERE m.user_id <> v_uid
		)
	) ORDER BY p.name), '[]'::jsonb)
	INTO v_projects
	FROM public.onto_projects p
	WHERE p.deleted_at IS NULL
		AND p.id IN (
			SELECT t.project_id FROM public.knowledge_record_links l
			JOIN public.onto_tasks t ON t.id = l.record_id AND l.record_kind = 'task'
			WHERE l.entity_id = p_entity AND l.owner_user_id = v_uid
			UNION
			SELECT d.project_id FROM public.knowledge_record_links l
			JOIN public.onto_documents d ON d.id = l.record_id AND l.record_kind = 'document'
			WHERE l.entity_id = p_entity AND l.owner_user_id = v_uid
		)
		AND EXISTS (
			SELECT 1 FROM public.knowledge_project_member_users(p.id) AS m(user_id) WHERE m.user_id <> v_uid
		);

	SELECT coalesce(jsonb_agg(jsonb_build_object(
		'id', s.id, 'status', s.status, 'what', s.what, 'predicates', to_jsonb(s.predicates),
		'duration', s.duration, 'expires_at', s.expires_at,
		'project_id', s.project_id, 'project_name', p.name,
		'grantee', CASE WHEN s.grantee_user_id IS NULL THEN NULL ELSE jsonb_build_object(
			'user_id', s.grantee_user_id, 'name', public.people_layer_display_name(s.grantee_user_id)) END,
		'requested_by', CASE WHEN s.requested_by_user_id IS NULL THEN NULL ELSE jsonb_build_object(
			'user_id', s.requested_by_user_id, 'name', public.people_layer_display_name(s.requested_by_user_id)) END,
		'created_at', s.created_at, 'decided_at', s.decided_at,
		'live', CASE WHEN s.status <> 'granted' THEN false
			WHEN s.expires_at IS NOT NULL AND s.expires_at <= now() THEN false
			WHEN s.duration = 'membership' AND NOT (
				v_uid IN (SELECT public.knowledge_project_member_users(s.project_id))
				AND (s.grantee_user_id IS NULL
					OR s.grantee_user_id IN (SELECT public.knowledge_project_member_users(s.project_id)))
			) THEN false
			ELSE true END
	) ORDER BY s.created_at DESC), '[]'::jsonb)
	INTO v_shares
	FROM public.knowledge_shares s
	LEFT JOIN public.onto_projects p ON p.id = s.project_id
	WHERE s.entity_id = p_entity AND s.owner_user_id = v_uid
		AND (s.status IN ('requested', 'granted') OR s.updated_at > now() - interval '30 days')
		AND (s.status <> 'requested' OR s.created_at > now() - interval '14 days');

	RETURN jsonb_build_object('projects', v_projects, 'shares', v_shares);
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_entity_shares(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_entity_shares(uuid) TO authenticated;

-- Waiting asks on the signed-in user's entries, newest first (the /people inbox and card badges).
CREATE OR REPLACE FUNCTION public.knowledge_share_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := public.knowledge_require_signed_in();
	v_result jsonb;
BEGIN
	SELECT coalesce(jsonb_agg(jsonb_build_object(
		'id', s.id, 'what', s.what, 'via', s.via, 'created_at', s.created_at,
		'entity', jsonb_build_object('id', e.id, 'kind', e.kind, 'name', e.name),
		'project', jsonb_build_object('id', p.id, 'name', p.name),
		'requested_by', jsonb_build_object(
			'user_id', s.requested_by_user_id,
			'name', public.people_layer_display_name(s.requested_by_user_id))
	) ORDER BY s.created_at DESC), '[]'::jsonb)
	INTO v_result
	FROM public.knowledge_shares s
	JOIN public.knowledge_entities e ON e.id = s.entity_id
	LEFT JOIN public.onto_projects p ON p.id = s.project_id
	WHERE s.owner_user_id = v_uid AND s.status = 'requested'
		AND s.created_at > now() - interval '14 days';
	RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_share_inbox() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_share_inbox() TO authenticated;

COMMIT;
