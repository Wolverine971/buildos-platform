-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_worker_access_boundary_base.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

CREATE FUNCTION pg_temp.claim_plan()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
	v_line record;
	v_plan text := '';
BEGIN
	FOR v_line IN EXECUTE $query$
		EXPLAIN (COSTS OFF)
		SELECT job.id
		FROM public.queue_jobs job
		WHERE job.status = 'pending'::public.queue_status
			AND job.job_type = ANY(
				ARRAY['libri_maintenance']::public.queue_type[]
			)
			AND job.scheduled_for <= now()
		ORDER BY job.priority ASC, job.scheduled_for ASC
		LIMIT 2
		FOR UPDATE SKIP LOCKED
	$query$
	LOOP
		v_plan := v_plan || v_line."QUERY PLAN" || E'\n';
	END LOOP;
	RETURN v_plan;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT
			rolcanlogin
			AND NOT rolsuper
			AND NOT rolcreatedb
			AND NOT rolcreaterole
			AND NOT rolinherit
			AND NOT rolreplication
			AND NOT rolbypassrls
			AND rolconnlimit = 3
		FROM pg_catalog.pg_roles
		WHERE rolname = 'libri_worker'
	),
	'libri_worker must be a connection-capped login without elevated role attributes'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_catalog.pg_auth_members membership
		JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
		WHERE member_role.rolname = 'libri_worker'
	),
	'libri_worker must not inherit any role memberships'
);
SELECT pg_temp.assert_true(
	has_column_privilege('libri_worker', 'libri.libraries', 'id', 'SELECT')
		AND has_column_privilege('libri_worker', 'libri.libraries', 'created_by', 'SELECT')
		AND NOT has_column_privilege('libri_worker', 'libri.libraries', 'name', 'SELECT')
		AND has_column_privilege('libri_worker', 'libri.research_steps', 'status', 'UPDATE')
		AND NOT has_column_privilege('libri_worker', 'libri.research_steps', 'payload', 'UPDATE')
		AND NOT has_table_privilege('libri_worker', 'libri.research_steps', 'INSERT, DELETE')
		AND has_column_privilege('libri_worker', 'public.queue_jobs', 'job_type', 'INSERT')
		AND NOT has_column_privilege('libri_worker', 'public.queue_jobs', 'job_type', 'UPDATE')
		AND NOT has_table_privilege('libri_worker', 'public.queue_jobs', 'DELETE'),
	'worker grants must expose only the lifecycle columns and never queue deletion or retagging'
);
SELECT pg_temp.assert_true(
	(
		SELECT array_agg(policyname::text ORDER BY policyname::text)
		FROM pg_policies
		WHERE schemaname IN ('libri', 'public')
			AND 'libri_worker' = ANY(roles)
	) = ARRAY[
		'libraries_libri_worker_select',
		'queue_jobs_libri_worker_insert',
		'queue_jobs_libri_worker_select',
		'queue_jobs_libri_worker_update',
		'research_runs_libri_worker_select',
		'research_runs_libri_worker_update',
		'research_steps_libri_worker_select',
		'research_steps_libri_worker_update'
	],
	'the worker must receive exactly the reviewed RLS policy set'
);

INSERT INTO auth.users (id) VALUES ('81111111-1111-4111-8111-111111111111');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'worker-test',
	'Worker test library',
	'81111111-1111-4111-8111-111111111111'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'81111111-1111-4111-8111-111111111111',
	'owner'
);
INSERT INTO libri.research_runs (
	id,
	library_id,
	idempotency_key,
	queue_family,
	kind,
	subject_type,
	requested_by_actor,
	planned_steps
) VALUES (
	'81000000-0000-4000-8000-000000000001',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'worker-boundary-run',
	'libri_maintenance',
	'synthetic_smoke',
	'maintenance',
	'system',
	1
);
INSERT INTO libri.research_steps (
	id,
	library_id,
	run_id,
	idempotency_key,
	queue_family,
	kind,
	stage,
	position
) VALUES (
	'82000000-0000-4000-8000-000000000001',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'81000000-0000-4000-8000-000000000001',
	'worker-boundary-step',
	'libri_maintenance',
	'synthetic_smoke',
	'maintenance',
	0
);
INSERT INTO public.queue_jobs (
	id,
	queue_job_id,
	user_id,
	job_type,
	status,
	priority,
	scheduled_for
) VALUES (
	'83000000-0000-4000-8000-000000000001',
	'other_83000000-0000-4000-8000-000000000001',
	'81111111-1111-4111-8111-111111111111',
	'other',
	'pending',
	1,
	now()
);

SET ROLE libri_worker;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.research_runs),
	'worker must read orchestration state'
);

DO $$
BEGIN
	BEGIN
		PERFORM name FROM libri.libraries;
		RAISE EXCEPTION 'worker unexpectedly read an ungranted library column';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
	BEGIN
		PERFORM id FROM libri.people;
		RAISE EXCEPTION 'worker unexpectedly read a non-orchestration Libri table';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
	BEGIN
		UPDATE libri.research_steps SET payload = '{"unsafe":true}'::jsonb;
		RAISE EXCEPTION 'worker unexpectedly changed immutable step input';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
	BEGIN
		INSERT INTO public.queue_jobs (
			queue_job_id, user_id, job_type, status, scheduled_for
		) VALUES (
			'other_forbidden',
			'81111111-1111-4111-8111-111111111111',
			'other',
			'pending',
			now()
		);
		RAISE EXCEPTION 'worker unexpectedly inserted a non-Libri queue job';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
END;
$$;

INSERT INTO public.queue_jobs (
	queue_job_id,
	user_id,
	job_type,
	metadata,
	status,
	priority,
	scheduled_for,
	dedup_key,
	attempts,
	max_attempts
) VALUES (
	'libri_maintenance_83000000-0000-4000-8000-000000000002',
	'81111111-1111-4111-8111-111111111111',
	'libri_maintenance',
	'{"research_step_id":"82000000-0000-4000-8000-000000000001"}',
	'pending',
	1,
	now(),
	'libri:test:boundary',
	0,
	2
);

UPDATE libri.research_steps
SET
	status = 'queued',
	active_queue_job_id = (
		SELECT id
		FROM public.queue_jobs
		WHERE queue_job_id = 'libri_maintenance_83000000-0000-4000-8000-000000000002'
	)
WHERE id = '82000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.queue_jobs),
	'queue RLS must expose the Libri row and hide the BuildOS row'
);

SET enable_seqscan = off;
SELECT pg_temp.assert_true(
	pg_temp.claim_plan() LIKE '%idx_queue_jobs_pending_claim_priority%',
	'the enum-array claim predicate must use the production pending-claim index'
);
RESET enable_seqscan;

RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM public.queue_jobs),
	'failed cross-family admission must leave the BuildOS and Libri rows unchanged'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'pending'
		FROM public.queue_jobs
		WHERE id = '83000000-0000-4000-8000-000000000001'
	),
	'worker activity must not mutate the non-Libri queue row'
);
