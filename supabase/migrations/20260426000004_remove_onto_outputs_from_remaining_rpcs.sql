-- supabase/migrations/20260426000004_remove_onto_outputs_from_remaining_rpcs.sql
-- Remove deprecated onto_outputs references from remaining active RPCs/endpoints.

CREATE OR REPLACE FUNCTION onto_search_entities(
	p_actor_id uuid,
	p_query text,
	p_project_id uuid DEFAULT NULL,
	p_types text[] DEFAULT NULL,
	p_limit int DEFAULT 50
)
RETURNS TABLE (
	type text,
	id uuid,
	project_id uuid,
	project_name text,
	title text,
	snippet text,
	score double precision
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_limit int := least(coalesce(p_limit, 50), 50);
	v_query tsquery;
BEGIN
	IF coalesce(trim(p_query), '') = '' THEN
		RETURN;
	END IF;

	v_query := websearch_to_tsquery('english', p_query);

	RETURN QUERY
	WITH params AS (SELECT v_query AS tsq)
	SELECT *
	FROM (
		-- Tasks
		SELECT
			'task'::text AS type,
			t.id,
			t.project_id,
			p.name AS project_name,
			t.title AS title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(t.title, ''), coalesce(t.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(t.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(t.title, ''), p_query) * 0.4) AS score
		FROM onto_tasks t
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = t.project_id
		WHERE t.created_by = p_actor_id
			AND t.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR t.project_id = p_project_id)
			AND (p_types IS NULL OR 'task' = any(p_types))
			AND (
				params.tsq @@ t.search_vector
				OR similarity(coalesce(t.title, ''), p_query) >= 0.2
			)

		UNION ALL

		-- Plans
		SELECT
			'plan'::text AS type,
			pl.id,
			pl.project_id,
			p.name AS project_name,
			pl.name AS title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(pl.name, ''), coalesce(pl.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(pl.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(pl.name, ''), p_query) * 0.4) AS score
		FROM onto_plans pl
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = pl.project_id
		WHERE pl.created_by = p_actor_id
			AND pl.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR pl.project_id = p_project_id)
			AND (p_types IS NULL OR 'plan' = any(p_types))
			AND (
				params.tsq @@ pl.search_vector
				OR similarity(coalesce(pl.name, ''), p_query) >= 0.2
			)

		UNION ALL

		-- Goals
		SELECT
			'goal'::text AS type,
			g.id,
			g.project_id,
			p.name AS project_name,
			g.name AS title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(g.name, ''), coalesce(g.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(g.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(g.name, ''), p_query) * 0.4) AS score
		FROM onto_goals g
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = g.project_id
		WHERE g.created_by = p_actor_id
			AND g.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR g.project_id = p_project_id)
			AND (p_types IS NULL OR 'goal' = any(p_types))
			AND (
				params.tsq @@ g.search_vector
				OR similarity(coalesce(g.name, ''), p_query) >= 0.2
			)

		UNION ALL

		-- Milestones
		SELECT
			'milestone'::text AS type,
			m.id,
			m.project_id,
			p.name AS project_name,
			m.title AS title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(m.title, ''), coalesce(m.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(m.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(m.title, ''), p_query) * 0.4) AS score
		FROM onto_milestones m
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = m.project_id
		WHERE m.created_by = p_actor_id
			AND m.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR m.project_id = p_project_id)
			AND (p_types IS NULL OR 'milestone' = any(p_types))
			AND (
				params.tsq @@ m.search_vector
				OR similarity(coalesce(m.title, ''), p_query) >= 0.2
			)

		UNION ALL

		-- Documents
		SELECT
			'document'::text AS type,
			d.id,
			d.project_id,
			p.name AS project_name,
			d.title AS title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(d.title, ''), coalesce(d.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(d.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(d.title, ''), p_query) * 0.4) AS score
		FROM onto_documents d
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = d.project_id
		WHERE d.created_by = p_actor_id
			AND d.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR d.project_id = p_project_id)
			AND (p_types IS NULL OR 'document' = any(p_types))
			AND (
				params.tsq @@ d.search_vector
				OR similarity(coalesce(d.title, ''), p_query) >= 0.2
			)

		UNION ALL

		-- Images
		SELECT
			'image'::text AS type,
			a.id,
			a.project_id,
			p.name AS project_name,
			coalesce(a.caption, a.alt_text, a.original_filename, 'Image') AS title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(a.caption, ''),
					coalesce(a.alt_text, ''),
					coalesce(a.extraction_summary, ''),
					coalesce(a.extracted_text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(a.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(a.caption, a.alt_text, a.original_filename, ''), p_query) * 0.4) AS score
		FROM onto_assets a
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = a.project_id
		WHERE a.created_by = p_actor_id
			AND a.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR a.project_id = p_project_id)
			AND (p_types IS NULL OR 'image' = any(p_types))
			AND (
				params.tsq @@ a.search_vector
				OR similarity(coalesce(a.caption, a.alt_text, a.original_filename, ''), p_query) >= 0.2
			)

		UNION ALL

		-- Requirements
		SELECT
			'requirement'::text AS type,
			r.id,
			r.project_id,
			p.name AS project_name,
			r."text" AS title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(r."text", ''), coalesce(r.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) AS snippet,
			(coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.6) +
			(similarity(coalesce(r."text", ''), p_query) * 0.4) AS score
		FROM onto_requirements r
		JOIN params ON true
		LEFT JOIN onto_projects p ON p.id = r.project_id
		WHERE r.created_by = p_actor_id
			AND r.deleted_at IS NULL
			AND p.deleted_at IS NULL
			AND (p_project_id IS NULL OR r.project_id = p_project_id)
			AND (p_types IS NULL OR 'requirement' = any(p_types))
			AND (
				params.tsq @@ r.search_vector
				OR similarity(coalesce(r."text", ''), p_query) >= 0.2
			)
	) AS results
	ORDER BY score DESC
	LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION delete_onto_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_goal_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_goals WHERE project_id = p_project_id), '{}'::uuid[]);
	v_requirement_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_requirements WHERE project_id = p_project_id), '{}'::uuid[]);
	v_plan_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_plans WHERE project_id = p_project_id), '{}'::uuid[]);
	v_task_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_tasks WHERE project_id = p_project_id), '{}'::uuid[]);
	v_document_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_documents WHERE project_id = p_project_id), '{}'::uuid[]);
	v_source_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_sources WHERE project_id = p_project_id), '{}'::uuid[]);
	v_risk_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_risks WHERE project_id = p_project_id), '{}'::uuid[]);
	v_milestone_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_milestones WHERE project_id = p_project_id), '{}'::uuid[]);
	v_metric_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_metrics WHERE project_id = p_project_id), '{}'::uuid[]);
	v_signal_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_signals WHERE project_id = p_project_id), '{}'::uuid[]);
	v_insight_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_insights WHERE project_id = p_project_id), '{}'::uuid[]);
	v_event_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_events WHERE project_id = p_project_id), '{}'::uuid[]);
	v_all_ids uuid[] := array[p_project_id];
