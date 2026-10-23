-- supabase/tests/20261024000200_project_skeleton_kind.check.sql
-- The skeleton RPC still runs for a caller and now carries the project's kind.
DO $$
BEGIN
	IF position('''kind'', p.kind' in pg_get_functiondef('public.get_project_skeleton_with_access_v2'::regproc)) = 0 THEN
		RAISE EXCEPTION 'skeleton RPC should return kind';
	END IF;
	IF NOT has_function_privilege('authenticated', 'public.get_project_skeleton_with_access_v2(uuid)', 'EXECUTE') THEN
		RAISE EXCEPTION 'authenticated lost EXECUTE on the skeleton RPC';
	END IF;
END $$;
