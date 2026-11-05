-- supabase/tests/20261105120400_public_role_policies_rescope.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120400_public_role_policies_rescope.sql \
--     --check supabase/tests/20261105120400_public_role_policies_rescope.check.sql
--
-- Usage rows: a signed-in user logs their own usage, but cannot log usage under another user,
-- cannot log negative costs, and anon cannot log at all. Usage summaries are server-only.
-- Email attachment uploads need an admin.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO auth.users (id, email)
VALUES
	('c1054000-0000-4000-8000-000000000001', 'usage-a@example.com'),
	('c1054000-0000-4000-8000-000000000002', 'usage-b@example.com');
INSERT INTO public.users (id, email)
VALUES
	('c1054000-0000-4000-8000-000000000001', 'usage-a@example.com'),
	('c1054000-0000-4000-8000-000000000002', 'usage-b@example.com')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.log_usage(p_user uuid, p_cost numeric)
RETURNS void
LANGUAGE sql
AS $$
	INSERT INTO public.llm_usage_logs (
		user_id, operation_type, model_requested, model_used, prompt_tokens, completion_tokens,
		total_tokens, input_cost_usd, output_cost_usd, total_cost_usd, response_time_ms, status,
		request_started_at, request_completed_at
	)
	VALUES (
		p_user, 'workspace_capture_sort', 'fixture/model', 'fixture/model', 10, 10, 20,
		p_cost, 0, p_cost, 1, 'success', now(), now()
	)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.log_usage(uuid, numeric) TO anon, authenticated;

DO $$
BEGIN
	ASSERT NOT has_table_privilege('anon', 'public.llm_usage_logs', 'INSERT'),
		'anon must not insert usage rows';
	ASSERT NOT has_table_privilege('authenticated', 'public.llm_usage_logs', 'UPDATE'),
		'authenticated must not update usage rows';
	ASSERT NOT has_table_privilege('authenticated', 'public.llm_usage_summary', 'INSERT'),
		'authenticated must not write usage summaries';
	ASSERT NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE (schemaname, tablename) IN (('public', 'llm_usage_logs'), ('public', 'llm_usage_summary'), ('storage', 'objects'))
			AND roles = '{public}'
			AND cmd IN ('INSERT', 'ALL')
			AND (with_check = 'true' OR policyname = 'Allow email attachment uploads')
	), 'no PUBLIC WITH CHECK (true) write policy is left on these tables';
END;
$$;

-- Signed-in user A.
BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1054000-0000-4000-8000-000000000001"}',
	true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean;
BEGIN
	PERFORM pg_temp.log_usage('c1054000-0000-4000-8000-000000000001', 0.001);

	v_refused := false;
	BEGIN
		PERFORM pg_temp.log_usage('c1054000-0000-4000-8000-000000000002', 0.001);
	EXCEPTION WHEN insufficient_privilege THEN
		v_refused := true;
	END;
	ASSERT v_refused, 'A must not log usage under B';

	v_refused := false;
	BEGIN
		PERFORM pg_temp.log_usage('c1054000-0000-4000-8000-000000000001', -5);
	EXCEPTION WHEN check_violation THEN
		v_refused := true;
	END;
	ASSERT v_refused, 'negative cost must be refused';
END;
$$;
ROLLBACK;

-- Anonymous caller.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
DECLARE
	v_refused boolean := false;
BEGIN
	BEGIN
		PERFORM pg_temp.log_usage('c1054000-0000-4000-8000-000000000002', 0.001);
	EXCEPTION WHEN insufficient_privilege THEN
		v_refused := true;
	END;
	ASSERT v_refused, 'anon must not log usage';
END;
$$;
ROLLBACK;

SELECT 'public-role policy rescope: all checks passed' AS result;
