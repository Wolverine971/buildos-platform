-- supabase/migrations/20260514002000_tighten_fastchat_context_access.sql
-- Tighten FastChat project context hydration so public project visibility is not
-- treated as collaboration access.
--
-- `load_fastchat_context` can run under service role for external-agent gateway
-- calls. The project-specific path must check the intended actor's membership,
-- not `current_actor_has_project_access`, because that helper grants public
-- project reads and service-role bypasses.

DO $$
DECLARE
	v_function_sql text;
	v_updated_sql text;
BEGIN
	SELECT pg_get_functiondef(
		'public.load_fastchat_context(text, uuid, uuid, text, uuid)'::regprocedure
	)
	INTO v_function_sql;

	IF v_function_sql IS NULL THEN
		RAISE EXCEPTION 'Function public.load_fastchat_context(text, uuid, uuid, text, uuid) not found';
	END IF;

	v_updated_sql := replace(
		v_function_sql,
		'IF NOT current_actor_has_project_access(p_project_id, ''read'') THEN',
		'IF NOT actor_has_project_member_access(v_actor_id, p_project_id, ''read'') THEN'
	);

	v_updated_sql := replace(
		v_updated_sql,
		'IF NOT public.current_actor_has_project_access(p_project_id, ''read'') THEN',
		'IF NOT public.actor_has_project_member_access(v_actor_id, p_project_id, ''read'') THEN'
	);

	IF v_updated_sql = v_function_sql THEN
		RAISE EXCEPTION 'Expected public-aware load_fastchat_context project access check was not found';
	END IF;

	EXECUTE v_updated_sql;
END
$$;
