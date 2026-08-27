-- supabase/tests/20260827040932_scope_member_rls_policies_to_authenticated.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/member_rls_policy_scope_base.sql
\ir ../migrations/20260827040932_scope_member_rls_policies_to_authenticated.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname IN ('public', 'storage')
			AND (
				COALESCE(qual, '') ILIKE '%current_actor_has_project_member_access%'
				OR COALESCE(with_check, '') ILIKE '%current_actor_has_project_member_access%'
			)
			AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
	),
	'member-only access policies must not run for anonymous callers'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.current_actor_has_project_member_access(uuid,text)',
		'execute'
	),
	'the member-access helper must remain unavailable to anon callers'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'onto_public_pages'
			AND policyname = 'public_page_select_public'
			AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
	),
	'the public-page read policy must remain available to anonymous callers'
);

SET LOCAL ROLE anon;

-- Regression: this query raised 42501 while the member policy applied to
-- PUBLIC but its helper function had no anon EXECUTE grant.
SELECT count(*)
FROM public.onto_public_pages
WHERE status = 'published'
	AND public_status = 'live'
	AND visibility = 'public'
	AND noindex = false
	AND deleted_at IS NULL;

RESET ROLE;
ROLLBACK;
