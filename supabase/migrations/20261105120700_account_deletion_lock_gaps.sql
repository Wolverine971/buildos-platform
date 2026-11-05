-- supabase/migrations/20261105120700_account_deletion_lock_gaps.sql
--
-- Security audit 2026-11-05, account deletion lock window. request_account_deletion locks an
-- account right away and the purge runs about 30 days later. The lock only took down
-- onto_public_pages, so during the whole window:
--
-- 1. The person's builder page (/@handle, its project pages, the .json view, the MCP
--    get_builder_profile tool, follower briefs, the weekly-draft cron) stayed published, and
--    their public chat shares (/share/<token>) stayed live. The privacy page promises pages
--    come down right away.
-- 2. Their invite links and pending email invites stayed acceptable, so someone could join a
--    project the purge then hard-deletes, with that person's work in it and no notice.
--
-- Fix:
-- - When users.deletion_status is first set, an AFTER trigger on public.users takes down what
--   the person shares: builder_profiles go back to draft, chat shares are revoked, and invite
--   links and pending or declined invites on the projects the purge will delete are revoked.
--   A trigger (not another copy of lock_account_for_deletion) so it runs on every path that
--   sets deletion_status. There is no cancel-deletion flow; like the existing lock steps
--   (OAuth grants, public pages), these stay taken down. Accounts already locked are
--   backfilled below.
-- - Readers check too: get_builder_profile and builder_profile_target treat an account with
--   deletion_status set as not found (covers every builder page reader and the people tool).
-- - private.finish_project_join, which every join path runs (invite, invite link, owner
--   approval), refuses a new membership on a project the purge will delete. That covers
--   invites a non-owner admin sends during the lock. Existing members are unaffected.
--
-- The three replaced functions are copied from production (snapshot 2026-11-04) with only the
-- marked guard added. Grants and owners are kept by CREATE OR REPLACE.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- Projects the purge will delete: created by a person whose account is being deleted, with no
-- other active owner (same rule as account_deletion_purged_project_ids).
CREATE OR REPLACE FUNCTION private.project_owner_is_deleting(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM public.onto_projects AS p
		JOIN public.onto_actors AS creator ON creator.id = p.created_by
		JOIN public.users AS u ON u.id = creator.user_id
		WHERE p.id = p_project_id
			AND u.deletion_status IS NOT NULL
			AND NOT EXISTS (
				SELECT 1
				FROM public.onto_project_members AS other_owner
				WHERE other_owner.project_id = p.id
					AND other_owner.role_key = 'owner'
					AND other_owner.removed_at IS NULL
					AND other_owner.actor_id NOT IN (
						SELECT a.id FROM public.onto_actors AS a WHERE a.user_id = u.id
					)
			)
	);
$$;

REVOKE EXECUTE ON FUNCTION private.project_owner_is_deleting(uuid) FROM PUBLIC, anon, authenticated;

-- Take down everything the person shares with others. Idempotent.
CREATE OR REPLACE FUNCTION private.account_deletion_take_down_shared(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_now timestamptz := now();
	v_project_ids uuid[] := public.account_deletion_purged_project_ids(p_user_id);
	v_profiles integer;
	v_shares integer;
	v_links integer;
	v_invites integer;
BEGIN
	UPDATE public.builder_profiles
	SET status = 'draft'
	WHERE user_id = p_user_id AND status = 'published';
	GET DIAGNOSTICS v_profiles = ROW_COUNT;

	UPDATE public.chat_session_shares
	SET revoked_at = v_now, updated_at = v_now
	WHERE user_id = p_user_id AND revoked_at IS NULL;
	GET DIAGNOSTICS v_shares = ROW_COUNT;

	UPDATE public.onto_project_invite_links
	SET revoked_at = v_now, revoked_reason = 'turned_off'
	WHERE project_id = ANY (v_project_ids) AND revoked_at IS NULL;
	GET DIAGNOSTICS v_links = ROW_COUNT;

	UPDATE public.onto_project_invites
	SET status = 'revoked'
	WHERE project_id = ANY (v_project_ids) AND status IN ('pending', 'declined');
	GET DIAGNOSTICS v_invites = ROW_COUNT;

	RETURN jsonb_build_object(
		'builder_profiles_unpublished', v_profiles,
		'chat_shares_revoked', v_shares,
		'invite_links_revoked', v_links,
		'invites_revoked', v_invites
	);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.account_deletion_take_down_shared(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.users_deletion_take_down_shared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	PERFORM private.account_deletion_take_down_shared(NEW.id);
	RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.users_deletion_take_down_shared() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_users_deletion_take_down_shared ON public.users;
CREATE TRIGGER zz_users_deletion_take_down_shared
	AFTER UPDATE OF deletion_status ON public.users
	FOR EACH ROW
	WHEN (OLD.deletion_status IS NULL AND NEW.deletion_status IS NOT NULL)
	EXECUTE FUNCTION private.users_deletion_take_down_shared();

-- Accounts already waiting for their purge.
DO $$
DECLARE
	v_user uuid;
BEGIN
	FOR v_user IN SELECT id FROM public.users WHERE deletion_status IS NOT NULL LOOP
		PERFORM private.account_deletion_take_down_shared(v_user);
	END LOOP;
END;
$$;

-- Readers: an account being deleted has no builder page. ------------------------------------

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

CREATE OR REPLACE FUNCTION "public"."builder_profile_target"("p_handle" "text") RETURNS TABLE("user_id" "uuid", "username" "text", "status" "text", "activity_refreshed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	SELECT u.id, u.username, bp.status, bp.activity_refreshed_at
	FROM public.users AS u
	JOIN public.builder_profiles AS bp ON bp.user_id = u.id
	WHERE public.people_layer_normalize_handle(p_handle) IS NOT NULL
		AND lower(u.username) = public.people_layer_normalize_handle(p_handle)
		AND u.deletion_status IS NULL
	LIMIT 1;
$$;

-- Joins: refuse a new membership on a project the purge will delete. --------------------------

CREATE OR REPLACE FUNCTION "private"."finish_project_join"("p_project_id" "uuid", "p_user_id" "uuid", "p_source" "text", "p_changed" boolean, "p_request_id" "uuid" DEFAULT NULL::"uuid", "p_invite_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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
	-- Nobody joins a project that its owner's account deletion will purge.
	IF p_changed AND private.project_owner_is_deleting(p_project_id) THEN
		RAISE EXCEPTION 'Project unavailable';
	END IF;
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
