-- supabase/migrations/20261024020000_builder_profiles.sql
--
-- Builder profiles (DJ, 10-23; spec docs/specs/BUILDER_PROFILE_SPEC_2026-10-23.md).
-- A public page at build-os.com/@handle: header, links, the projects the owner picked,
-- a build log of active days, public pages, and who they build with. Visitors can follow
-- a person or a project and ask to join (ask = an ordinary people_requests row).
--
-- * Everything is private until the owner publishes. Each project starts hidden; the
--   owner lists it (name, pitch, stage) or makes it live (goals, next milestone, a
--   weekly line, what they're looking for).
-- * Only a project's owner can put it on a page (trigger), and the read path re-checks
--   ownership, so a transferred or archived project drops off by itself.
-- * Public text is owner-written or drafted by BuildOS and approved. Raw task titles and
--   member names never leave the database through this page.
-- * Two audiences: anyone, and people the owner works with (shares an active project).
-- * Writes go through the server (service_role); signed-in users read their own rows.
-- * One read function, get_builder_profile(handle), serves anonymous and signed-in
--   visitors and fails closed: unknown, unpublished, and malformed handles look the same.
-- * The build log reads a per-user daily rollup of the user's own changes (and their
--   agents'), rebuilt by refresh_builder_profile_activity, never on page view.

BEGIN;
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.builder_profiles (
	user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
	headline text NULL CHECK (headline IS NULL OR char_length(headline) <= 120),
	location text NULL CHECK (location IS NULL OR char_length(location) <= 80),
	avatar_url text NULL CHECK (
		avatar_url IS NULL OR (char_length(avatar_url) <= 600 AND avatar_url ~ '^https://[^[:space:]]+$')
	),
	now_text text NULL CHECK (now_text IS NULL OR char_length(now_text) <= 160),
	now_updated_at timestamptz NULL,
	show_build_log boolean NOT NULL DEFAULT true,
	build_log_includes_private boolean NOT NULL DEFAULT false,
	show_agent_split boolean NOT NULL DEFAULT true,
	show_writing boolean NOT NULL DEFAULT true,
	show_builds_with boolean NOT NULL DEFAULT true,
	show_on_collaborator_pages boolean NOT NULL DEFAULT false,
	weekly_drafts boolean NOT NULL DEFAULT true,
	published_at timestamptz NULL,
	activity_refreshed_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.builder_profiles IS
	'A user''s public builder page at /@handle. Private until status = published. Bio and name live on users.';

CREATE TABLE IF NOT EXISTS public.builder_profile_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('social', 'link')),
	url text NOT NULL CHECK (char_length(url) <= 600 AND url ~* '^https?://[^[:space:]]+$'),
	label text NULL CHECK (label IS NULL OR char_length(label) <= 80),
	note text NULL CHECK (note IS NULL OR char_length(note) <= 120),
	audience text NOT NULL DEFAULT 'anyone' CHECK (audience IN ('anyone', 'collaborators')),
	position integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_builder_profile_links_user
	ON public.builder_profile_links (user_id, position);

CREATE TABLE IF NOT EXISTS public.builder_profile_projects (
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	level text NOT NULL CHECK (level IN ('listed', 'live')),
	public_name text NULL CHECK (public_name IS NULL OR char_length(public_name) <= 80),
	pitch text NULL CHECK (pitch IS NULL OR char_length(pitch) <= 200),
	looking_for text NULL CHECK (looking_for IS NULL OR char_length(looking_for) <= 200),
	link_url text NULL CHECK (
		link_url IS NULL OR (char_length(link_url) <= 600 AND link_url ~* '^https?://[^[:space:]]+$')
	),
	goal_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(goal_ids) <= 3),
	show_next_milestone boolean NOT NULL DEFAULT true,
	this_week text NULL CHECK (this_week IS NULL OR char_length(this_week) <= 220),
	this_week_at timestamptz NULL,
	audience text NOT NULL DEFAULT 'anyone' CHECK (audience IN ('anyone', 'collaborators')),
	position integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_builder_profile_projects_project
	ON public.builder_profile_projects (project_id);

-- Drafted and published lines: the Now line (project_id NULL) and one line per live
-- project. Published rows are what followers see in their brief.
CREATE TABLE IF NOT EXISTS public.builder_profile_updates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	project_id uuid NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 220),
	status text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'published', 'skipped')),
	source text NOT NULL DEFAULT 'drafted' CHECK (source IN ('drafted', 'owner')),
	week_of date NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	decided_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_builder_profile_updates_user_created
	ON public.builder_profile_updates (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_profile_updates_published
	ON public.builder_profile_updates (user_id, decided_at DESC)
	WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.builder_follows (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	follower_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	-- NULL = the whole person; otherwise one live project on their page.
	project_id uuid NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT builder_follows_not_self CHECK (follower_user_id <> target_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_builder_follows
	ON public.builder_follows (
		follower_user_id,
		target_user_id,
		COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
	);
CREATE INDEX IF NOT EXISTS idx_builder_follows_target
	ON public.builder_follows (target_user_id, created_at DESC);

-- The user's own changes (and their agents') per day per project. No FK on project_id:
-- rows are rebuilt wholesale, and deleted projects simply count as private work.
CREATE TABLE IF NOT EXISTS public.builder_profile_activity_daily (
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	day date NOT NULL,
	project_id uuid NOT NULL,
	changes integer NOT NULL CHECK (changes >= 0),
	by_agents integer NOT NULL CHECK (by_agents >= 0),
	PRIMARY KEY (user_id, day, project_id)
);

CREATE TABLE IF NOT EXISTS public.builder_profile_stats_daily (
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	day date NOT NULL,
	views integer NOT NULL DEFAULT 0,
	link_taps integer NOT NULL DEFAULT 0,
	follows integer NOT NULL DEFAULT 0,
	asks integer NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, day)
);

DROP TRIGGER IF EXISTS trg_builder_profiles_updated_at ON public.builder_profiles;
CREATE TRIGGER trg_builder_profiles_updated_at
	BEFORE UPDATE ON public.builder_profiles
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_builder_profile_links_updated_at ON public.builder_profile_links;
CREATE TRIGGER trg_builder_profile_links_updated_at
	BEFORE UPDATE ON public.builder_profile_links
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_builder_profile_projects_updated_at ON public.builder_profile_projects;
CREATE TRIGGER trg_builder_profile_projects_updated_at
	BEFORE UPDATE ON public.builder_profile_projects
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Only a project's owner can put it on a page
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.builder_profile_user_owns_project(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM public.onto_project_members AS m
		JOIN public.onto_actors AS a ON a.id = m.actor_id
		JOIN public.onto_projects AS p ON p.id = m.project_id
		WHERE m.project_id = p_project_id
			AND a.user_id = p_user_id
			AND m.role_key = 'owner'
			AND m.removed_at IS NULL
			AND p.deleted_at IS NULL
	);
$$;

CREATE OR REPLACE FUNCTION public.builder_profile_projects_check_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NOT public.builder_profile_user_owns_project(NEW.user_id, NEW.project_id) THEN
		RAISE EXCEPTION 'Only the project''s owner can put it on their page' USING ERRCODE = '42501';
	END IF;
	-- Goals must belong to this project.
	IF cardinality(NEW.goal_ids) > 0 AND EXISTS (
		SELECT 1 FROM unnest(NEW.goal_ids) AS gid
		WHERE NOT EXISTS (
			SELECT 1 FROM public.onto_goals AS g
			WHERE g.id = gid AND g.project_id = NEW.project_id AND g.deleted_at IS NULL
		)
	) THEN
		RAISE EXCEPTION 'Those goals are not in this project' USING ERRCODE = '22023';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_builder_profile_projects_check_owner ON public.builder_profile_projects;
CREATE TRIGGER trg_builder_profile_projects_check_owner
	BEFORE INSERT OR UPDATE OF user_id, project_id, goal_ids ON public.builder_profile_projects
	FOR EACH ROW EXECUTE FUNCTION public.builder_profile_projects_check_owner();

CREATE OR REPLACE FUNCTION public.builder_profile_updates_check_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NEW.project_id IS NOT NULL
		AND NOT public.builder_profile_user_owns_project(NEW.user_id, NEW.project_id) THEN
		RAISE EXCEPTION 'Only the project''s owner can post its updates' USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_builder_profile_updates_check_owner ON public.builder_profile_updates;
CREATE TRIGGER trg_builder_profile_updates_check_owner
	BEFORE INSERT ON public.builder_profile_updates
	FOR EACH ROW EXECUTE FUNCTION public.builder_profile_updates_check_owner();

-- Project fold: page entries, follows and updates stay with the archived source.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'builder_profile_projects', 'project_id', 'leave_behind',
				'The archived source drops off the owner''s page; the owner can list the destination.'),
			('public', 'builder_profile_updates', 'project_id', 'leave_behind',
				'Published lines are history about the source project.'),
			('public', 'builder_follows', 'project_id', 'leave_behind',
				'Followers of the source can follow the destination from the owner''s page.'),
			('public', 'builder_profile_activity_daily', 'project_id', 'leave_behind',
				'A rollup rebuilt from onto_project_logs on every refresh; no FK, nothing to move.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

-- ---------------------------------------------------------------------------
-- 3. Access: signed-in users read their own rows; the server writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.builder_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_profile_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_profile_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_profile_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_profile_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_profile_stats_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS builder_profiles_select_own ON public.builder_profiles;
CREATE POLICY builder_profiles_select_own ON public.builder_profiles
	FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_profile_links_select_own ON public.builder_profile_links;
CREATE POLICY builder_profile_links_select_own ON public.builder_profile_links
	FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_profile_projects_select_own ON public.builder_profile_projects;
CREATE POLICY builder_profile_projects_select_own ON public.builder_profile_projects
	FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_profile_updates_select_own ON public.builder_profile_updates;
CREATE POLICY builder_profile_updates_select_own ON public.builder_profile_updates
	FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_follows_select_party ON public.builder_follows;
CREATE POLICY builder_follows_select_party ON public.builder_follows
	FOR SELECT TO authenticated
	USING (follower_user_id = auth.uid() OR target_user_id = auth.uid());
DROP POLICY IF EXISTS builder_profile_activity_select_own ON public.builder_profile_activity_daily;
CREATE POLICY builder_profile_activity_select_own ON public.builder_profile_activity_daily
	FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_profile_stats_select_own ON public.builder_profile_stats_daily;
CREATE POLICY builder_profile_stats_select_own ON public.builder_profile_stats_daily
	FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON TABLE
	public.builder_profiles,
	public.builder_profile_links,
	public.builder_profile_projects,
	public.builder_profile_updates,
	public.builder_follows,
	public.builder_profile_activity_daily,
	public.builder_profile_stats_daily
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
	public.builder_profiles,
	public.builder_profile_links,
	public.builder_profile_projects,
	public.builder_profile_updates,
	public.builder_follows,
	public.builder_profile_activity_daily,
	public.builder_profile_stats_daily
TO authenticated;
GRANT ALL ON TABLE
	public.builder_profiles,
	public.builder_profile_links,
	public.builder_profile_projects,
	public.builder_profile_updates,
	public.builder_follows,
	public.builder_profile_activity_daily,
	public.builder_profile_stats_daily
TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Build log rollup (server only)
-- ---------------------------------------------------------------------------
-- Rebuilds the last ~53 weeks of the user's own changes, bucketed by day in their time
-- zone. Agents act as their person (changed_by = user id) and carry the caller id.
CREATE OR REPLACE FUNCTION public.refresh_builder_profile_activity(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_tz text;
	v_rows integer;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'A user id is required' USING ERRCODE = '22023';
	END IF;

	SELECT COALESCE(NULLIF(btrim(u.timezone), ''), 'America/New_York') INTO v_tz
	FROM public.users AS u WHERE u.id = p_user_id;
	IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN
		v_tz := 'America/New_York';
	END IF;

	DELETE FROM public.builder_profile_activity_daily AS d WHERE d.user_id = p_user_id;

	INSERT INTO public.builder_profile_activity_daily (user_id, day, project_id, changes, by_agents)
	SELECT
		p_user_id,
		(l.created_at AT TIME ZONE v_tz)::date,
		l.project_id,
		count(*)::integer,
		(count(*) FILTER (WHERE l.external_agent_caller_id IS NOT NULL))::integer
	FROM public.onto_project_logs AS l
	WHERE l.changed_by = p_user_id
		AND l.created_at > now() - interval '372 days'
	GROUP BY 2, 3;
	GET DIAGNOSTICS v_rows = ROW_COUNT;

	UPDATE public.builder_profiles AS bp
	SET activity_refreshed_at = now()
	WHERE bp.user_id = p_user_id;

	RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Stats (server only): one bump per counted event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_builder_profile_stat(p_user_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_tz text;
	v_day date;
BEGIN
	IF p_kind NOT IN ('view', 'link_tap', 'follow', 'ask') THEN
		RAISE EXCEPTION 'Unknown stat %', p_kind USING ERRCODE = '22023';
	END IF;
	SELECT COALESCE(NULLIF(btrim(u.timezone), ''), 'America/New_York') INTO v_tz
	FROM public.users AS u WHERE u.id = p_user_id;
	IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN
		v_tz := 'America/New_York';
	END IF;
	v_day := (now() AT TIME ZONE v_tz)::date;

	INSERT INTO public.builder_profile_stats_daily AS s (user_id, day, views, link_taps, follows, asks)
	VALUES (
		p_user_id,
		v_day,
		CASE WHEN p_kind = 'view' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'link_tap' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'follow' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'ask' THEN 1 ELSE 0 END
	)
	ON CONFLICT (user_id, day) DO UPDATE SET
		views = s.views + EXCLUDED.views,
		link_taps = s.link_taps + EXCLUDED.link_taps,
		follows = s.follows + EXCLUDED.follows,
		asks = s.asks + EXCLUDED.asks;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. The public read
-- ---------------------------------------------------------------------------
-- Anyone (anon), a signed-in visitor (auth.uid()), or the server on someone's behalf
-- (service_role + p_viewer, NULL = anonymous). Unknown, unpublished, and malformed
-- handles all return {"found": false}; the owner can read their own draft.
CREATE OR REPLACE FUNCTION public.get_builder_profile(p_handle text, p_viewer uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_role text := public.people_layer_jwt_role();
	v_viewer uuid;
	v_handle text := public.people_layer_normalize_handle(p_handle);
	v_user record;
	v_profile public.builder_profiles%ROWTYPE;
	v_owner_actor uuid;
	v_viewer_actor uuid;
	v_is_owner boolean := false;
	v_works_with boolean := false;
	v_inner boolean := false;
	v_tz text;
	v_today date;
	v_visible uuid[];
	v_projects jsonb;
	v_links jsonb;
	v_activity jsonb := NULL;
	v_writing jsonb := '[]'::jsonb;
	v_with jsonb := '[]'::jsonb;
	v_stats jsonb := NULL;
	v_viewer_info jsonb;
BEGIN
	IF v_role = 'service_role' THEN
		v_viewer := p_viewer;
	ELSIF v_role = 'authenticated' THEN
		v_viewer := auth.uid();
	ELSE
		v_viewer := NULL;
	END IF;

	IF v_handle IS NULL THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	SELECT u.id, u.username, u.name, u.bio, u.timezone, u.created_at
	INTO v_user
	FROM public.users AS u
	WHERE lower(u.username) = v_handle
	LIMIT 1;
	IF v_user.id IS NULL THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	SELECT * INTO v_profile FROM public.builder_profiles AS bp WHERE bp.user_id = v_user.id;
	v_is_owner := v_viewer IS NOT NULL AND v_viewer = v_user.id;
	IF v_profile.user_id IS NULL OR (v_profile.status <> 'published' AND NOT v_is_owner) THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	v_tz := COALESCE(NULLIF(btrim(v_user.timezone), ''), 'America/New_York');
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN
		v_tz := 'America/New_York';
	END IF;
	v_today := (now() AT TIME ZONE v_tz)::date;

	SELECT a.id INTO v_owner_actor
	FROM public.onto_actors AS a WHERE a.user_id = v_user.id
	ORDER BY a.created_at LIMIT 1;

	IF v_viewer IS NOT NULL AND NOT v_is_owner THEN
		SELECT a.id INTO v_viewer_actor
		FROM public.onto_actors AS a WHERE a.user_id = v_viewer
		ORDER BY a.created_at LIMIT 1;
		IF v_viewer_actor IS NOT NULL AND v_owner_actor IS NOT NULL THEN
			v_works_with := EXISTS (
				SELECT 1
				FROM public.onto_project_members AS m1
				JOIN public.onto_project_members AS m2 ON m2.project_id = m1.project_id
				JOIN public.onto_projects AS p ON p.id = m1.project_id
				WHERE m1.actor_id = v_owner_actor AND m1.removed_at IS NULL
					AND m2.actor_id = v_viewer_actor AND m2.removed_at IS NULL
					AND p.deleted_at IS NULL
			);
		END IF;
	END IF;
	v_inner := v_is_owner OR v_works_with;

	-- Projects on the page that this viewer may see, owner re-checked.
	SELECT COALESCE(array_agg(bpp.project_id), '{}'::uuid[]) INTO v_visible
	FROM public.builder_profile_projects AS bpp
	JOIN public.onto_projects AS p ON p.id = bpp.project_id
	WHERE bpp.user_id = v_user.id
		AND p.deleted_at IS NULL
		AND p.archived_at IS NULL
		AND COALESCE(p.kind, 'project') = 'project'
		AND (bpp.audience = 'anyone' OR v_inner)
		AND public.builder_profile_user_owns_project(v_user.id, p.id);

	SELECT COALESCE(jsonb_agg(card ORDER BY sort_live DESC, sort_pos, sort_name), '[]'::jsonb)
	INTO v_projects
	FROM (
		SELECT
			(bpp.level = 'live') AS sort_live,
			bpp.position AS sort_pos,
			lower(COALESCE(NULLIF(btrim(bpp.public_name), ''), p.name)) AS sort_name,
			jsonb_strip_nulls(jsonb_build_object(
				'id', p.id,
				'level', bpp.level,
				'name', COALESCE(NULLIF(btrim(bpp.public_name), ''), p.name),
				'pitch', NULLIF(btrim(COALESCE(bpp.pitch, '')), ''),
				'link_url', bpp.link_url,
				'stage', p.facet_stage,
				'state', p.state_key::text,
				'glyphs', CASE WHEN jsonb_typeof(p.icon_emoji -> 'glyphs') = 'array'
					THEN p.icon_emoji -> 'glyphs' END,
				'audience', bpp.audience,
				'last_active_at', (
					SELECT max(l.created_at) FROM public.onto_project_logs AS l WHERE l.project_id = p.id
				),
				'goals', CASE WHEN bpp.level = 'live' THEN (
					SELECT jsonb_agg(g.name ORDER BY array_position(bpp.goal_ids, g.id))
					FROM public.onto_goals AS g
					WHERE g.id = ANY (bpp.goal_ids) AND g.project_id = p.id AND g.deleted_at IS NULL
				) END,
				'next_milestone', CASE WHEN bpp.level = 'live' AND bpp.show_next_milestone THEN (
					SELECT jsonb_build_object('title', ms.title, 'due_at', ms.due_at)
					FROM public.onto_milestones AS ms
					WHERE ms.project_id = p.id
						AND ms.deleted_at IS NULL
						AND ms.due_at IS NOT NULL
						AND ms.due_at >= now() - interval '1 day'
						AND ms.state_key::text IN ('pending', 'in_progress')
					ORDER BY ms.due_at
					LIMIT 1
				) END,
				'looking_for', CASE WHEN bpp.level = 'live' THEN NULLIF(btrim(COALESCE(bpp.looking_for, '')), '') END,
				'this_week', CASE WHEN bpp.level = 'live' THEN NULLIF(btrim(COALESCE(bpp.this_week, '')), '') END,
				'this_week_at', CASE WHEN bpp.level = 'live' THEN bpp.this_week_at END,
				'weekly', CASE WHEN bpp.level = 'live' THEN (
					SELECT jsonb_agg(jsonb_build_array(COALESCE(s.c, 0), COALESCE(s.a, 0)) ORDER BY w.n DESC)
					FROM generate_series(0, 11) AS w(n)
					LEFT JOIN LATERAL (
						SELECT sum(d.changes)::integer AS c, sum(d.by_agents)::integer AS a
						FROM public.builder_profile_activity_daily AS d
						WHERE d.user_id = v_user.id
							AND d.project_id = p.id
							AND d.day > v_today - ((w.n + 1) * 7)
							AND d.day <= v_today - (w.n * 7)
					) AS s ON true
				) END,
				'member_count', CASE WHEN bpp.level = 'live' THEN (
					SELECT count(*)::integer FROM public.onto_project_members AS m
					WHERE m.project_id = p.id AND m.removed_at IS NULL
				) END,
				'viewer_is_member', CASE WHEN v_viewer_actor IS NOT NULL THEN EXISTS (
					SELECT 1 FROM public.onto_project_members AS m
					WHERE m.project_id = p.id AND m.actor_id = v_viewer_actor AND m.removed_at IS NULL
				) END,
				'viewer_follows', CASE WHEN v_viewer IS NOT NULL AND NOT v_is_owner THEN EXISTS (
					SELECT 1 FROM public.builder_follows AS f
					WHERE f.follower_user_id = v_viewer AND f.target_user_id = v_user.id AND f.project_id = p.id
				) END
			)) AS card
		FROM public.builder_profile_projects AS bpp
		JOIN public.onto_projects AS p ON p.id = bpp.project_id
		WHERE bpp.user_id = v_user.id AND bpp.project_id = ANY (v_visible)
	) AS cards;

	SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
		'id', l.id, 'kind', l.kind, 'url', l.url, 'label', l.label, 'note', l.note, 'audience', l.audience
	)) ORDER BY l.position, l.created_at), '[]'::jsonb)
	INTO v_links
	FROM public.builder_profile_links AS l
	WHERE l.user_id = v_user.id AND (l.audience = 'anyone' OR v_inner);

	IF v_profile.show_build_log THEN
		SELECT jsonb_build_object(
			'includes_private', v_profile.build_log_includes_private,
			'show_agent_split', v_profile.show_agent_split,
			'today', v_today,
			'days', COALESCE(jsonb_agg(jsonb_build_array(x.day, x.c, CASE WHEN v_profile.show_agent_split THEN x.a ELSE 0 END) ORDER BY x.day), '[]'::jsonb)
		)
		INTO v_activity
		FROM (
			SELECT d.day, sum(d.changes)::integer AS c, sum(d.by_agents)::integer AS a
			FROM public.builder_profile_activity_daily AS d
			WHERE d.user_id = v_user.id
				AND d.day > v_today - 371
				AND (v_profile.build_log_includes_private OR d.project_id = ANY (v_visible))
			GROUP BY d.day
		) AS x;
	END IF;

	IF v_profile.show_writing AND v_owner_actor IS NOT NULL THEN
		SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
			'title', w.title,
			'summary', w.summary,
			'url_path', CASE
				WHEN NULLIF(w.slug_prefix, '') IS NOT NULL AND NULLIF(w.slug_base, '') IS NOT NULL
					THEN '/p/' || w.slug_prefix || '/' || w.slug_base
				ELSE '/p/' || w.slug
			END,
			'published_at', w.published_at
		)) ORDER BY w.published_at DESC NULLS LAST), '[]'::jsonb)
		INTO v_writing
		FROM (
			SELECT pp.title, pp.summary, pp.slug, pp.slug_prefix, pp.slug_base, pp.published_at
			FROM public.onto_public_pages AS pp
			JOIN public.onto_projects AS p ON p.id = pp.project_id
			WHERE (pp.created_by = v_owner_actor OR pp.published_by = v_owner_actor)
				AND pp.status = 'published'
				AND pp.public_status = 'live'
				AND pp.visibility = 'public'
				AND pp.noindex = false
				AND pp.deleted_at IS NULL
				AND p.deleted_at IS NULL
			ORDER BY pp.published_at DESC NULLS LAST
			LIMIT 20
		) AS w;
	END IF;

	IF v_profile.show_builds_with AND v_owner_actor IS NOT NULL THEN
		SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
			'handle', u2.username, 'name', u2.name, 'headline', bp2.headline, 'avatar_url', bp2.avatar_url
		)) ORDER BY lower(COALESCE(u2.name, u2.username))), '[]'::jsonb)
		INTO v_with
		FROM (
			SELECT DISTINCT a2.user_id
			FROM public.onto_project_members AS m1
			JOIN public.onto_project_members AS m2
				ON m2.project_id = m1.project_id AND m2.actor_id <> m1.actor_id
			JOIN public.onto_actors AS a2 ON a2.id = m2.actor_id
			JOIN public.onto_projects AS p ON p.id = m1.project_id
			WHERE m1.actor_id = v_owner_actor
				AND m1.removed_at IS NULL
				AND m2.removed_at IS NULL
				AND p.deleted_at IS NULL
				AND a2.user_id IS NOT NULL
				AND a2.user_id <> v_user.id
		) AS c
		JOIN public.users AS u2 ON u2.id = c.user_id
		JOIN public.builder_profiles AS bp2 ON bp2.user_id = c.user_id
		WHERE bp2.status = 'published'
			AND bp2.show_on_collaborator_pages
			AND u2.username IS NOT NULL;
	END IF;

	IF v_is_owner THEN
		SELECT jsonb_build_object(
			'views_7d', COALESCE(sum(s.views) FILTER (WHERE s.day > v_today - 7), 0),
			'views_28d', COALESCE(sum(s.views), 0),
			'link_taps_28d', COALESCE(sum(s.link_taps), 0),
			'follows_28d', COALESCE(sum(s.follows), 0),
			'asks_28d', COALESCE(sum(s.asks), 0),
			'followers', (
				SELECT count(DISTINCT f.follower_user_id)::integer
				FROM public.builder_follows AS f WHERE f.target_user_id = v_user.id
			)
		)
		INTO v_stats
		FROM public.builder_profile_stats_daily AS s
		WHERE s.user_id = v_user.id AND s.day > v_today - 28;
	END IF;

	v_viewer_info := jsonb_build_object(
		'signed_in', v_viewer IS NOT NULL,
		'is_owner', v_is_owner,
		'works_with', v_works_with,
		'follows', CASE WHEN v_viewer IS NOT NULL AND NOT v_is_owner THEN EXISTS (
			SELECT 1 FROM public.builder_follows AS f
			WHERE f.follower_user_id = v_viewer AND f.target_user_id = v_user.id AND f.project_id IS NULL
		) ELSE false END,
		'ask_pending', CASE WHEN v_viewer IS NOT NULL AND NOT v_is_owner THEN EXISTS (
			SELECT 1 FROM public.people_requests AS r
			WHERE r.from_user_id = v_viewer AND r.to_user_id = v_user.id
				AND r.status = 'pending' AND r.expires_at > now()
		) ELSE false END
	);

	RETURN jsonb_strip_nulls(jsonb_build_object(
		'found', true,
		'status', v_profile.status,
		'viewer', v_viewer_info,
		'profile', jsonb_strip_nulls(jsonb_build_object(
			'handle', v_user.username,
			'name', NULLIF(btrim(COALESCE(v_user.name, '')), ''),
			'bio', NULLIF(btrim(COALESCE(v_user.bio, '')), ''),
			'headline', NULLIF(btrim(COALESCE(v_profile.headline, '')), ''),
			'location', NULLIF(btrim(COALESCE(v_profile.location, '')), ''),
			'avatar_url', v_profile.avatar_url,
			'now_text', NULLIF(btrim(COALESCE(v_profile.now_text, '')), ''),
			'now_updated_at', v_profile.now_updated_at,
			'member_since', v_user.created_at,
			'published_at', v_profile.published_at
		)),
		'settings', jsonb_build_object(
			'show_build_log', v_profile.show_build_log,
			'show_agent_split', v_profile.show_agent_split,
			'show_writing', v_profile.show_writing,
			'show_builds_with', v_profile.show_builds_with
		),
		'links', v_links,
		'projects', v_projects,
		'activity', v_activity,
		'writing', v_writing,
		'builds_with', v_with,
		'stats', v_stats,
		'activity_refreshed_at', CASE WHEN v_is_owner THEN v_profile.activity_refreshed_at END
	));
