-- packages/shared-types/src/functions/search_all_content.sql
-- search_all_content(text, uuid, integer)
-- Search all content across ontology entities
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION search_all_content(
  search_query text,
  current_user_id uuid,
  items_per_category integer DEFAULT 10
)
RETURNS TABLE (
  item_id uuid,
  item_type text,
  title text,
  description text,
  project_id uuid,
  relevance_score numeric,
  status text,
  is_completed boolean,
  is_deleted boolean,
  tags text[],
  matched_fields text[],
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id uuid;
  v_tsquery tsquery;
BEGIN
  SELECT id INTO v_actor_id FROM onto_actors WHERE user_id = current_user_id LIMIT 1;
  v_tsquery := plainto_tsquery('english', search_query);

  RETURN QUERY
  (
    SELECT
      t.id as item_id,
      'task'::text as item_type,
      t.title,
      t.description,
      t.project_id,
      ts_rank(t.search_vector, v_tsquery) as relevance_score,
      t.state_key::text as status,
      t.state_key = 'done' as is_completed,
      t.deleted_at IS NOT NULL as is_deleted,
      '{}'::text[] as tags,
      ARRAY['title', 'description'] as matched_fields,
      t.created_at,
      t.updated_at
    FROM onto_tasks t
    JOIN onto_projects p ON t.project_id = p.id
    WHERE p.created_by = v_actor_id
      AND t.deleted_at IS NULL
      AND t.search_vector @@ v_tsquery
    ORDER BY relevance_score DESC
    LIMIT items_per_category
  )
  UNION ALL
  (
    SELECT
      p.id as item_id,
      'project'::text as item_type,
      p.name as title,
      p.description,
      p.id as project_id,
      ts_rank(p.search_vector, v_tsquery) as relevance_score,
      p.state_key::text as status,
      p.state_key = 'completed' as is_completed,
      p.deleted_at IS NOT NULL as is_deleted,
      '{}'::text[] as tags,
      ARRAY['name', 'description'] as matched_fields,
      p.created_at,
      p.updated_at
    FROM onto_projects p
    WHERE p.created_by = v_actor_id
      AND p.deleted_at IS NULL
      AND p.search_vector @@ v_tsquery
    ORDER BY relevance_score DESC
    LIMIT items_per_category
  );
END;
$$;