BEGIN
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION 'Project ID required';
	END IF;

	v_all_ids := v_all_ids
		|| v_goal_ids
		|| v_requirement_ids
		|| v_plan_ids
		|| v_task_ids
		|| v_document_ids
		|| v_source_ids
		|| v_risk_ids
		|| v_milestone_ids
		|| v_metric_ids
		|| v_signal_ids
		|| v_insight_ids
		|| v_event_ids;

	DELETE FROM onto_event_sync WHERE event_id = any(v_event_ids);
	DELETE FROM onto_metric_points WHERE metric_id = any(v_metric_ids);
	DELETE FROM onto_document_versions WHERE document_id = any(v_document_ids);

	DELETE FROM onto_edges
	WHERE src_id = any(v_all_ids) OR dst_id = any(v_all_ids);

	DELETE FROM onto_assignments
	WHERE object_id = any(v_all_ids)
		AND object_kind = any (array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);

	DELETE FROM onto_permissions
	WHERE object_id = any(v_all_ids)
		AND object_kind = any (array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);

	DELETE FROM legacy_entity_mappings
	WHERE onto_id = any(v_all_ids)
		AND onto_table = any (array[
			'onto_projects',
			'onto_plans',
			'onto_tasks',
			'onto_goals',
			'onto_documents',
			'onto_requirements',
			'onto_milestones',
			'onto_risks',
			'onto_sources',
			'onto_metrics',
			'onto_signals',
			'onto_insights',
			'onto_events'
		]);

	DELETE FROM onto_events WHERE project_id = p_project_id;
	DELETE FROM onto_signals WHERE project_id = p_project_id;
	DELETE FROM onto_insights WHERE project_id = p_project_id;
	DELETE FROM onto_sources WHERE project_id = p_project_id;
	DELETE FROM onto_risks WHERE project_id = p_project_id;
	DELETE FROM onto_milestones WHERE project_id = p_project_id;
	DELETE FROM onto_metrics WHERE project_id = p_project_id;
	DELETE FROM onto_documents WHERE project_id = p_project_id;
	DELETE FROM onto_tasks WHERE project_id = p_project_id;
	DELETE FROM onto_plans WHERE project_id = p_project_id;
	DELETE FROM onto_requirements WHERE project_id = p_project_id;
	DELETE FROM onto_goals WHERE project_id = p_project_id;

	DELETE FROM onto_projects WHERE id = p_project_id;
