-- supabase/tests/20261105120000_queue_jobs_server_only_writes.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120000_queue_jobs_server_only_writes.sql \
--     --check supabase/tests/20261105120000_queue_jobs_server_only_writes.check.sql
--
-- A signed-in user can still read their own queue rows, but can no longer rewrite or delete
-- them (the audit's bundle A), and the worker-only queue functions are service-role only.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO auth.users (id, email)
VALUES ('c1050000-0000-4000-8000-000000000001', 'queue-lock-a@example.com');
INSERT INTO public.users (id, email)
VALUES ('c1050000-0000-4000-8000-000000000001', 'queue-lock-a@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.queue_jobs (id, user_id, job_type, status, metadata, queue_job_id, priority, scheduled_for)
VALUES (
	'c1050000-0000-4000-8000-000000000010',
	'c1050000-0000-4000-8000-000000000001',
	'generate_daily_brief',
	'completed',
	'{}'::jsonb,
	'queue-lock-fixture-1',
	10,
	now()
);

-- 1. Grants and policies.
DO $$
BEGIN
	ASSERT has_table_privilege('authenticated', 'public.queue_jobs', 'SELECT'),
		'authenticated keeps SELECT (realtime brief progress)';
	ASSERT NOT has_table_privilege('authenticated', 'public.queue_jobs', 'UPDATE'),
		'authenticated must not UPDATE queue_jobs';
	ASSERT NOT has_table_privilege('authenticated', 'public.queue_jobs', 'DELETE'),
		'authenticated must not DELETE queue_jobs';
	ASSERT NOT has_table_privilege('authenticated', 'public.queue_jobs', 'INSERT'),
		'authenticated must not INSERT queue_jobs';
	ASSERT NOT has_table_privilege('anon', 'public.queue_jobs', 'UPDATE'),
		'anon must not UPDATE queue_jobs';
	ASSERT NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'queue_jobs'
			AND policyname IN ('queue_jobs_update', 'queue_jobs_delete')
	), 'owner UPDATE/DELETE policies are gone';
	ASSERT NOT has_function_privilege('authenticated', 'public.claim_pending_jobs(text[], integer)', 'EXECUTE'),
		'authenticated must not claim jobs';
	ASSERT NOT has_function_privilege('anon', 'public.delete_old_completed_queue_jobs(integer, integer, text[])', 'EXECUTE'),
		'anon must not delete queue history';
	ASSERT NOT has_function_privilege('authenticated', 'public.fail_queue_job(uuid, text, boolean, uuid)', 'EXECUTE'),
		'authenticated must not fail jobs';
	ASSERT has_function_privilege('service_role', 'public.claim_pending_jobs(text[], integer)', 'EXECUTE'),
		'service_role keeps the worker queue functions';
END;
$$;

-- 2. As the signed-in owner: read works, the rewrite that the audit described is refused.
BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1050000-0000-4000-8000-000000000001"}',
	true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_seen integer;
	v_refused boolean := false;
BEGIN
	SELECT count(*) INTO v_seen FROM public.queue_jobs
	WHERE id = 'c1050000-0000-4000-8000-000000000010';
	ASSERT v_seen = 1, 'owner can still read their own queue row';

	BEGIN
		UPDATE public.queue_jobs
		SET job_type = 'sync_calendar', status = 'pending', priority = 1,
			metadata = '{"targetUserId":"c1050000-0000-4000-8000-000000000099"}'::jsonb
		WHERE id = 'c1050000-0000-4000-8000-000000000010';
	EXCEPTION WHEN insufficient_privilege THEN
		v_refused := true;
	END;
	ASSERT v_refused, 'owner rewrite of their own queue row must be refused';

	v_refused := false;
	BEGIN
		DELETE FROM public.queue_jobs WHERE id = 'c1050000-0000-4000-8000-000000000010';
	EXCEPTION WHEN insufficient_privilege THEN
		v_refused := true;
	END;
	ASSERT v_refused, 'owner delete of their own queue row must be refused';
END;
$$;
ROLLBACK;

-- 3. The row is untouched and the service role can still cancel it.
DO $$
DECLARE
	v_row public.queue_jobs%ROWTYPE;
BEGIN
	SELECT * INTO v_row FROM public.queue_jobs WHERE id = 'c1050000-0000-4000-8000-000000000010';
	ASSERT v_row.job_type = 'generate_daily_brief' AND v_row.status = 'completed',
		'fixture row unchanged';
END;
$$;
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.queue_jobs SET status = 'cancelled'
WHERE id = 'c1050000-0000-4000-8000-000000000010';
ROLLBACK;

SELECT 'queue_jobs server-only writes: all checks passed' AS result;
