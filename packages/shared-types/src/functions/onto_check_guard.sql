-- packages/shared-types/src/functions/onto_check_guard.sql
-- onto_check_guard(jsonb, jsonb)
-- Check ontology guard condition
-- Source: supabase/migrations/20250601000002_ontology_helpers.sql

CREATE OR REPLACE FUNCTION onto_check_guard(p_guard jsonb, p_entity jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
	v_type text;
	v_path text;
	v_key text;
	v_value text;
	v_pattern text;
	v_current text;
BEGIN
	IF p_guard IS NULL OR jsonb_typeof(p_guard) <> 'object' THEN
		RETURN false;
	END IF;

	v_type := p_guard->>'type';
	IF v_type IS NULL THEN
		RETURN false;
	END IF;

	CASE v_type
		WHEN 'has_property' THEN
			v_path := p_guard->>'path';
			IF v_path IS NULL OR length(v_path) = 0 THEN
				RETURN false;
			END IF;
			RETURN onto_jsonb_has_value(p_entity, v_path);

		WHEN 'has_facet' THEN
			v_key := p_guard->>'key';
			v_value := p_guard->>'value';
			IF v_key IS NULL OR v_value IS NULL THEN
				RETURN false;
			END IF;
			RETURN onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key) = v_value;

		WHEN 'facet_in' THEN
			v_key := p_guard->>'key';
			IF v_key IS NULL OR p_guard->'values' IS NULL THEN
				RETURN false;
			END IF;

			v_value := onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key);
			IF v_value IS NULL THEN
				RETURN false;
			END IF;

			RETURN EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(p_guard->'values') AS vals(val)
				WHERE vals.val = v_value
			);

		WHEN 'all_facets_set' THEN
			IF p_guard->'keys' IS NULL THEN
				RETURN false;
			END IF;

			RETURN NOT EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(p_guard->'keys') AS facet_keys(key)
				WHERE NOT onto_jsonb_has_value(p_entity, 'props.facets.' || facet_keys.key)
			);

		WHEN 'type_key_matches' THEN
			v_pattern := p_guard->>'pattern';
			IF v_pattern IS NULL THEN
				RETURN false;
			END IF;

			v_pattern := replace(v_pattern, '*', '.*');
			v_current := coalesce(p_entity->>'type_key', '');
			-- Use case-sensitive regex to match the transformed pattern
			RETURN v_current ~ v_pattern;

		ELSE
			RETURN false;
	END CASE;
END;
$$;
