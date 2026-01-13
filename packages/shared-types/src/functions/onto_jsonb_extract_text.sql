-- packages/shared-types/src/functions/onto_jsonb_extract_text.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.onto_jsonb_extract_text(p_json jsonb, p_path text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
	select
		case
			when p_json is null or p_path is null or length(p_path) = 0 then null
			else p_json #>> string_to_array(p_path, '.')
		end;
$function$
