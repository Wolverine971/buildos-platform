-- packages/shared-types/src/functions/onto_jsonb_extract.sql
-- onto_jsonb_extract(jsonb, text)
-- Extract JSONB value at path
-- Source: supabase/migrations/20250601000002_ontology_helpers.sql

CREATE OR REPLACE FUNCTION onto_jsonb_extract(p_json jsonb, p_path text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT
		CASE
			WHEN p_json IS NULL OR p_path IS NULL OR length(p_path) = 0 THEN NULL
			ELSE p_json #> string_to_array(p_path, '.')
		END;
$$;
