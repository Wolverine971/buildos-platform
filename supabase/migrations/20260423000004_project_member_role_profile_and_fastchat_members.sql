-- supabase/migrations/20260423000004_project_member_role_profile_and_fastchat_members.sql
-- Add user-defined project role profile fields to memberships and expose members in FastChat context.

ALTER TABLE onto_project_members
	ADD COLUMN IF NOT EXISTS role_name text,
	ADD COLUMN IF NOT EXISTS role_description text;

ALTER TABLE onto_project_members
	DROP CONSTRAINT IF EXISTS chk_project_member_role_name;

ALTER TABLE onto_project_members
	ADD CONSTRAINT chk_project_member_role_name CHECK (
		role_name IS NULL OR length(trim(role_name)) BETWEEN 2 AND 80
	);

ALTER TABLE onto_project_members
	DROP CONSTRAINT IF EXISTS chk_project_member_role_description;

ALTER TABLE onto_project_members
	ADD CONSTRAINT chk_project_member_role_description CHECK (
		role_description IS NULL OR length(trim(role_description)) BETWEEN 8 AND 600
	);

-- Backfill owner memberships with a default role profile so prompts always have a baseline.
UPDATE onto_project_members
SET
	role_name = COALESCE(role_name, 'Project Owner'),
	role_description = COALESCE(
		role_description,
		'Owns project direction, decision-making, and final approval.'
	)
WHERE role_key = 'owner'
	AND removed_at IS NULL;

