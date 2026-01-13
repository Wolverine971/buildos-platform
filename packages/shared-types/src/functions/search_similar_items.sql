-- packages/shared-types/src/functions/search_similar_items.sql
-- search_similar_items(text, vector, numeric, integer)
-- Search similar items by vector in a specific table
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION search_similar_items(
  table_name text,
  query_embedding vector,
  similarity_threshold numeric DEFAULT 0.5,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF table_name = 'onto_tasks' THEN
    RETURN QUERY
    SELECT
      t.id,
      COALESCE(t.title, '') || ' ' || COALESCE(t.description, '') as content,
      1 - (t.embedding <=> query_embedding) as similarity
    FROM onto_tasks t
    WHERE t.embedding IS NOT NULL
      AND t.deleted_at IS NULL
      AND 1 - (t.embedding <=> query_embedding) > similarity_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
  ELSIF table_name = 'onto_documents' THEN
    RETURN QUERY
    SELECT
      d.id,
      COALESCE(d.title, '') || ' ' || COALESCE(d.content, '') as content,
      1 - (d.embedding <=> query_embedding) as similarity
    FROM onto_documents d
    WHERE d.embedding IS NOT NULL
      AND d.deleted_at IS NULL
      AND 1 - (d.embedding <=> query_embedding) > similarity_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
  END IF;
END;
$$;
