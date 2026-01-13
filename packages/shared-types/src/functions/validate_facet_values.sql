-- packages/shared-types/src/functions/validate_facet_values.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.validate_facet_values(p_facets jsonb, p_scope text)
 RETURNS TABLE(facet_key text, provided_value text, error text)
 LANGUAGE plpgsql
AS $function$
declare
	v_entry record;
	v_text_value text;
begin
	if p_facets is null or jsonb_typeof(p_facets) <> 'object' then
		return;
	end if;

	if p_scope is null or length(trim(p_scope)) = 0 then
		raise exception 'validate_facet_values requires a non-null scope';
		return;
	end if;

	for v_entry in
		select key, value
		from jsonb_each(p_facets)
	loop
		-- Skip null values
		if v_entry.value is null or v_entry.value = 'null'::jsonb then
			continue;
		end if;

		if jsonb_typeof(v_entry.value) <> 'string' then
			facet_key := v_entry.key;
			provided_value := v_entry.value::text;
			error := 'Facet value must be a string';
			return next;
			continue;
		end if;

		v_text_value := v_entry.value #>> '{}';

		-- Ensure the facet key exists and applies to the given scope
		if not exists (
			select 1
			from onto_facet_definitions d
			where d.key = v_entry.key
		) then
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Unknown facet key: %s', v_entry.key);
			return next;
			continue;
		end if;

		if not exists (
			select 1
			from onto_facet_definitions d
			where d.key = v_entry.key
				and p_scope = any(d.applies_to)
		) then
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Facet "%s" does not apply to scope "%s"', v_entry.key, p_scope);
			return next;
			continue;
		end if;

		-- Ensure the value is among the allowed options
		if not exists (
			select 1
			from onto_facet_values v
			where v.facet_key = v_entry.key
				and v.value = v_text_value
		) then
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Facet value "%s" is not allowed for "%s"', v_text_value, v_entry.key);
			return next;
		end if;
	end loop;
end;
$function$
