-- packages/shared-types/src/functions/validate_facet_values.sql
-- validate_facet_values(jsonb, text)
-- Validate facet values
-- Source: supabase/migrations/20250601000002_ontology_helpers.sql

CREATE OR REPLACE FUNCTION validate_facet_values(p_facets jsonb, p_scope text)
RETURNS TABLE (
	facet_key text,
	provided_value text,
	error text
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_entry record;
	v_text_value text;
BEGIN
	IF p_facets IS NULL OR jsonb_typeof(p_facets) <> 'object' THEN
		RETURN;
	END IF;

	IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
		RAISE EXCEPTION 'validate_facet_values requires a non-null scope';
		RETURN;
	END IF;

	FOR v_entry IN
		SELECT key, value
		FROM jsonb_each(p_facets)
	LOOP
		-- Skip null values
		IF v_entry.value IS NULL OR v_entry.value = 'null'::jsonb THEN
			CONTINUE;
		END IF;

		IF jsonb_typeof(v_entry.value) <> 'string' THEN
			facet_key := v_entry.key;
			provided_value := v_entry.value::text;
			error := 'Facet value must be a string';
			RETURN NEXT;
			CONTINUE;
		END IF;

		v_text_value := v_entry.value #>> '{}';

		-- Ensure the facet key exists and applies to the given scope
		IF NOT EXISTS (
			SELECT 1
			FROM onto_facet_definitions d
			WHERE d.key = v_entry.key
		) THEN
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Unknown facet key: %s', v_entry.key);
			RETURN NEXT;
			CONTINUE;
		END IF;

		IF NOT EXISTS (
			SELECT 1
			FROM onto_facet_definitions d
			WHERE d.key = v_entry.key
				AND p_scope = any(d.applies_to)
		) THEN
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Facet "%s" does not apply to scope "%s"', v_entry.key, p_scope);
			RETURN NEXT;
			CONTINUE;
		END IF;

		-- Ensure the value is among the allowed options
		IF NOT EXISTS (
			SELECT 1
			FROM onto_facet_values v
			WHERE v.facet_key = v_entry.key
				AND v.value = v_text_value
		) THEN
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Facet value "%s" is not allowed for "%s"', v_text_value, v_entry.key);
			RETURN NEXT;
		END IF;
	END LOOP;
END;
$$;
