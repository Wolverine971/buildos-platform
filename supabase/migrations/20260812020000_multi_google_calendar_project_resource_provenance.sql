-- supabase/migrations/20260812020000_multi_google_calendar_project_resource_provenance.sql
-- Distinguish Google calendars created by BuildOS from existing calendars merely linked to a
-- project. Existing rows default to unlink-only because destructive ownership cannot be inferred.

BEGIN;

ALTER TABLE public.project_calendars
	ADD COLUMN provider_resource_managed boolean NOT NULL DEFAULT false;

ALTER TABLE public.project_calendars
	ADD CONSTRAINT project_calendars_managed_resource_requires_source_check
	CHECK (NOT provider_resource_managed OR calendar_source_id IS NOT NULL);

COMMENT ON COLUMN public.project_calendars.provider_resource_managed IS
	'True only when BuildOS created the provider calendar and may delete it; linked calendars remain false.';

COMMIT;
