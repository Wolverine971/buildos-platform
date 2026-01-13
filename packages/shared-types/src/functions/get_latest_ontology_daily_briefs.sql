-- packages/shared-types/src/functions/get_latest_ontology_daily_briefs.sql
-- get_latest_ontology_daily_briefs(uuid[])
-- Get latest daily briefs for users
-- Source: supabase/migrations/20260116_get_latest_ontology_daily_briefs.sql

CREATE OR REPLACE FUNCTION public.get_latest_ontology_daily_briefs(user_ids uuid[])
RETURNS TABLE (
  id uuid,
  user_id uuid,
  brief_date date,
  generation_status text,
  executive_summary text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (odb.user_id)
    odb.id,
    odb.user_id,
    odb.brief_date,
    odb.generation_status::text,
    odb.executive_summary,
    odb.created_at
  FROM ontology_daily_briefs odb
  WHERE odb.user_id = ANY(user_ids)
    AND odb.generation_status = 'completed'
  ORDER BY odb.user_id, odb.brief_date DESC, odb.created_at DESC;
END;
$$;
