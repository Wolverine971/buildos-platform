-- supabase/migrations/20260514003000_tighten_project_notification_settings_access.sql
-- Project notification settings are collaborator settings. Public project
-- visibility must not let a non-member pass the first access gate.

DO $$
DECLARE
	v_function_sql text;
	v_updated_sql text;
	v_signature text;
BEGIN
	FOREACH v_signature IN ARRAY ARRAY[
		'public.get_project_notification_settings(uuid)',
		'public.set_project_notification_settings(uuid, boolean, boolean)'
	]
	LOOP
		SELECT pg_get_functiondef(v_signature::regprocedure)
		INTO v_function_sql;

		IF v_function_sql IS NULL THEN
			RAISE EXCEPTION 'Function % not found', v_signature;
		END IF;

		v_updated_sql := replace(
			v_function_sql,
			'current_actor_has_project_access(p_project_id, ''read'')',
			'current_actor_has_project_member_access(p_project_id, ''read'')'
		);

		v_updated_sql := replace(
			v_updated_sql,
			'public.current_actor_has_project_access(p_project_id, ''read'')',
			'public.current_actor_has_project_member_access(p_project_id, ''read'')'
		);

		IF v_updated_sql = v_function_sql THEN
			RAISE EXCEPTION 'Expected public-aware access check was not found in %', v_signature;
		END IF;

		EXECUTE v_updated_sql;
	END LOOP;
END
$$;
