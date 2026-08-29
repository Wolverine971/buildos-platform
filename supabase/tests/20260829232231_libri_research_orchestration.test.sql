-- supabase/tests/20260829232231_libri_research_orchestration.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_research_orchestration_base.sql

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

SELECT pg_temp.assert_true(
	(SELECT count(*) = 23 FROM pg_tables WHERE schemaname = 'libri'),
	'phase 3B.1 must leave exactly twenty-three Libri tables'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 23
		FROM pg_class relation
		JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
		WHERE namespace.nspname = 'libri'
			AND relation.relkind = 'r'
			AND relation.relrowsecurity
			AND relation.relforcerowsecurity
	),
	'every Libri table must enable and force RLS'
);
SELECT pg_temp.assert_true(
	(
		SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumlabel::text)
		FROM pg_enum enum_value
		JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
		JOIN pg_namespace namespace ON namespace.oid = enum_type.typnamespace
		WHERE namespace.nspname = 'public'
			AND enum_type.typname = 'queue_type'
			AND enum_value.enumlabel LIKE 'libri_%'
	) = ARRAY['libri_derive', 'libri_ingest', 'libri_maintenance', 'libri_research'],
	'the four stable Libri queue labels must exist exactly once'
);
SELECT pg_temp.assert_true(
	NOT has_schema_privilege('anon', 'libri', 'USAGE')
		AND NOT has_table_privilege('anon', 'libri.research_runs', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.research_steps', 'SELECT'),
	'anon must not have schema or orchestration-table access'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.research_runs', 'SELECT')
		AND has_table_privilege('authenticated', 'libri.research_steps', 'SELECT')
		AND NOT has_table_privilege(
			'authenticated',
			'libri.research_runs',
			'INSERT, UPDATE, DELETE'
		)
		AND NOT has_table_privilege(
			'authenticated',
			'libri.research_steps',
			'INSERT, UPDATE, DELETE'
		),
	'authenticated orchestration access must be read-only'
);
SELECT pg_temp.assert_true(
	has_table_privilege(
		'service_role',
		'libri.research_runs',
		'SELECT, INSERT, UPDATE, DELETE'
	)
		AND has_table_privilege(
			'service_role',
			'libri.research_steps',
			'SELECT, INSERT, UPDATE, DELETE'
		),
	'the temporary service role must have the worker table privileges while claims stay disabled'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint foreign_key
		JOIN pg_class relation ON relation.oid = foreign_key.conrelid
		JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
		WHERE foreign_key.contype = 'f'
			AND namespace.nspname = 'libri'
			AND NOT EXISTS (
				SELECT 1
				FROM pg_index index_definition
				WHERE index_definition.indrelid = foreign_key.conrelid
					AND index_definition.indisvalid
					AND (
						SELECT array_agg(attribute_number ORDER BY ordinal_position)
						FROM unnest(index_definition.indkey::smallint[])
							WITH ORDINALITY AS indexed_column(attribute_number, ordinal_position)
						WHERE ordinal_position <= cardinality(foreign_key.conkey)
					) = foreign_key.conkey
			)
	),
	'every Libri foreign key must have a valid index with matching leading columns'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint dependency
		JOIN pg_class source_relation ON source_relation.oid = dependency.conrelid
		JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
		JOIN pg_class target_relation ON target_relation.oid = dependency.confrelid
		JOIN pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
		WHERE dependency.contype = 'f'
			AND source_namespace.nspname <> 'libri'
			AND target_namespace.nspname = 'libri'
	),
	'non-Libri schemas must not acquire foreign keys to orchestration tables'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc procedure
		JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
		WHERE namespace.nspname = 'libri' AND procedure.prosecdef
	),
	'phase 3B.1 must not introduce SECURITY DEFINER functions'
);

INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'),
	('22222222-2222-4222-8222-222222222222'),
	('33333333-3333-4333-8333-333333333333'),
	('44444444-4444-4444-8444-444444444444');

INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'primary',
		'Primary library',
		'11111111-1111-4111-8111-111111111111'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'secondary',
		'Secondary library',
		'44444444-4444-4444-8444-444444444444'
	);

INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'viewer'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '44444444-4444-4444-8444-444444444444', 'owner');

