-- supabase/migrations/20260426000016_project_calendars_unique_project_user.sql
-- Enforce one project calendar mapping per (project_id, user_id).

BEGIN;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM project_calendars
		GROUP BY project_id, user_id
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION
			'Duplicate project_calendars rows found for the same (project_id, user_id). Deduplicate before applying unique constraint.';
	END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_calendars_project_user
	ON project_calendars(project_id, user_id);

COMMIT;
