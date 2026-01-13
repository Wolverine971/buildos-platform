-- packages/shared-types/src/functions/generate_short_code.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.generate_short_code(length integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$function$
