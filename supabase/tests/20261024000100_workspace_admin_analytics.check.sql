-- supabase/tests/20261024000100_workspace_admin_analytics.check.sql
-- The admin analytics counts skip Workspaces and the function still runs.
DO $$
DECLARE
	body text := pg_get_functiondef('public.get_admin_dashboard_comprehensive_analytics'::regproc);
	result record;
BEGIN
	IF (length(body) - length(replace(body, 'AND kind = ''project''', ''))) / length('AND kind = ''project''') < 2 THEN
		RAISE EXCEPTION 'admin analytics should filter both project windows to kind = project';
	END IF;
	SELECT * INTO result
	FROM public.get_admin_dashboard_comprehensive_analytics(now() - interval '1 day', now(), now() - interval '1 day');
	IF result.new_projects IS NULL THEN
		RAISE EXCEPTION 'admin analytics returned no row';
	END IF;
END $$;
