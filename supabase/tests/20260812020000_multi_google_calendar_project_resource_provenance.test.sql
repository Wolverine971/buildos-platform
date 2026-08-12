-- supabase/tests/20260812020000_multi_google_calendar_project_resource_provenance.test.sql
BEGIN;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'project_calendars'
			AND column_name = 'provider_resource_managed'
			AND is_nullable = 'NO'
			AND column_default = 'false'
	) THEN
		RAISE EXCEPTION 'project calendar provider-resource provenance column is missing';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.project_calendars'::regclass
			AND conname = 'project_calendars_managed_resource_requires_source_check'
			AND convalidated
	) THEN
		RAISE EXCEPTION 'managed project calendar source constraint is missing';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.project_calendars
		WHERE provider_resource_managed
	) THEN
		RAISE EXCEPTION 'legacy project calendars were incorrectly marked provider-managed';
	END IF;
END;
$$;

ROLLBACK;
