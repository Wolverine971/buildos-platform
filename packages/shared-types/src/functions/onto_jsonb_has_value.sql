-- packages/shared-types/src/functions/onto_jsonb_has_value.sql
-- onto_jsonb_has_value(jsonb, text)
-- Check if JSONB has value at path
-- Source: supabase/migrations/20250601000002_ontology_helpers.sql

CREATE OR REPLACE FUNCTION onto_jsonb_has_value(p_json jsonb, p_path text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
	v_value jsonb;
BEGIN
	IF p_json IS NULL OR p_path IS NULL OR length(p_path) = 0 THEN
		RETURN false;
	END IF;

	v_value := onto_jsonb_extract(p_json, p_path);

	IF v_value IS NULL THEN
		RETURN false;
	END IF;

	IF v_value = 'null'::jsonb THEN
		RETURN false;
	END IF;

	RETURN true;
END;
$$;
