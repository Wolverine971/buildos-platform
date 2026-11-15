-- supabase/migrations/20261115160000_builder_profile_finish.sql
--
-- Builder pages (tasker 147), finishing pass:
--   1. Writing is opt-in per page. New table builder_profile_writing holds the public pages
--      the owner picked; get_builder_profile and get_builder_project show only those (still
--      live, public and theirs). Nothing shows until the owner picks one. show_writing is no
--      longer read (default now false; the column stays so older code keeps working).
--   2. Socials can be an email address (mailto:), so visitors can reach the person.
--   3. Conflict check for the editor: builder_profiles.links_rev and projects_rev count saves
--      of the links and the projects list, so a second editor tab can't silently overwrite
--      the first.
--   4. View and tap counting: project page views get their own counter (project_views), and
--      bump_builder_profile_stat takes a visitor key (a daily-rotating hash the server makes
--      from the visitor's network address, never the address itself) so one visitor counts
--      once a day per page and at most 20 taps a day. Keys are kept for two days.
--   5. get_builder_profile returns project_views_28d to the owner.
--
-- get_builder_profile is copied from 20261105120700_account_deletion_lock_gaps.sql (with its
-- deletion guard) and must be applied after it: the guard below refuses otherwise, because
-- 120700 replaces get_builder_profile too and would undo the Writing opt-in.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_catalog.pg_proc AS f
		JOIN pg_catalog.pg_namespace AS n ON n.oid = f.pronamespace
		WHERE n.nspname = 'public' AND f.proname = 'builder_profile_target'
			AND f.prosrc LIKE '%deletion_status%'
	) THEN
		RAISE EXCEPTION 'Apply 20261105120700_account_deletion_lock_gaps.sql first (it also replaces get_builder_profile).';
	END IF;
END;
$$;

-- 1. Writing picks -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.builder_profile_writing (
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	page_id uuid NOT NULL REFERENCES public.onto_public_pages(id) ON DELETE CASCADE,
	position integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, page_id)
);
CREATE INDEX IF NOT EXISTS idx_builder_profile_writing_page
	ON public.builder_profile_writing (page_id);
COMMENT ON TABLE public.builder_profile_writing IS
	'Public pages the owner picked to show under Writing on their builder page (/@handle).';

ALTER TABLE public.builder_profile_writing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS builder_profile_writing_select_own ON public.builder_profile_writing;
CREATE POLICY builder_profile_writing_select_own ON public.builder_profile_writing
	FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON TABLE public.builder_profile_writing FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.builder_profile_writing TO authenticated;
GRANT ALL ON TABLE public.builder_profile_writing TO service_role;

ALTER TABLE public.builder_profiles ALTER COLUMN show_writing SET DEFAULT false;
COMMENT ON COLUMN public.builder_profiles.show_writing IS
	'Unused since 20261115160000: Writing shows the pages in builder_profile_writing.';

-- 2. Email as a social link ------------------------------------------------------------------
ALTER TABLE public.builder_profile_links DROP CONSTRAINT IF EXISTS builder_profile_links_url_check;
ALTER TABLE public.builder_profile_links ADD CONSTRAINT builder_profile_links_url_check CHECK (
	char_length(url) <= 600
	AND url ~* '^(https?://[^[:space:]]+|mailto:[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+)$'
);

-- 3. Editor conflict check ------------------------------------------------------------------
ALTER TABLE public.builder_profiles
	ADD COLUMN IF NOT EXISTS links_rev integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS projects_rev integer NOT NULL DEFAULT 0;

-- 4. Counting ---------------------------------------------------------------------------------
ALTER TABLE public.builder_profile_stats_daily
	ADD COLUMN IF NOT EXISTS project_views integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.builder_profile_stat_visitors (
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	day date NOT NULL,
	kind text NOT NULL,
	subject text NOT NULL DEFAULT '',
	visitor text NOT NULL CHECK (char_length(visitor) <= 128),
	hits integer NOT NULL DEFAULT 1,
	PRIMARY KEY (user_id, day, kind, subject, visitor)
);
COMMENT ON TABLE public.builder_profile_stat_visitors IS
	'Who already counted today on a builder page: a daily-rotating hash per visitor, kept two days. Server only.';