END;
$$;

-- For the server: who owns this handle, and is their page live (follow, ask, events).
CREATE OR REPLACE FUNCTION public.builder_profile_target(p_handle text)
RETURNS TABLE (user_id uuid, username text, status text, activity_refreshed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT u.id, u.username, bp.status, bp.activity_refreshed_at
	FROM public.users AS u
	JOIN public.builder_profiles AS bp ON bp.user_id = u.id
	WHERE public.people_layer_normalize_handle(p_handle) IS NOT NULL
		AND lower(u.username) = public.people_layer_normalize_handle(p_handle)
	LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants (new functions are server-only by default)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.builder_profile_user_owns_project(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.builder_profile_projects_check_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.builder_profile_updates_check_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_builder_profile_activity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_builder_profile_stat(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.builder_profile_target(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_builder_profile(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.builder_profile_user_owns_project(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_builder_profile_activity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_builder_profile_stat(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.builder_profile_target(text) TO service_role;
-- The page itself: logged-out visitors, signed-in visitors, and the server. Intended
-- anon grant (rehearsal flags it): it returns only published fields and checks the
-- viewer itself; p_viewer is honored for service_role only.
GRANT EXECUTE ON FUNCTION public.get_builder_profile(text, uuid) TO anon, authenticated, service_role;

COMMIT;
