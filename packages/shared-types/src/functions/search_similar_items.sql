-- packages/shared-types/src/functions/search_similar_items.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.search_similar_items(table_name text, query_embedding vector, similarity_threshold double precision DEFAULT 0.8, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, content text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF table_name = 'projects' THEN
    RETURN QUERY
    SELECT p.id, p.name::text, 1 - (p.embedding <=> query_embedding) as similarity
    FROM projects p
    WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > similarity_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
  ELSIF table_name = 'tasks' THEN
    RETURN QUERY
    SELECT t.id, t.title::text, 1 - (t.embedding <=> query_embedding) as similarity
    FROM tasks t
    WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > similarity_threshold
    ORDER BY t.embedding <=> query_embedding
    LIMIT match_count;
  -- Add more table cases as needed
  END IF;
END;
$function$
