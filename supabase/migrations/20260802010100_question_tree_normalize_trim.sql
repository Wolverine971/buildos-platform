-- supabase/migrations/20260802010100_question_tree_normalize_trim.sql
-- Keep SQL question normalization aligned with the worker-side normalizer.
-- The original function could leave a trailing space when the question ended
-- in punctuation other than ?!., which let duplicate questions bypass the
-- per-run normalized_question uniqueness guard.

CREATE OR REPLACE FUNCTION public.question_tree_normalize_question(p_question text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
	SELECT btrim(regexp_replace(
		regexp_replace(lower(btrim(p_question)), '[?!.]+$', ''),
		'[^a-z0-9]+',
		' ',
		'g'
	));
$$;
