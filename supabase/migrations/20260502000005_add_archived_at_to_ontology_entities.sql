-- supabase/migrations/20260502000005_add_archived_at_to_ontology_entities.sql
-- Establish `archived_at` as the primary user/agent-facing visibility marker
-- for core ontology entities. `deleted_at` is left in place for backwards
-- compatibility during rollout, but active ontology reads should move to
-- `archived_at IS NULL`.

ALTER TABLE public.onto_projects
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.onto_tasks
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.onto_documents
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.onto_goals
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.onto_plans
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.onto_milestones
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.onto_risks
	ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.onto_projects.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';
COMMENT ON COLUMN public.onto_tasks.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';
COMMENT ON COLUMN public.onto_documents.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';
COMMENT ON COLUMN public.onto_goals.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';
COMMENT ON COLUMN public.onto_plans.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';
COMMENT ON COLUMN public.onto_milestones.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';
COMMENT ON COLUMN public.onto_risks.archived_at IS
	'Visibility lifecycle marker. NULL means active; non-NULL means archived/hidden from default user and agent views.';

-- Preserve visibility of rows that were previously soft-deleted via deleted_at.
UPDATE public.onto_projects
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

UPDATE public.onto_tasks
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

UPDATE public.onto_documents
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

UPDATE public.onto_goals
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

UPDATE public.onto_plans
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

UPDATE public.onto_milestones
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

UPDATE public.onto_risks
SET archived_at = deleted_at
WHERE archived_at IS NULL
	AND deleted_at IS NOT NULL;

-- Documents already use state_key='archived' as a visible archive signal.
-- Backfill archived_at so new code can read one standard visibility column.
UPDATE public.onto_documents
SET archived_at = COALESCE(updated_at, created_at, now())
WHERE archived_at IS NULL
	AND state_key::text = 'archived';

-- Active-row indexes for the new default visibility contract.
CREATE INDEX IF NOT EXISTS idx_onto_projects_active_created
	ON public.onto_projects (created_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_projects_active_updated
	ON public.onto_projects (updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_tasks_project_updated_active_archived
	ON public.onto_tasks (project_id, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_tasks_project_state_active_archived
	ON public.onto_tasks (project_id, state_key, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_documents_project_updated_active_archived
	ON public.onto_documents (project_id, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_documents_project_state_active_archived
	ON public.onto_documents (project_id, state_key, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_goals_project_updated_active_archived
	ON public.onto_goals (project_id, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_goals_project_state_active_archived
	ON public.onto_goals (project_id, state_key, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_plans_project_updated_active_archived
	ON public.onto_plans (project_id, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_plans_project_state_active_archived
	ON public.onto_plans (project_id, state_key, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_milestones_project_due_active_archived
	ON public.onto_milestones (project_id, due_at, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_milestones_project_state_active_archived
	ON public.onto_milestones (project_id, state_key, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_risks_project_updated_active_archived
	ON public.onto_risks (project_id, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_risks_project_state_active_archived
	ON public.onto_risks (project_id, state_key, updated_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_risks_project_impact_active_archived
	ON public.onto_risks (project_id, impact, updated_at DESC)
	WHERE archived_at IS NULL;

-- Keep the project summary RPC aligned with the new active-record contract.
CREATE OR REPLACE FUNCTION public.get_onto_project_summaries_v1(
	p_actor_id uuid
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
	ORDER BY ap.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onto_project_summaries_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_onto_project_summaries_v1(uuid) TO service_role;
