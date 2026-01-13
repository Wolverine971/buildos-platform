-- packages/shared-types/src/functions/ensure_actor_for_user.sql
-- ensure_actor_for_user(uuid)
-- Ensure actor exists for user
-- Source: supabase/migrations/20250601000001_ontology_system.sql

CREATE OR REPLACE FUNCTION ensure_actor_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id uuid;
  v_user_name text;
  v_user_email text;
BEGIN
  -- Check if actor already exists
  SELECT id INTO v_actor_id
  FROM onto_actors
  WHERE user_id = p_user_id;

  IF v_actor_id IS NOT NULL THEN
    RETURN v_actor_id;
  END IF;

  -- Get user info
  SELECT name, email INTO v_user_name, v_user_email
  FROM public.users
  WHERE id = p_user_id;

  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Create new actor
  INSERT INTO onto_actors (kind, name, email, user_id)
  VALUES ('human', coalesce(v_user_name, v_user_email, 'Unknown User'), v_user_email, p_user_id)
  RETURNING id INTO v_actor_id;

  RETURN v_actor_id;
END;
$$;