END;
$$;

COMMENT ON FUNCTION delete_onto_project(uuid) IS
	'Deletes a project and all related ontology entities explicitly.';

GRANT EXECUTE ON FUNCTION delete_onto_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION onto_comment_validate_target(
	p_project_id uuid,
	p_entity_type text,
	p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	IF p_project_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
		RETURN false;
	END IF;

	CASE p_entity_type
		WHEN 'project' THEN
			RETURN p_entity_id = p_project_id;
		WHEN 'task' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_tasks t
				WHERE t.id = p_entity_id AND t.project_id = p_project_id
			);
		WHEN 'plan' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_plans pl
				WHERE pl.id = p_entity_id AND pl.project_id = p_project_id
			);
		WHEN 'document' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_documents d
				WHERE d.id = p_entity_id AND d.project_id = p_project_id
			);
		WHEN 'goal' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_goals g
				WHERE g.id = p_entity_id AND g.project_id = p_project_id
			);
		WHEN 'requirement' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_requirements r
				WHERE r.id = p_entity_id AND r.project_id = p_project_id
			);
		WHEN 'milestone' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_milestones m
				WHERE m.id = p_entity_id AND m.project_id = p_project_id
			);
		WHEN 'risk' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_risks rk
				WHERE rk.id = p_entity_id AND rk.project_id = p_project_id
			);
		WHEN 'event' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_events ev
				WHERE ev.id = p_entity_id AND ev.project_id = p_project_id
			);
		WHEN 'metric' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_metrics mt
				WHERE mt.id = p_entity_id AND mt.project_id = p_project_id
			);
		WHEN 'metric_point' THEN
			RETURN EXISTS (
				SELECT 1
				FROM onto_metric_points mp
				JOIN onto_metrics mt ON mt.id = mp.metric_id
				WHERE mp.id = p_entity_id AND mt.project_id = p_project_id
			);
		WHEN 'source' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_sources s
				WHERE s.id = p_entity_id AND s.project_id = p_project_id
			);
		WHEN 'signal' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_signals sg
				WHERE sg.id = p_entity_id AND sg.project_id = p_project_id
			);
		WHEN 'insight' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_insights i
				WHERE i.id = p_entity_id AND i.project_id = p_project_id
			);
		WHEN 'note' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_documents d
				WHERE d.id = p_entity_id AND d.project_id = p_project_id
			);
		ELSE
			RETURN false;
	END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION onto_comment_validate_target(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION get_allowed_transitions(
	p_object_kind text,
	p_object_id uuid
)
RETURNS TABLE (
	event text,
	to_state text,
	guards jsonb,
	actions jsonb,
	can_run boolean,
	failed_guards jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_current_state text;
	v_type_key text;
	v_scope text;
	v_fsm jsonb;
	v_entity jsonb;
	v_transition jsonb;
	v_guard_pass boolean;
	v_failed_guards jsonb;
	v_guard jsonb;
BEGIN
	IF p_object_kind IS NULL OR p_object_id IS NULL THEN
		RETURN;
	END IF;

	CASE p_object_kind
		WHEN 'project' THEN
			SELECT to_jsonb(p.*), p.state_key, p.type_key
			INTO v_entity, v_current_state, v_type_key
			FROM onto_projects p
			WHERE p.id = p_object_id;
			v_scope := 'project';

		WHEN 'plan' THEN
			SELECT to_jsonb(pl.*), pl.state_key, pl.type_key
			INTO v_entity, v_current_state, v_type_key
			FROM onto_plans pl
			WHERE pl.id = p_object_id;
			v_scope := 'plan';

		WHEN 'task' THEN
			SELECT to_jsonb(t.*), t.state_key, 'task.basic'::text
			INTO v_entity, v_current_state, v_type_key
			FROM onto_tasks t
			WHERE t.id = p_object_id;
			v_scope := 'task';

		WHEN 'document' THEN
			SELECT to_jsonb(d.*), coalesce(d.state_key, 'draft'), d.type_key
			INTO v_entity, v_current_state, v_type_key
			FROM onto_documents d
			WHERE d.id = p_object_id;
			v_scope := 'document';

		ELSE
			RETURN;
	END CASE;

	IF v_entity IS NULL OR v_type_key IS NULL OR v_scope IS NULL THEN
		RETURN;
	END IF;

	WITH RECURSIVE template_chain AS (
		SELECT
			t.id,
			t.parent_template_id,
			t.fsm,
			0 AS depth
		FROM onto_templates t
		WHERE t.type_key = v_type_key
			AND t.scope = v_scope

		UNION ALL

		SELECT
			parent.id,
			parent.parent_template_id,
			parent.fsm,
			template_chain.depth + 1
		FROM onto_templates parent
		JOIN template_chain ON template_chain.parent_template_id = parent.id
		WHERE template_chain.depth < 10
	)
	SELECT fsm
	INTO v_fsm
	FROM template_chain
	WHERE fsm IS NOT NULL
	ORDER BY depth
	LIMIT 1;

	IF v_fsm IS NULL THEN
		RETURN;
	END IF;

	FOR v_transition IN
		SELECT value
		FROM jsonb_array_elements(v_fsm->'transitions')
	LOOP
		IF v_transition->>'from' = v_current_state THEN
			v_failed_guards := '[]'::jsonb;

			IF v_transition ? 'guards' THEN
				FOR v_guard IN
					SELECT value
					FROM jsonb_array_elements(v_transition->'guards')
				LOOP
					IF NOT onto_check_guard(v_guard, v_entity) THEN
						v_failed_guards := v_failed_guards || jsonb_build_array(v_guard);
					END IF;
				END LOOP;
			END IF;

			v_guard_pass := jsonb_array_length(v_failed_guards) = 0;

			event := v_transition->>'event';
			to_state := v_transition->>'to';
			guards := coalesce(v_transition->'guards', '[]'::jsonb);
			actions := coalesce(v_transition->'actions', '[]'::jsonb);
			can_run := v_guard_pass;
			failed_guards := v_failed_guards;
			RETURN NEXT;
		END IF;
	END LOOP;

	RETURN;
END;
$$;

COMMENT ON FUNCTION get_allowed_transitions(text, uuid) IS
	'Returns transitions for an entity plus guard metadata and any failing guards.';

GRANT EXECUTE ON FUNCTION get_allowed_transitions(text, uuid) TO authenticated;
