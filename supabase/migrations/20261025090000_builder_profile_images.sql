-- supabase/migrations/20261025090000_builder_profile_images.sql
--
-- Builder pages get an uploaded photo and cover image.
--   1. A public Storage bucket for those images. Uploads go through the server
--      (service_role) after a signed-in owner check, so no storage.objects policies
--      are added: browsers can read by URL and nobody can write directly.
--   2. builder_profiles.cover_url (https only, like avatar_url).
--   3. get_builder_profile returns cover_url (same body as 20261024020000 plus that
--      one field; CREATE OR REPLACE keeps the existing grants).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
	'builder-profile-images',
	'builder-profile-images',
	true,
	5242880,
	ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.builder_profiles
	ADD COLUMN IF NOT EXISTS cover_url text NULL CHECK (
		cover_url IS NULL OR (char_length(cover_url) <= 600 AND cover_url ~ '^https://[^[:space:]]+$')
	);

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
			'cover_url', v_profile.cover_url,
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