ALTER TABLE public.builder_profile_stat_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.builder_profile_stat_visitors FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.builder_profile_stat_visitors TO service_role;

DROP FUNCTION IF EXISTS public.bump_builder_profile_stat(uuid, text);
CREATE OR REPLACE FUNCTION public.bump_builder_profile_stat(
	p_user_id uuid,
	p_kind text,
	p_visitor text DEFAULT NULL,
	p_subject text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_tz text;
	v_day date;
	v_hits integer;
	v_cap integer := CASE WHEN p_kind = 'link_tap' THEN 20 ELSE 1 END;
BEGIN
	IF p_kind NOT IN ('view', 'project_view', 'link_tap', 'follow', 'ask') THEN
		RAISE EXCEPTION 'Unknown stat %', p_kind USING ERRCODE = '22023';
	END IF;
	IF char_length(COALESCE(p_visitor, '')) > 128 OR char_length(COALESCE(p_subject, '')) > 128 THEN
		RAISE EXCEPTION 'Visitor or subject too long' USING ERRCODE = '22023';
	END IF;
	SELECT COALESCE(NULLIF(btrim(u.timezone), ''), 'America/New_York') INTO v_tz
	FROM public.users AS u WHERE u.id = p_user_id;
	IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN
		v_tz := 'America/New_York';
	END IF;
	v_day := (now() AT TIME ZONE v_tz)::date;

	-- One view per visitor per page per day; up to 20 link taps per visitor per day.
	IF p_visitor IS NOT NULL THEN
		INSERT INTO public.builder_profile_stat_visitors AS v (user_id, day, kind, subject, visitor, hits)
		VALUES (p_user_id, v_day, p_kind, COALESCE(p_subject, ''), p_visitor, 1)
		ON CONFLICT (user_id, day, kind, subject, visitor) DO UPDATE SET hits = v.hits + 1
		RETURNING v.hits INTO v_hits;
		DELETE FROM public.builder_profile_stat_visitors AS old
		WHERE old.user_id = p_user_id AND old.day < v_day - 1;
		IF v_hits > v_cap THEN
			RETURN false;
		END IF;
	END IF;

	INSERT INTO public.builder_profile_stats_daily AS s (user_id, day, views, project_views, link_taps, follows, asks)
	VALUES (
		p_user_id,
		v_day,
		CASE WHEN p_kind = 'view' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'project_view' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'link_tap' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'follow' THEN 1 ELSE 0 END,
		CASE WHEN p_kind = 'ask' THEN 1 ELSE 0 END
	)
	ON CONFLICT (user_id, day) DO UPDATE SET
		views = s.views + EXCLUDED.views,
		project_views = s.project_views + EXCLUDED.project_views,
		link_taps = s.link_taps + EXCLUDED.link_taps,
		follows = s.follows + EXCLUDED.follows,
		asks = s.asks + EXCLUDED.asks;
	RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_builder_profile_stat(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_builder_profile_stat(uuid, text, text, text) TO service_role;

-- 5. Readers --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_builder_profile"("p_handle" "text", "p_viewer" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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
		AND u.deletion_status IS NULL
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
				'reply_url', CASE WHEN bpp.level = 'live' THEN bpp.reply_url END,
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

	-- Writing: only the public pages the owner picked for the page (builder_profile_writing),
	-- still live and still theirs. Nothing shows until they pick one.
	IF v_owner_actor IS NOT NULL THEN
		SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
			'title', w.title,
			'summary', w.summary,
			'url_path', CASE
				WHEN NULLIF(w.slug_prefix, '') IS NOT NULL AND NULLIF(w.slug_base, '') IS NOT NULL
					THEN '/p/' || w.slug_prefix || '/' || w.slug_base
				ELSE '/p/' || w.slug
			END,
			'published_at', w.published_at
		)) ORDER BY w.position, w.published_at DESC NULLS LAST), '[]'::jsonb)
		INTO v_writing
		FROM (
			SELECT pp.title, pp.summary, pp.slug, pp.slug_prefix, pp.slug_base, pp.published_at, bw.position
			FROM public.builder_profile_writing AS bw
			JOIN public.onto_public_pages AS pp ON pp.id = bw.page_id
			JOIN public.onto_projects AS p ON p.id = pp.project_id
			WHERE bw.user_id = v_user.id
				AND (pp.created_by = v_owner_actor OR pp.published_by = v_owner_actor)
				AND pp.status = 'published'
				AND pp.public_status = 'live'
				AND pp.visibility = 'public'
				AND pp.noindex = false
				AND pp.deleted_at IS NULL
				AND p.deleted_at IS NULL
			ORDER BY bw.position, pp.published_at DESC NULLS LAST
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
			'project_views_28d', COALESCE(sum(s.project_views), 0),
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
			'cover_url', v_profile.cover_url,
			'now_text', NULLIF(btrim(COALESCE(v_profile.now_text, '')), ''),
			'now_updated_at', v_profile.now_updated_at,
			'member_since', v_user.created_at,
			'published_at', v_profile.published_at
		)),
		'settings', jsonb_build_object(
			'show_build_log', v_profile.show_build_log,
			'show_agent_split', v_profile.show_agent_split,
			'show_writing', jsonb_array_length(v_writing) > 0,
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

CREATE OR REPLACE FUNCTION public.get_builder_project(
	p_handle text,
	p_slug text,
	p_viewer uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_page jsonb;
	v_card jsonb;
	v_slug text := lower(btrim(COALESCE(p_slug, '')));
	v_handle text := public.people_layer_normalize_handle(p_handle);
	v_user record;
	v_project_id uuid;
	v_owner_actor uuid;
	v_tz text;
	v_today date;
	v_show_split boolean;
	v_activity jsonb := NULL;
	v_updates jsonb := '[]'::jsonb;
	v_writing jsonb := '[]'::jsonb;
	v_built_by jsonb := '[]'::jsonb;
BEGIN
	IF v_slug = '' OR char_length(v_slug) > 120 OR v_handle IS NULL THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	-- The page exactly as this visitor may see it (the caller's role and viewer apply).
	v_page := public.get_builder_profile(p_handle, p_viewer);
	IF COALESCE((v_page ->> 'found')::boolean, false) IS NOT TRUE THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	SELECT e.card INTO v_card
	FROM jsonb_array_elements(COALESCE(v_page -> 'projects', '[]'::jsonb)) WITH ORDINALITY AS e(card, n)
	WHERE e.card ->> 'level' = 'live'
		AND (
			e.card ->> 'id' = v_slug
			OR btrim(regexp_replace(lower(e.card ->> 'name'), '[^a-z0-9]+', '-', 'g'), '-') = v_slug
		)
	ORDER BY (e.card ->> 'id' = v_slug) DESC, e.n
	LIMIT 1;
	IF v_card IS NULL THEN
		RETURN jsonb_build_object('found', false);
	END IF;
	v_project_id := (v_card ->> 'id')::uuid;

	SELECT u.id, u.timezone INTO v_user
	FROM public.users AS u
	WHERE lower(u.username) = v_handle
	LIMIT 1;
	IF v_user.id IS NULL THEN
		RETURN jsonb_build_object('found', false);
	END IF;

	v_tz := COALESCE(NULLIF(btrim(v_user.timezone), ''), 'America/New_York');
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN
		v_tz := 'America/New_York';
	END IF;
	v_today := (now() AT TIME ZONE v_tz)::date;
	v_show_split := COALESCE((v_page -> 'settings' ->> 'show_agent_split')::boolean, false);

	SELECT a.id INTO v_owner_actor
	FROM public.onto_actors AS a WHERE a.user_id = v_user.id
	ORDER BY a.created_at LIMIT 1;

	-- A year of this project's days, when the owner shows a build log at all.
	IF COALESCE((v_page -> 'settings' ->> 'show_build_log')::boolean, false) THEN
		SELECT jsonb_build_object(
			'includes_private', false,
			'show_agent_split', v_show_split,
			'today', v_today,
			'days', COALESCE(jsonb_agg(jsonb_build_array(
				d.day, d.changes, CASE WHEN v_show_split THEN d.by_agents ELSE 0 END
			) ORDER BY d.day), '[]'::jsonb)
		)
		INTO v_activity
		FROM public.builder_profile_activity_daily AS d
		WHERE d.user_id = v_user.id
			AND d.project_id = v_project_id
			AND d.day > v_today - 371
			AND d.changes > 0;
	END IF;

	-- Lines the owner published about this project, newest first.
	SELECT COALESCE(jsonb_agg(jsonb_build_object(
		'body', x.body, 'week_of', x.week_of, 'at', x.at
	) ORDER BY x.at DESC), '[]'::jsonb)
	INTO v_updates
	FROM (
		SELECT u.body, u.week_of, COALESCE(u.decided_at, u.created_at) AS at
		FROM public.builder_profile_updates AS u
		WHERE u.user_id = v_user.id
			AND u.project_id = v_project_id
			AND u.status = 'published'
		ORDER BY COALESCE(u.decided_at, u.created_at) DESC
		LIMIT 20
	) AS x;

	-- Public docs from this project that the owner picked for their page (same rule as
	-- the page's Writing section).
	IF v_owner_actor IS NOT NULL THEN
		SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
			'title', w.title,
			'summary', w.summary,
			'url_path', CASE
				WHEN NULLIF(w.slug_prefix, '') IS NOT NULL AND NULLIF(w.slug_base, '') IS NOT NULL
					THEN '/p/' || w.slug_prefix || '/' || w.slug_base
				ELSE '/p/' || w.slug
			END,
			'published_at', w.published_at
		)) ORDER BY w.position, w.published_at DESC NULLS LAST), '[]'::jsonb)
		INTO v_writing
		FROM (
			SELECT pp.title, pp.summary, pp.slug, pp.slug_prefix, pp.slug_base, pp.published_at, bw.position
			FROM public.builder_profile_writing AS bw
			JOIN public.onto_public_pages AS pp ON pp.id = bw.page_id
			WHERE bw.user_id = v_user.id
				AND pp.project_id = v_project_id
				AND (pp.created_by = v_owner_actor OR pp.published_by = v_owner_actor)
				AND pp.status = 'published'
				AND pp.public_status = 'live'
				AND pp.visibility = 'public'
				AND pp.noindex = false
				AND pp.deleted_at IS NULL
			ORDER BY bw.position, pp.published_at DESC NULLS LAST
			LIMIT 20
		) AS w;
	END IF;

	-- Others in this project who have a published page and agreed to be shown on
	-- collaborators' pages (same rule as the page's Builds with section).
	IF COALESCE((v_page -> 'settings' ->> 'show_builds_with')::boolean, false) AND v_owner_actor IS NOT NULL THEN
		SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
			'handle', u2.username, 'name', u2.name, 'headline', bp2.headline, 'avatar_url', bp2.avatar_url
		)) ORDER BY lower(COALESCE(u2.name, u2.username))), '[]'::jsonb)
		INTO v_built_by
		FROM (
			SELECT DISTINCT a2.user_id
			FROM public.onto_project_members AS m
			JOIN public.onto_actors AS a2 ON a2.id = m.actor_id
			WHERE m.project_id = v_project_id
				AND m.removed_at IS NULL
				AND a2.user_id IS NOT NULL
				AND a2.user_id <> v_user.id
		) AS c
		JOIN public.users AS u2 ON u2.id = c.user_id
		JOIN public.builder_profiles AS bp2 ON bp2.user_id = c.user_id
		WHERE bp2.status = 'published'
			AND bp2.show_on_collaborator_pages
			AND u2.username IS NOT NULL;
	END IF;

	RETURN jsonb_build_object(
		'found', true,
		'page', v_page,
		'project', v_card,
		'activity', v_activity,
		'updates', v_updates,
		'writing', v_writing,
		'built_by', v_built_by
	);
END;
$$;

-- CREATE OR REPLACE keeps both readers' grants (anon + authenticated + service_role).