CREATE OR REPLACE FUNCTION load_fastchat_context(
	p_context_type text,
	p_user_id uuid,
	p_project_id uuid DEFAULT NULL,
	p_focus_type text DEFAULT NULL,
	p_focus_entity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
	v_projects jsonb;
	v_project jsonb;
	v_goals jsonb;
	v_milestones jsonb;
	v_plans jsonb;
	v_tasks jsonb;
	v_events jsonb;
	v_members jsonb;
	v_logs jsonb;
	v_focus_entity jsonb;
	v_linked_edges jsonb;
	v_linked_entities jsonb;
	v_project_ids uuid[];
	v_limit integer;
	v_user_id uuid;
BEGIN
	v_user_id := p_user_id;
	IF auth.role() <> 'service_role' THEN
		v_user_id := auth.uid();
	END IF;

	IF p_context_type = 'global' THEN
		IF v_user_id IS NULL THEN
			RETURN jsonb_build_object(
				'projects', '[]'::jsonb,
				'goals', '[]'::jsonb,
				'milestones', '[]'::jsonb,
				'plans', '[]'::jsonb,
				'project_logs', '[]'::jsonb
			);
		END IF;

		SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
		INTO v_projects
		FROM (
			SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure
			FROM onto_projects
			WHERE deleted_at IS NULL
				AND created_by = v_user_id
			ORDER BY updated_at DESC
		) p;

		SELECT array_agg(id)
		INTO v_project_ids
		FROM onto_projects
		WHERE deleted_at IS NULL
			AND created_by = v_user_id;

		IF v_project_ids IS NULL OR array_length(v_project_ids, 1) IS NULL THEN
			RETURN jsonb_build_object(
				'projects', v_projects,
				'goals', '[]'::jsonb,
				'milestones', '[]'::jsonb,
				'plans', '[]'::jsonb,
				'project_logs', '[]'::jsonb
			);
		END IF;

		SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
		INTO v_goals
		FROM (
			SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at
			FROM onto_goals
			WHERE project_id = ANY(v_project_ids)
				AND deleted_at IS NULL
		) g;

		SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
		INTO v_milestones
		FROM (
			SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at
			FROM onto_milestones
			WHERE project_id = ANY(v_project_ids)
				AND deleted_at IS NULL
		) m;

		SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
		INTO v_plans
		FROM (
			SELECT id, project_id, name, description, state_key, updated_at
			FROM onto_plans
			WHERE project_id = ANY(v_project_ids)
				AND deleted_at IS NULL
		) pl;

		v_limit := array_length(v_project_ids, 1) * 6;

		SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
		INTO v_logs
		FROM (
			SELECT project_id, entity_type, entity_id, action, created_at, after_data, before_data
			FROM onto_project_logs
			WHERE project_id = ANY(v_project_ids)
			ORDER BY created_at DESC
			LIMIT v_limit
		) l;

		RETURN jsonb_build_object(
			'projects', v_projects,
			'goals', v_goals,
			'milestones', v_milestones,
			'plans', v_plans,
			'project_logs', v_logs
		);
	END IF;

	IF p_project_id IS NULL THEN
		RETURN NULL;
	END IF;

	IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
		RETURN NULL;
	END IF;

	SELECT to_jsonb(p)
	INTO v_project
	FROM (
		SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure
		FROM onto_projects
		WHERE id = p_project_id
			AND deleted_at IS NULL
	) p;

	IF v_project IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
	INTO v_goals
	FROM (
		SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at
		FROM onto_goals
		WHERE project_id = p_project_id
			AND deleted_at IS NULL
	) g;

	SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
	INTO v_milestones
	FROM (
		SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at
		FROM onto_milestones
		WHERE project_id = p_project_id
			AND deleted_at IS NULL
	) m;

	SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
	INTO v_plans
	FROM (
		SELECT id, project_id, name, description, state_key, updated_at
		FROM onto_plans
		WHERE project_id = p_project_id
			AND deleted_at IS NULL
	) pl;

	SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
	INTO v_tasks
	FROM (
		SELECT id, project_id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at
		FROM onto_tasks
		WHERE project_id = p_project_id
			AND deleted_at IS NULL
	) t;

	SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
	INTO v_events
	FROM (
		SELECT id, project_id, title, description, state_key, start_at, end_at, all_day, location, updated_at
		FROM onto_events
		WHERE project_id = p_project_id
			AND deleted_at IS NULL
	) e;

	SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
	INTO v_members
	FROM (
		SELECT
			pm.id,
			pm.project_id,
			pm.actor_id,
			pm.role_key,
			pm.access,
			pm.role_name,
			pm.role_description,
			pm.created_at,
			a.name AS actor_name,
			a.email AS actor_email
		FROM onto_project_members pm
		LEFT JOIN onto_actors a ON a.id = pm.actor_id
		WHERE pm.project_id = p_project_id
			AND pm.removed_at IS NULL
		ORDER BY
			CASE pm.role_key
				WHEN 'owner' THEN 0
				WHEN 'editor' THEN 1
				ELSE 2
			END,
			pm.created_at ASC
	) m;

	IF p_focus_type IS NOT NULL AND p_focus_entity_id IS NOT NULL THEN
		CASE p_focus_type
			WHEN 'task' THEN
				SELECT to_jsonb(t) INTO v_focus_entity
				FROM onto_tasks t
				WHERE t.id = p_focus_entity_id AND t.project_id = p_project_id AND t.deleted_at IS NULL;
			WHEN 'goal' THEN
				SELECT to_jsonb(g) INTO v_focus_entity
				FROM onto_goals g
				WHERE g.id = p_focus_entity_id AND g.project_id = p_project_id AND g.deleted_at IS NULL;
			WHEN 'plan' THEN
				SELECT to_jsonb(pl) INTO v_focus_entity
				FROM onto_plans pl
				WHERE pl.id = p_focus_entity_id AND pl.project_id = p_project_id AND pl.deleted_at IS NULL;
			WHEN 'document' THEN
				SELECT to_jsonb(d) INTO v_focus_entity
				FROM onto_documents d
				WHERE d.id = p_focus_entity_id AND d.project_id = p_project_id AND d.deleted_at IS NULL;
			WHEN 'milestone' THEN
				SELECT to_jsonb(m) INTO v_focus_entity
				FROM onto_milestones m
				WHERE m.id = p_focus_entity_id AND m.project_id = p_project_id AND m.deleted_at IS NULL;
			WHEN 'risk' THEN
				SELECT to_jsonb(r) INTO v_focus_entity
				FROM onto_risks r
				WHERE r.id = p_focus_entity_id AND r.project_id = p_project_id AND r.deleted_at IS NULL;
			WHEN 'requirement' THEN
				SELECT to_jsonb(rq) INTO v_focus_entity
				FROM onto_requirements rq
				WHERE rq.id = p_focus_entity_id AND rq.project_id = p_project_id AND rq.deleted_at IS NULL;
			ELSE
				v_focus_entity := NULL;
		END CASE;

		WITH edges AS (
			SELECT src_id, src_kind, dst_id, dst_kind, rel
			FROM onto_edges
			WHERE project_id = p_project_id
				AND (src_id = p_focus_entity_id OR dst_id = p_focus_entity_id)
		)
		SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
		INTO v_linked_edges
		FROM (SELECT * FROM edges) e;

		WITH edges AS (
			SELECT src_id, src_kind, dst_id, dst_kind, rel
			FROM onto_edges
			WHERE project_id = p_project_id
				AND (src_id = p_focus_entity_id OR dst_id = p_focus_entity_id)
		),
		linked AS (
			SELECT dst_kind AS kind, dst_id AS id
			FROM edges
			WHERE src_id = p_focus_entity_id
			UNION
			SELECT src_kind AS kind, src_id AS id
			FROM edges
			WHERE dst_id = p_focus_entity_id
		)
		SELECT jsonb_build_object(
			'project', COALESCE((
				SELECT jsonb_agg(to_jsonb(p))
				FROM (
					SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at
					FROM onto_projects
					WHERE id IN (SELECT id FROM linked WHERE kind = 'project')
						AND deleted_at IS NULL
				) p
			), '[]'::jsonb),
			'task', COALESCE((
				SELECT jsonb_agg(to_jsonb(t))
				FROM (
					SELECT id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at
					FROM onto_tasks
					WHERE id IN (SELECT id FROM linked WHERE kind = 'task')
						AND deleted_at IS NULL
				) t
			), '[]'::jsonb),
			'plan', COALESCE((
				SELECT jsonb_agg(to_jsonb(pl))
				FROM (
					SELECT id, name, description, state_key, updated_at
					FROM onto_plans
					WHERE id IN (SELECT id FROM linked WHERE kind = 'plan')
						AND deleted_at IS NULL
				) pl
			), '[]'::jsonb),
			'goal', COALESCE((
				SELECT jsonb_agg(to_jsonb(g))
				FROM (
					SELECT id, name, description, state_key, target_date, completed_at, updated_at
					FROM onto_goals
					WHERE id IN (SELECT id FROM linked WHERE kind = 'goal')
						AND deleted_at IS NULL
				) g
			), '[]'::jsonb),
			'milestone', COALESCE((
				SELECT jsonb_agg(to_jsonb(m))
				FROM (
					SELECT id, title, description, state_key, due_at, completed_at, updated_at
					FROM onto_milestones
					WHERE id IN (SELECT id FROM linked WHERE kind = 'milestone')
						AND deleted_at IS NULL
				) m
			), '[]'::jsonb),
			'document', COALESCE((
				SELECT jsonb_agg(to_jsonb(d))
				FROM (
					SELECT id, title, description, state_key, updated_at
					FROM onto_documents
					WHERE id IN (SELECT id FROM linked WHERE kind = 'document')
						AND deleted_at IS NULL
				) d
			), '[]'::jsonb),
			'event', COALESCE((
				SELECT jsonb_agg(to_jsonb(e))
				FROM (
					SELECT id, title, description, state_key, start_at, end_at, all_day, location, updated_at
					FROM onto_events
					WHERE id IN (SELECT id FROM linked WHERE kind = 'event')
						AND deleted_at IS NULL
				) e
			), '[]'::jsonb),
			'risk', COALESCE((
				SELECT jsonb_agg(to_jsonb(r))
				FROM (
					SELECT id, title, content, state_key, impact, probability, updated_at
					FROM onto_risks
					WHERE id IN (SELECT id FROM linked WHERE kind = 'risk')
						AND deleted_at IS NULL
				) r
			), '[]'::jsonb),
			'requirement', COALESCE((
				SELECT jsonb_agg(to_jsonb(rq))
				FROM (
					SELECT id, text, priority, updated_at
					FROM onto_requirements
					WHERE id IN (SELECT id FROM linked WHERE kind = 'requirement')
						AND deleted_at IS NULL
				) rq
			), '[]'::jsonb)
		)
		INTO v_linked_entities;
	ELSE
		v_linked_edges := '[]'::jsonb;
		v_linked_entities := '{}'::jsonb;
	END IF;

	RETURN jsonb_build_object(
		'project', v_project,
		'goals', v_goals,
		'milestones', v_milestones,
		'plans', v_plans,
		'tasks', v_tasks,
		'events', v_events,
		'members', v_members,
		'focus_entity_full', v_focus_entity,
		'focus_entity_type', p_focus_type,
		'focus_entity_id', p_focus_entity_id,
		'linked_entities', v_linked_entities,
		'linked_edges', v_linked_edges
	);
END;
$$;

COMMENT ON FUNCTION load_fastchat_context(text, uuid, uuid, text, uuid) IS
	'Loads FastChat V2 context payload in a single round trip, including project members.';
