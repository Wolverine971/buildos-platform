-- packages/shared-types/src/functions/current_actor_id.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.current_actor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id
  FROM onto_actors
  WHERE user_id = auth.uid();
$function$
