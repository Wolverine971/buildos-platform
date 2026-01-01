-- supabase/migrations/20260116_get_latest_ontology_daily_briefs.sql

CREATE OR REPLACE FUNCTION public.get_latest_ontology_daily_briefs(user_ids uuid[])
RETURNS TABLE (
	user_id uuid,
	brief_date date,
	generation_completed_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
	SELECT DISTINCT ON (user_id)
		user_id,
		brief_date,
		generation_completed_at
	FROM ontology_daily_briefs
	WHERE user_id = ANY (user_ids)
	ORDER BY user_id, brief_date DESC;
$$;
