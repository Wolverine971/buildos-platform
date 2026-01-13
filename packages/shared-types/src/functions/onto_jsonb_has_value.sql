-- packages/shared-types/src/functions/onto_jsonb_has_value.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.onto_jsonb_has_value(p_json jsonb, p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
	v_value jsonb;
begin
	if p_json is null or p_path is null or length(p_path) = 0 then
		return false;
	end if;

	v_value := onto_jsonb_extract(p_json, p_path);

	if v_value is null then
		return false;
	end if;

	if v_value = 'null'::jsonb then
		return false;
	end if;

	return true;
end;
$function$
