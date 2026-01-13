-- packages/shared-types/src/functions/onto_search_entities.sql
-- onto_search_entities(uuid, text, uuid, text[], int)
-- Search ontology entities
-- Source: supabase/migrations/20251224000000_ontology_search_vectors.sql

CREATE OR REPLACE FUNCTION onto_search_entities(
  p_actor_id uuid,
  p_query text,
  p_project_id uuid default null,
  p_types text[] default null,
  p_limit int default 50
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
      AND (p_project_id IS NULL OR d.project_id = p_project_id)
      AND (p_types IS NULL OR 'document' = any(p_types))
      AND (
        params.tsq @@ d.search_vector
        OR similarity(coalesce(d.title, ''), p_query) >= 0.2
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
