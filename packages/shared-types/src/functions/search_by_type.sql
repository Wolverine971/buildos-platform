-- packages/shared-types/src/functions/search_by_type.sql
-- search_by_type(text, text, uuid, integer, integer)
-- Search content by specific type
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION search_by_type(
  search_query text,
  search_type text,
  current_user_id uuid,
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  item_id uuid,
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

  IF search_type = 'task' THEN
    RETURN QUERY
    SELECT
      t.id as item_id,
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
    LIMIT page_limit OFFSET page_offset;
  ELSIF search_type = 'project' THEN
    RETURN QUERY
    SELECT
      p.id as item_id,
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
    LIMIT page_limit OFFSET page_offset;
  END IF;
END;
$$;
