-- packages/shared-types/src/functions/onto_check_guard.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.onto_check_guard(p_guard jsonb, p_entity jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
	v_type text;
	v_path text;
	v_key text;
	v_value text;
	v_pattern text;
	v_current text;
begin
	if p_guard is null or jsonb_typeof(p_guard) <> 'object' then
		return false;
	end if;

	v_type := p_guard->>'type';
	if v_type is null then
		return false;
	end if;

	case v_type
		when 'has_property' then
			v_path := p_guard->>'path';
			if v_path is null or length(v_path) = 0 then
				return false;
			end if;
			return onto_jsonb_has_value(p_entity, v_path);

		when 'has_facet' then
			v_key := p_guard->>'key';
			v_value := p_guard->>'value';
			if v_key is null or v_value is null then
				return false;
			end if;
			return onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key) = v_value;

		when 'facet_in' then
			v_key := p_guard->>'key';
			if v_key is null or p_guard->'values' is null then
				return false;
			end if;

			v_value := onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key);
			if v_value is null then
				return false;
			end if;

			return exists (
				select 1
				from jsonb_array_elements_text(p_guard->'values') as vals(val)
				where vals.val = v_value
			);

		when 'all_facets_set' then
			if p_guard->'keys' is null then
				return false;
			end if;

			return not exists (
				select 1
				from jsonb_array_elements_text(p_guard->'keys') as facet_keys(key)
				where not onto_jsonb_has_value(p_entity, 'props.facets.' || facet_keys.key)
			);

		when 'type_key_matches' then
			v_pattern := p_guard->>'pattern';
			if v_pattern is null then
				return false;
			end if;

			v_pattern := replace(v_pattern, '*', '.*');
			v_current := coalesce(p_entity->>'type_key', '');
			-- Use case-sensitive regex to match the transformed pattern
			return v_current ~ v_pattern;

		else
			return false;
	end case;
end;
$function$
