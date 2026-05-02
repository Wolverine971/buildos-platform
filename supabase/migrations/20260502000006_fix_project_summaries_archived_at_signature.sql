-- supabase/migrations/20260502000006_fix_project_summaries_archived_at_signature.sql
-- The archived_at migration accidentally recreated the legacy single-arg
-- get_onto_project_summaries_v1(uuid) overload. Keep the current two-arg
-- signature with p_limit support, update it to archived_at, then remove the
-- one-arg overload so RPC/function resolution stays unambiguous.

CREATE OR REPLACE FUNCTION public.get_onto_project_summaries_v1(
	p_actor_id uuid,
	p_limit integer DEFAULT NULL
)
RETURNS TABLE (
	id uuid,
	name text,
	description text,
	icon_svg text,
	icon_concept text,
	icon_generated_at timestamptz,
	icon_generation_source text,
	icon_generation_prompt text,
	type_key text,
	state_key text,
	props jsonb,
	facet_context text,
	facet_scale text,
	facet_stage text,
	created_at timestamptz,
	updated_at timestamptz,
	task_count bigint,
	goal_count bigint,
	plan_count bigint,
	document_count bigint,
	owner_actor_id uuid,
	access_role text,
	access_level text,
	is_shared boolean,
	next_step_short text,
	next_step_long text,
	next_step_source text,
	next_step_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_actor_id uuid;
BEGIN
	IF p_actor_id IS NULL THEN
		RETURN;
	END IF;

	IF auth.role() = 'service_role' THEN
		v_actor_id := p_actor_id;
	ELSE
		v_actor_id := current_actor_id();
		IF v_actor_id IS NULL OR v_actor_id <> p_actor_id THEN
			RAISE EXCEPTION 'Actor mismatch for project summary access'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	RETURN QUERY
	WITH accessible_projects AS (
		SELECT
			p.*,
			m.role_key AS member_role_key,
			m.access AS member_access
		FROM public.onto_projects p
		LEFT JOIN public.onto_project_members m
			ON m.project_id = p.id
			AND m.actor_id = v_actor_id
			AND m.removed_at IS NULL
		WHERE p.archived_at IS NULL
			AND (
				p.created_by = v_actor_id
				OR m.id IS NOT NULL
			)
	),
	project_rollups AS (
		SELECT
			ap.id,
			COALESCE(tasks.task_count, 0)::bigint AS task_count,
			COALESCE(goals.goal_count, 0)::bigint AS goal_count,
			COALESCE(plans.plan_count, 0)::bigint AS plan_count,
			COALESCE(documents.document_count, 0)::bigint AS document_count,
			GREATEST(
				COALESCE(tasks.latest_activity_at, 'epoch'::timestamptz),
				COALESCE(goals.latest_activity_at, 'epoch'::timestamptz),
				COALESCE(plans.latest_activity_at, 'epoch'::timestamptz),
				COALESCE(documents.latest_activity_at, 'epoch'::timestamptz),
				ap.created_at
			) AS latest_activity_at
		FROM accessible_projects ap
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS task_count,
				MAX(COALESCE(t.updated_at, t.created_at)) AS latest_activity_at
			FROM public.onto_tasks t
			WHERE t.project_id = ap.id
				AND t.archived_at IS NULL
		) tasks ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS goal_count,
				MAX(COALESCE(g.updated_at, g.created_at)) AS latest_activity_at
			FROM public.onto_goals g
			WHERE g.project_id = ap.id
				AND g.archived_at IS NULL
		) goals ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS plan_count,
				MAX(COALESCE(pl.updated_at, pl.created_at)) AS latest_activity_at
			FROM public.onto_plans pl
			WHERE pl.project_id = ap.id
				AND pl.archived_at IS NULL
		) plans ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS document_count,
				MAX(COALESCE(d.updated_at, d.created_at)) AS latest_activity_at
			FROM public.onto_documents d
			WHERE d.project_id = ap.id
				AND d.archived_at IS NULL
		) documents ON true
	)
	SELECT
		ap.id,
		ap.name,
		ap.description,
		ap.icon_svg,
		ap.icon_concept,
		ap.icon_generated_at,
		ap.icon_generation_source::text,
		ap.icon_generation_prompt,
		ap.type_key::text,
		ap.state_key::text,
		ap.props,
		ap.facet_context::text,
		ap.facet_scale::text,
		ap.facet_stage::text,
		ap.created_at,
		pr.latest_activity_at AS updated_at,
		pr.task_count,
		pr.goal_count,
		pr.plan_count,
		pr.document_count,
		ap.created_by AS owner_actor_id,
		COALESCE(
			ap.member_role_key::text,
			CASE WHEN ap.created_by = v_actor_id THEN 'owner' ELSE NULL END
		) AS access_role,
		COALESCE(
			ap.member_access::text,
			CASE WHEN ap.created_by = v_actor_id THEN 'admin' ELSE NULL END
		) AS access_level,
		(ap.created_by <> v_actor_id) AS is_shared,
		ap.next_step_short,
		ap.next_step_long,
		ap.next_step_source::text,
		ap.next_step_updated_at
	FROM accessible_projects ap
	INNER JOIN project_rollups pr ON pr.id = ap.id
	ORDER BY ap.created_at DESC
	LIMIT CASE
		WHEN p_limit IS NOT NULL AND p_limit > 0 THEN p_limit
		ELSE NULL
	END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onto_project_summaries_v1(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_onto_project_summaries_v1(uuid, integer) TO service_role;

DROP FUNCTION IF EXISTS public.get_onto_project_summaries_v1(uuid);
