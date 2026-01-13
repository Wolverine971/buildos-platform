-- packages/shared-types/src/functions/ensure_actor_for_user.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.ensure_actor_for_user(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_actor_id uuid;
  v_user_name text;
  v_user_email text;
begin
  -- Check if actor already exists
  select id into v_actor_id
  from onto_actors
  where user_id = p_user_id;

  if v_actor_id is not null then
    return v_actor_id;
  end if;

  -- Get user info
  select name, email into v_user_name, v_user_email
  from public.users
  where id = p_user_id;

  if v_user_name is null then
    raise exception 'User not found: %', p_user_id;
  end if;

  -- Create new actor
  insert into onto_actors (kind, name, email, user_id)
  values ('human', coalesce(v_user_name, v_user_email, 'Unknown User'), v_user_email, p_user_id)
  returning id into v_actor_id;

  return v_actor_id;
end;
$function$
