-- supabase/migrations/20260428000019_fix_ensure_actor_for_user_nullable_name.sql
-- `users.name` is nullable, so actor creation must check row existence rather than name presence.

CREATE OR REPLACE FUNCTION public.ensure_actor_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_actor_id uuid;
	v_user_name text;
	v_user_email text;
BEGIN
	SELECT id
	INTO v_actor_id
	FROM public.onto_actors
	WHERE user_id = p_user_id
	LIMIT 1;

	IF v_actor_id IS NOT NULL THEN
		RETURN v_actor_id;
	END IF;

	SELECT name, email
	INTO v_user_name, v_user_email
	FROM public.users
	WHERE id = p_user_id
	LIMIT 1;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'User not found: %', p_user_id;
	END IF;

	INSERT INTO public.onto_actors (kind, name, email, user_id)
	VALUES (
		'human',
		COALESCE(NULLIF(BTRIM(v_user_name), ''), NULLIF(BTRIM(v_user_email), ''), 'BuildOS User'),
		v_user_email,
		p_user_id
	)
	RETURNING id INTO v_actor_id;

	RETURN v_actor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_actor_for_user(uuid) TO authenticated;

COMMENT ON FUNCTION public.ensure_actor_for_user(uuid) IS
	'Ensures an actor record exists for a given user_id, creating one if needed. Returns actor_id.';