INSERT INTO libri.research_runs (
	id,
	library_id,
	correlation_id,
	idempotency_key,
	queue_family,
	kind,
	subject_type,
	subject_id,
	requested_by_actor,
	requested_by,
	planned_steps
) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'11000000-0000-4000-8000-000000000001',
		'run:primary:book',
		'libri_research',
		'research_book',
		'book',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'user',
		'11111111-1111-4111-8111-111111111111',
		2
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'11000000-0000-4000-8000-000000000002',
		'run:secondary:maintenance',
		'libri_maintenance',
		'synthetic_smoke',
		'maintenance',
		NULL,
		'system',
		NULL,
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
	'20000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'10000000-0000-4000-8000-000000000001',
	'step:resolve',
	'libri_research',
	'resolve_book',
	'resolve_subject',
	0
);

INSERT INTO libri.research_steps (
	id,
	library_id,
	run_id,
	parent_step_id,
	idempotency_key,
	queue_family,
	kind,
	stage,
	position,
	depth,
	status,
	active_queue_job_id,
	active_processing_token,
	execution_generation,
	lease_token,
	lease_owner,
	leased_at,
	lease_expires_at,
	last_heartbeat_at,
	started_at
) VALUES (
	'20000000-0000-4000-8000-000000000002',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'10000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000001',
	'step:discover',
	'libri_research',
	'discover_book_sources',
	'discover_candidates',
	1,
	1,
	'leased',
	'30000000-0000-4000-8000-000000000001',
	'31000000-0000-4000-8000-000000000001',
	1,
	'32000000-0000-4000-8000-000000000001',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.research_runs (
			library_id,
			idempotency_key,
			queue_family,
			kind,
			subject_type,
			subject_id,
			requested_by_actor,
			requested_by
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'run:primary:book',
			'libri_research',
			'research_book_again',
			'book',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'user',
			'11111111-1111-4111-8111-111111111111'
		);
		RAISE EXCEPTION 'duplicate run idempotency key unexpectedly succeeded';
	EXCEPTION WHEN unique_violation THEN
		NULL;
	END;

	BEGIN
		INSERT INTO libri.research_steps (
			library_id,
			run_id,
			idempotency_key,
			queue_family,
			kind,
			stage,
			position
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
			'10000000-0000-4000-8000-000000000001',
			'step:cross-library',
			'libri_research',
			'unsafe',
			'resolve_subject',
			0
		);
		RAISE EXCEPTION 'cross-library run reference unexpectedly succeeded';
	EXCEPTION WHEN foreign_key_violation THEN
		NULL;
	END;

	BEGIN
		INSERT INTO libri.research_steps (
			library_id,
			run_id,
			idempotency_key,
			queue_family,
			kind,
			stage,
			position,
			status
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000001',
			'step:bad-lease',
			'libri_research',
			'unsafe',
			'capture_sources',
			2,
			'leased'
		);
		RAISE EXCEPTION 'leased step without a fencing envelope unexpectedly succeeded';
	EXCEPTION WHEN check_violation THEN
		NULL;
	END;
END;
$$;

UPDATE libri.research_runs
SET status = 'running',
	started_at = now(),
	last_progress_at = now(),
	execution_generation = 1
WHERE id = '10000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running'
			AND execution_generation = 1
			AND updated_at >= created_at
		FROM libri.research_runs
		WHERE id = '10000000-0000-4000-8000-000000000001'
	),
	'run state and generation must update atomically under the table constraints'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'leased'
			AND execution_generation = 1
			AND lease_expires_at > leased_at
		FROM libri.research_steps
		WHERE id = '20000000-0000-4000-8000-000000000002'
	),
	'a leased step must retain a complete ownership and generation envelope'
);

SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.research_runs),
	'an owner must only see runs in a member library'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM libri.research_steps),
	'an owner must only see steps in a member library'
);
DO $$
BEGIN
	BEGIN
		INSERT INTO libri.research_runs (
			library_id,
			idempotency_key,
			queue_family,
			kind,
			subject_type,
			subject_id,
			requested_by_actor,
			requested_by
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'run:browser-write',
			'libri_research',
			'unsafe_browser_write',
			'book',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'user',
			'11111111-1111-4111-8111-111111111111'
		);
		RAISE EXCEPTION 'authenticated orchestration write unexpectedly succeeded';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
END;
$$;
RESET ROLE;

SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.research_runs),
	'a viewer may read member-library run status'
);
RESET ROLE;

SET request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM libri.research_runs)
		AND (SELECT count(*) = 0 FROM libri.research_steps),
	'a non-member must not see orchestration state'
);
RESET ROLE;

SET request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.research_runs)
		AND (SELECT count(*) = 0 FROM libri.research_steps),
	'the secondary owner must only see secondary orchestration state'
);
RESET ROLE;

SELECT 'libri research orchestration contract passed' AS result;
