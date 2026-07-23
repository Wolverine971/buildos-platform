-- supabase/tests/20260723211500_gmail_relevance_scan_control_plane.test.sql
-- Disposable PostgreSQL verification for Gmail relevance Phase A, Slice 2.
-- Prerequisites: minimal platform tables, Slice 1, then the matching Slice 2 migration.
-- All fixtures are invented and intentionally contain no mailbox or message content.

\set ON_ERROR_STOP on

BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated;

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

CREATE OR REPLACE FUNCTION pg_temp.scan_manifest(
	p_user_id uuid,
	p_connection_ids uuid[],
	p_projects jsonb,
	p_expires_at timestamptz DEFAULT now() + interval '1 hour'
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
	SELECT jsonb_build_object(
		'manifest_schema_version', 'email-relevance-scan-manifest-v1',
		'control_plane_version', 'email-relevance-scan-control-plane-v1',
		'serializer_version', 'email-relevance-scan-serializer-v1',
		'profile_compiler_version', 'project-email-profile-v1',
		'quota_policy_version', 'email-relevance-gmail-quota-v1',
		'query_policy_version', 'inbox-sent-exclude-spam-trash-drafts-v1',
		'start_mode', 'manual',
		'user_id', p_user_id,
		'connection_ids', to_jsonb(p_connection_ids),
		'projects', p_projects,
		'window_start', '2026-06-01T00:00:00.000Z',
		'window_end', '2026-07-01T00:00:00.000Z',
		'expires_at', p_expires_at,
		'message_cap_per_connection', 1000,
		'metadata_batch_ceiling', 50,
		'per_connection_budgets', jsonb_build_object(
			'gmail_quota_units', 20050,
			'runtime_ms', 1200000,
			'raw_content_bytes', 0,
			'model_tokens', 0,
			'model_cost_micros', 0
		),
		'global_budgets', jsonb_build_object(
			'gmail_quota_units', cardinality(p_connection_ids) * 20050,
			'runtime_ms', cardinality(p_connection_ids) * 1200000,
			'raw_content_bytes', 0,
			'model_tokens', 0,
			'model_cost_micros', 0
		)
	);
$$;

CREATE TEMP TABLE scan_test_runs (
	name text PRIMARY KEY,
	run_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO public.users (id)
VALUES
	('00000000-0000-0000-0000-000000000001'),
	('00000000-0000-0000-0000-000000000002');

INSERT INTO public.onto_actors (id, user_id)
VALUES
	('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
	('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002');

INSERT INTO public.onto_projects (id, created_by)
VALUES
	('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
	('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101'),
	('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000102');

INSERT INTO public.user_email_connections (
	id,
	user_id,
	provider,
	status,
	read_enabled
)
VALUES
	(
		'00000000-0000-0000-0000-000000000301',
		'00000000-0000-0000-0000-000000000001',
		'google_gmail',
		'active',
		true
	),
	(
		'00000000-0000-0000-0000-000000000302',
		'00000000-0000-0000-0000-000000000001',
		'google_gmail',
		'active',
		true
	),
	(
		'00000000-0000-0000-0000-000000000303',
		'00000000-0000-0000-0000-000000000001',
		'google_gmail',
		'active',
		true
	),
	(
		'00000000-0000-0000-0000-000000000304',
		'00000000-0000-0000-0000-000000000002',
		'google_gmail',
		'active',
		true
	);

INSERT INTO public.email_project_profiles (id, user_id, project_id)
VALUES
	(
		'00000000-0000-0000-0000-000000000401',
		'00000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000201'
	),
	(
		'00000000-0000-0000-0000-000000000402',
		'00000000-0000-0000-0000-000000000001',
		'00000000-0000-0000-0000-000000000202'
	),
	(
		'00000000-0000-0000-0000-000000000403',
		'00000000-0000-0000-0000-000000000002',
		'00000000-0000-0000-0000-000000000203'
	);

INSERT INTO public.email_project_profile_versions (
	profile_id,
	profile_version,
	compiler_version,
	source_snapshot_at,
	profile_hash,
	groups
)
SELECT
	profile_id,
	1,
	'project-email-profile-v1',
	'2026-07-23T00:00:00Z'::timestamptz,
	profile_hash,
	jsonb_build_object(
		'identity', '[]'::jsonb,
		'actors', '[]'::jsonb,
		'artifacts', '[]'::jsonb,
		'identifiers', '[]'::jsonb,
		'semantic_context', '[]'::jsonb,
		'negative_evidence', '[]'::jsonb,
		'user_rules', '[]'::jsonb,
		'recency', '[]'::jsonb
	)
FROM (
	VALUES
		(
			'00000000-0000-0000-0000-000000000401'::uuid,
			'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'::text
		),
		(
			'00000000-0000-0000-0000-000000000402'::uuid,
			'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'::text
		),
		(
			'00000000-0000-0000-0000-000000000403'::uuid,
			'b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3'::text
		)
) AS fixtures(profile_id, profile_hash);

DO $$
DECLARE
	configuration jsonb;
	created_run_id uuid;
	repeated_run_id uuid;
	was_created boolean;
BEGIN
	configuration := pg_temp.scan_manifest(
		'00000000-0000-0000-0000-000000000001',
		ARRAY[
			'00000000-0000-0000-0000-000000000301'::uuid,
			'00000000-0000-0000-0000-000000000302'::uuid,
			'00000000-0000-0000-0000-000000000303'::uuid
		],
		jsonb_build_array(
			jsonb_build_object(
				'project_id', '00000000-0000-0000-0000-000000000201',
				'profile_id', '00000000-0000-0000-0000-000000000401',
				'profile_version', 1,
				'profile_hash', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
			),
			jsonb_build_object(
				'project_id', '00000000-0000-0000-0000-000000000202',
				'profile_id', '00000000-0000-0000-0000-000000000402',
				'profile_version', 1,
				'profile_hash', 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'
			)
		)
	);

	SELECT run_id, created INTO created_run_id, was_created
	FROM public.create_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		repeat('1', 64),
		repeat('2', 64),
		configuration
	);
	PERFORM pg_temp.assert_true(was_created, 'first manifest creation must create a run');

	SELECT run_id, created INTO repeated_run_id, was_created
	FROM public.create_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		repeat('1', 64),
		repeat('2', 64),
		configuration
	);
	PERFORM pg_temp.assert_true(NOT was_created, 'idempotent create must return the existing run');
	PERFORM pg_temp.assert_true(repeated_run_id = created_run_id, 'idempotent create changed run id');
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.email_relevance_scan_connections WHERE run_id = created_run_id) = 3,
		'three connection scopes were not created'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.email_relevance_scan_projects WHERE run_id = created_run_id) = 2,
		'two project scopes were not created'
	);

	BEGIN
		PERFORM *
		FROM public.create_email_relevance_scan_run(
			'00000000-0000-0000-0000-000000000001',
			repeat('1', 64),
			repeat('3', 64),
			configuration
		);
		RAISE EXCEPTION 'expected_idempotency_conflict';
	EXCEPTION
		WHEN unique_violation THEN NULL;
	END;

	INSERT INTO scan_test_runs (name, run_id) VALUES ('success', created_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_test_run(
	p_name text,
	p_connection_ids uuid[],
	p_hash_character text,
	p_expires_at timestamptz DEFAULT now() + interval '1 hour'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	created_run_id uuid;
	was_created boolean;
	selected_projects jsonb;
BEGIN
	SELECT configuration->'projects' INTO selected_projects
	FROM public.email_relevance_scan_runs
	WHERE id = (SELECT run_id FROM scan_test_runs WHERE name = 'success');

	SELECT run_id, created INTO created_run_id, was_created
	FROM public.create_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		repeat(p_hash_character, 64),
		repeat(p_hash_character, 64),
		pg_temp.scan_manifest(
			'00000000-0000-0000-0000-000000000001',
			p_connection_ids,
			selected_projects,
			p_expires_at
		)
	);
	PERFORM pg_temp.assert_true(was_created, p_name || ' run was not created');
	INSERT INTO scan_test_runs (name, run_id) VALUES (p_name, created_run_id);
	RETURN created_run_id;
END;
$$;

DO $$
DECLARE
	success_run_id uuid := (SELECT run_id FROM scan_test_runs WHERE name = 'success');
	scope_record record;
	second_scope_id uuid;
	step_number integer;
	processing_token text;
	competing_token text;
	claimed_result record;
	settled_result record;
	replay_result record;
	control_state text;
	reserved_before bigint;
	used_before bigint;
BEGIN
	control_state := public.control_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		success_run_id,
		'pause'
	);
	PERFORM pg_temp.assert_true(control_state = 'pending', 'pre-start pause must preserve pending state');

	SELECT id INTO second_scope_id
	FROM public.email_relevance_scan_connections
	WHERE run_id = success_run_id
	ORDER BY connection_id
	OFFSET 1 LIMIT 1;

	SELECT * INTO claimed_result
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		success_run_id,
		second_scope_id,
		0,
		repeat('a', 64),
		'synthetic_test',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(
		NOT claimed_result.claimed AND claimed_result.error_code = 'paused',
		'paused run allowed a new lease'
	);

	control_state := public.control_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		success_run_id,
		'resume'
	);
	PERFORM pg_temp.assert_true(control_state = 'pending', 'pre-start resume did not restore pending');

	FOR scope_record IN
		SELECT id, connection_id
		FROM public.email_relevance_scan_connections
		WHERE run_id = success_run_id
		ORDER BY connection_id
	LOOP
		FOR step_number IN 0..19 LOOP
			processing_token := encode(
				digest(scope_record.id::text || ':' || step_number::text, 'sha256'),
				'hex'
			);
			SELECT * INTO claimed_result
			FROM public.claim_email_relevance_scan_step(
				'00000000-0000-0000-0000-000000000001',
				success_run_id,
				scope_record.id,
				step_number,
				processing_token,
				'synthetic_test',
				1000,
				60000
			);
			PERFORM pg_temp.assert_true(
				claimed_result.claimed AND claimed_result.checkpoint_version = step_number,
				'bounded step claim failed'
			);

			IF scope_record.connection_id = '00000000-0000-0000-0000-000000000301'::uuid
				AND step_number = 0
			THEN
				competing_token := repeat('c', 64);
				SELECT * INTO replay_result
				FROM public.claim_email_relevance_scan_step(
					'00000000-0000-0000-0000-000000000001',
					success_run_id,
					scope_record.id,
					step_number,
					competing_token,
					'synthetic_competitor',
					1000,
					60000
				);
				PERFORM pg_temp.assert_true(
					NOT replay_result.claimed AND replay_result.error_code = 'lease_conflict',
					'concurrent claim did not produce exactly one winner'
				);
			END IF;

			SELECT * INTO settled_result
			FROM public.settle_email_relevance_scan_step(
				'00000000-0000-0000-0000-000000000001',
				success_run_id,
				scope_record.id,
				step_number,
				processing_token,
				claimed_result.operation_id,
				'success',
				1000,
				60000,
				NULL
			);
			PERFORM pg_temp.assert_true(
				settled_result.committed AND settled_result.checkpoint_version = step_number + 1,
				'successful settlement did not advance exactly once'
			);

			IF scope_record.connection_id = '00000000-0000-0000-0000-000000000301'::uuid
				AND step_number = 0
			THEN
				SELECT gmail_quota_used INTO used_before
				FROM public.email_relevance_scan_connections WHERE id = scope_record.id;
				SELECT * INTO replay_result
				FROM public.settle_email_relevance_scan_step(
					'00000000-0000-0000-0000-000000000001',
					success_run_id,
					scope_record.id,
					step_number,
					processing_token,
					claimed_result.operation_id,
					'success',
					1000,
					60000,
					NULL
				);
				PERFORM pg_temp.assert_true(
					NOT replay_result.committed AND replay_result.error_code = 'stale_checkpoint',
					'replayed settlement was not a no-op'
				);
				PERFORM pg_temp.assert_true(
					(SELECT gmail_quota_used FROM public.email_relevance_scan_connections WHERE id = scope_record.id)
						= used_before,
					'replayed settlement changed accounting'
				);

				control_state := public.control_email_relevance_scan_run(
					'00000000-0000-0000-0000-000000000001',
					success_run_id,
					'pause'
				);
				PERFORM pg_temp.assert_true(control_state = 'paused', 'started run did not pause');
				SELECT * INTO replay_result
				FROM public.claim_email_relevance_scan_step(
					'00000000-0000-0000-0000-000000000001',
					success_run_id,
					second_scope_id,
					0,
					repeat('d', 64),
					'synthetic_test',
					1000,
					60000
				);
				PERFORM pg_temp.assert_true(
					NOT replay_result.claimed AND replay_result.error_code = 'paused',
					'pause allowed another scope to lease'
				);
				control_state := public.control_email_relevance_scan_run(
					'00000000-0000-0000-0000-000000000001',
					success_run_id,
					'resume'
				);
				PERFORM pg_temp.assert_true(control_state = 'running', 'started run did not resume');
			END IF;
		END LOOP;
	END LOOP;

	SELECT gmail_quota_reserved INTO reserved_before
	FROM public.email_relevance_scan_runs WHERE id = success_run_id;
	PERFORM pg_temp.assert_true(reserved_before = 0, 'completed run retained a quota reservation');
	PERFORM pg_temp.assert_true(
		(SELECT state FROM public.email_relevance_scan_runs WHERE id = success_run_id) = 'completed',
		'three-account run did not complete'
	);
	PERFORM pg_temp.assert_true(
		(SELECT (steps_completed, messages_seen, gmail_quota_used, runtime_ms_used)
		 FROM public.email_relevance_scan_runs WHERE id = success_run_id)
		= (60, 3000, 60000::bigint, 3600000::bigint),
		'completed run aggregates are incorrect'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.email_relevance_scan_connections
			WHERE run_id = success_run_id
				AND (
					state <> 'completed'
					OR checkpoint_version <> 20
					OR steps_completed <> 20
					OR messages_seen <> 1000
					OR gmail_quota_reserved <> 0
					OR runtime_ms_reserved <> 0
				)
		),
		'one or more account scopes did not complete exactly once'
	);
END;
$$;

DO $$
DECLARE
	valid_configuration jsonb;
	unsorted_configuration jsonb;
	foreign_configuration jsonb;
BEGIN
	valid_configuration := (SELECT configuration FROM public.email_relevance_scan_runs LIMIT 1);
	unsorted_configuration := jsonb_set(
		valid_configuration,
		'{connection_ids}',
		jsonb_build_array(
			'00000000-0000-0000-0000-000000000303',
			'00000000-0000-0000-0000-000000000301',
			'00000000-0000-0000-0000-000000000302'
		)
	);
	PERFORM pg_temp.assert_true(
		NOT public.email_relevance_scan_configuration_is_valid(unsorted_configuration),
		'unsorted connection ids must be rejected'
	);

	foreign_configuration := pg_temp.scan_manifest(
		'00000000-0000-0000-0000-000000000001',
		ARRAY['00000000-0000-0000-0000-000000000304'::uuid],
		valid_configuration->'projects'
	);
	BEGIN
		PERFORM * FROM public.create_email_relevance_scan_run(
			'00000000-0000-0000-0000-000000000001',
			repeat('4', 64),
			repeat('5', 64),
			foreign_configuration
		);
		RAISE EXCEPTION 'expected_foreign_connection_rejection';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;

	foreign_configuration := pg_temp.scan_manifest(
		'00000000-0000-0000-0000-000000000001',
		ARRAY['00000000-0000-0000-0000-000000000301'::uuid],
		jsonb_build_array(jsonb_build_object(
			'project_id', '00000000-0000-0000-0000-000000000203',
			'profile_id', '00000000-0000-0000-0000-000000000403',
			'profile_version', 1,
			'profile_hash', 'b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3'
		))
	);
	BEGIN
		PERFORM * FROM public.create_email_relevance_scan_run(
			'00000000-0000-0000-0000-000000000001',
			repeat('6', 64),
			repeat('7', 64),
			foreign_configuration
		);
		RAISE EXCEPTION 'expected_foreign_project_rejection';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		UPDATE public.email_relevance_scan_runs SET manifest_hash = repeat('9', 64)
		WHERE id = (SELECT run_id FROM scan_test_runs WHERE name = 'success');
		RAISE EXCEPTION 'expected_manifest_immutability_rejection';
	EXCEPTION
		WHEN integrity_constraint_violation THEN NULL;
	END;
END;
$$;

DO $$
DECLARE
	lease_run_id uuid;
	lease_scope_id uuid;
	first_claim record;
	recovered_claim record;
	settled_result record;
BEGIN
	lease_run_id := pg_temp.create_test_run(
		'lease_recovery',
		ARRAY['00000000-0000-0000-0000-000000000301'::uuid],
		'4'
	);
	SELECT id INTO lease_scope_id
	FROM public.email_relevance_scan_connections WHERE run_id = lease_run_id;

	SELECT * INTO first_claim
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		lease_run_id,
		lease_scope_id,
		0,
		repeat('4', 64),
		'lease_recovery',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(first_claim.claimed, 'initial recovery claim failed');
	UPDATE public.email_relevance_scan_connections
	SET lease_expires_at = now() - interval '1 second'
	WHERE id = lease_scope_id;

	SELECT * INTO recovered_claim
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		lease_run_id,
		lease_scope_id,
		0,
		repeat('5', 64),
		'lease_recovery',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(recovered_claim.claimed, 'expired lease did not recover');
	PERFORM pg_temp.assert_true(
		(SELECT (gmail_quota_reserved, runtime_ms_reserved)
		 FROM public.email_relevance_scan_connections WHERE id = lease_scope_id)
		= (1000::bigint, 60000::bigint),
		'expired lease double-reserved account budget'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.email_relevance_scan_reservations
		 WHERE operation_id = first_claim.operation_id AND state = 'released') = 2,
		'expired lease reservations were not released'
	);

	SELECT * INTO settled_result
	FROM public.settle_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		lease_run_id,
		lease_scope_id,
		0,
		repeat('5', 64),
		recovered_claim.operation_id,
		'success',
		1000,
		60000,
		NULL
	);
	PERFORM pg_temp.assert_true(
		settled_result.committed AND settled_result.checkpoint_version = 1,
		'recovered lease did not settle exactly once'
	);
END;
$$;

DO $$
DECLARE
	run_id_to_exhaust uuid;
	scope_id_to_exhaust uuid;
	claim_result record;
	claim_number integer;
BEGIN
	run_id_to_exhaust := pg_temp.create_test_run(
		'lease_retry_exhaustion',
		ARRAY['00000000-0000-0000-0000-000000000302'::uuid],
		'5'
	);
	SELECT id INTO scope_id_to_exhaust
	FROM public.email_relevance_scan_connections WHERE run_id = run_id_to_exhaust;

	FOR claim_number IN 1..3 LOOP
		SELECT * INTO claim_result
		FROM public.claim_email_relevance_scan_step(
			'00000000-0000-0000-0000-000000000001',
			run_id_to_exhaust,
			scope_id_to_exhaust,
			0,
			encode(digest('expired:' || claim_number::text, 'sha256'), 'hex'),
			'lease_expiry',
			1000,
			60000
		);
		PERFORM pg_temp.assert_true(claim_result.claimed, 'lease attempt was not claimed');
		UPDATE public.email_relevance_scan_connections
		SET lease_expires_at = now() - interval '1 second'
		WHERE id = scope_id_to_exhaust;
	END LOOP;

	SELECT * INTO claim_result
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		run_id_to_exhaust,
		scope_id_to_exhaust,
		0,
		repeat('6', 64),
		'lease_expiry',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(
		NOT claim_result.claimed
			AND claim_result.scope_state = 'failed'
			AND claim_result.error_code = 'retry_exhausted',
		'third expired lease did not stop at retry exhaustion'
	);
	PERFORM pg_temp.assert_true(
		(SELECT (gmail_quota_reserved, runtime_ms_reserved)
		 FROM public.email_relevance_scan_connections WHERE id = scope_id_to_exhaust)
		= (0::bigint, 0::bigint),
		'retry exhaustion retained reservations'
	);
	PERFORM pg_temp.assert_true(
		(SELECT (state, terminal_reason_code)
		 FROM public.email_relevance_scan_runs WHERE id = run_id_to_exhaust)
		= ('failed'::text, 'retry_exhausted'::text),
		'retry exhaustion did not derive the fixed run reason'
	);
END;
$$;

DO $$
DECLARE
	budget_run_id uuid;
	budget_scope_id uuid;
	claim_result record;
	settled_result record;
	success_number integer;
	checkpoint integer := 0;
BEGIN
	budget_run_id := pg_temp.create_test_run(
		'budget_stop',
		ARRAY['00000000-0000-0000-0000-000000000303'::uuid],
		'6'
	);
	SELECT id INTO budget_scope_id
	FROM public.email_relevance_scan_connections WHERE run_id = budget_run_id;

	SELECT * INTO claim_result
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		budget_run_id,
		budget_scope_id,
		0,
		repeat('7', 64),
		'budget_stop',
		1000,
		60000
	);
	SELECT * INTO settled_result
	FROM public.settle_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		budget_run_id,
		budget_scope_id,
		0,
		repeat('7', 64),
		claim_result.operation_id,
		'retryable_failure',
		1000,
		60000,
		'synthetic_retryable'
	);
	PERFORM pg_temp.assert_true(
		settled_result.committed AND settled_result.scope_state = 'retry_wait',
		'retryable failure did not enter retry wait'
	);
	UPDATE public.email_relevance_scan_connections
	SET next_attempt_at = now() - interval '1 second'
	WHERE id = budget_scope_id;

	FOR success_number IN 1..19 LOOP
		SELECT * INTO claim_result
		FROM public.claim_email_relevance_scan_step(
			'00000000-0000-0000-0000-000000000001',
			budget_run_id,
			budget_scope_id,
			checkpoint,
			encode(digest('budget:' || success_number::text, 'sha256'), 'hex'),
			'budget_stop',
			1000,
			60000
		);
		PERFORM pg_temp.assert_true(claim_result.claimed, 'budget setup claim failed');
		SELECT * INTO settled_result
		FROM public.settle_email_relevance_scan_step(
			'00000000-0000-0000-0000-000000000001',
			budget_run_id,
			budget_scope_id,
			checkpoint,
			encode(digest('budget:' || success_number::text, 'sha256'), 'hex'),
			claim_result.operation_id,
			'success',
			1000,
			60000,
			NULL
		);
		PERFORM pg_temp.assert_true(settled_result.committed, 'budget setup settlement failed');
		checkpoint := checkpoint + 1;
	END LOOP;

	SELECT * INTO claim_result
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		budget_run_id,
		budget_scope_id,
		checkpoint,
		repeat('8', 64),
		'budget_stop',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(
		NOT claim_result.claimed
			AND claim_result.scope_state = 'quota_stopped'
			AND claim_result.error_code = 'budget_exceeded',
		'next over-budget operation was not denied before execution'
	);
	PERFORM pg_temp.assert_true(
		(SELECT (gmail_quota_reserved, gmail_quota_used, state)
		 FROM public.email_relevance_scan_connections WHERE id = budget_scope_id)
		= (0::bigint, 20000::bigint, 'quota_stopped'::text),
		'quota stop accounting is incorrect'
	);
	PERFORM pg_temp.assert_true(
		(SELECT state FROM public.email_relevance_scan_runs WHERE id = budget_run_id) = 'quota_stopped',
		'quota-stopped scope did not terminalize its run'
	);
END;
$$;

DO $$
DECLARE
	cancel_run_id uuid;
	active_cancel_run_id uuid;
	active_scope_id uuid;
	claim_result record;
	settled_result record;
	control_state text;
BEGIN
	cancel_run_id := pg_temp.create_test_run(
		'cancel_before_dispatch',
		ARRAY[
			'00000000-0000-0000-0000-000000000301'::uuid,
			'00000000-0000-0000-0000-000000000302'::uuid
		],
		'7'
	);
	control_state := public.control_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		cancel_run_id,
		'cancel'
	);
	PERFORM pg_temp.assert_true(control_state = 'cancelled', 'pre-dispatch cancellation failed');
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.email_relevance_scan_connections
			WHERE run_id = cancel_run_id AND state <> 'cancelled'
		),
		'pre-dispatch cancellation left runnable scopes'
	);

	active_cancel_run_id := pg_temp.create_test_run(
		'cancel_during_run',
		ARRAY['00000000-0000-0000-0000-000000000301'::uuid],
		'8'
	);
	SELECT id INTO active_scope_id
	FROM public.email_relevance_scan_connections WHERE run_id = active_cancel_run_id;
	SELECT * INTO claim_result
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		active_cancel_run_id,
		active_scope_id,
		0,
		repeat('9', 64),
		'cancel_during',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(claim_result.claimed, 'in-flight cancellation setup failed');
	control_state := public.control_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		active_cancel_run_id,
		'cancel'
	);
	PERFORM pg_temp.assert_true(
		(SELECT cancel_requested_at IS NOT NULL FROM public.email_relevance_scan_runs
		 WHERE id = active_cancel_run_id),
		'in-flight cancellation was not durably requested'
	);
	SELECT * INTO settled_result
	FROM public.settle_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		active_cancel_run_id,
		active_scope_id,
		0,
		repeat('9', 64),
		claim_result.operation_id,
		'success',
		1000,
		60000,
		NULL
	);
	PERFORM pg_temp.assert_true(
		settled_result.committed AND settled_result.scope_state = 'cancelled',
		'in-flight completion did not settle once at the cancellation boundary'
	);
	PERFORM pg_temp.assert_true(
		(SELECT state FROM public.email_relevance_scan_runs WHERE id = active_cancel_run_id) = 'cancelled',
		'in-flight cancellation did not terminalize the run'
	);

	BEGIN
		PERFORM public.control_email_relevance_scan_run(
			'00000000-0000-0000-0000-000000000002',
			active_cancel_run_id,
			'pause'
		);
		RAISE EXCEPTION 'expected_foreign_run_rejection';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		PERFORM * FROM public.claim_email_relevance_scan_step(
			NULL,
			active_cancel_run_id,
			active_scope_id,
			1,
			repeat('a', 64),
			'null_owner',
			1000,
			60000
		);
		RAISE EXCEPTION 'expected_null_owner_rejection';
	EXCEPTION
		WHEN invalid_parameter_value THEN NULL;
	END;
	BEGIN
		PERFORM * FROM public.claim_email_relevance_scan_step(
			'00000000-0000-0000-0000-000000000001',
			cancel_run_id,
			active_scope_id,
			1,
			repeat('a', 64),
			'wrong_run',
			1000,
			60000
		);
		RAISE EXCEPTION 'expected_run_scope_binding_rejection';
	EXCEPTION
		WHEN no_data_found THEN NULL;
	END;
END;
$$;

DO $$
DECLARE
	disconnect_run_id uuid;
	affected_scope_id uuid;
	unaffected_scope_id uuid;
	claim_result record;
BEGIN
	disconnect_run_id := pg_temp.create_test_run(
		'disconnect_isolation',
		ARRAY[
			'00000000-0000-0000-0000-000000000301'::uuid,
			'00000000-0000-0000-0000-000000000302'::uuid
		],
		'9'
	);
	SELECT id INTO affected_scope_id
	FROM public.email_relevance_scan_connections
	WHERE run_id = disconnect_run_id
		AND connection_id = '00000000-0000-0000-0000-000000000301';
	SELECT id INTO unaffected_scope_id
	FROM public.email_relevance_scan_connections
	WHERE run_id = disconnect_run_id
		AND connection_id = '00000000-0000-0000-0000-000000000302';

	SELECT * INTO claim_result
	FROM public.claim_email_relevance_scan_step(
		'00000000-0000-0000-0000-000000000001',
		disconnect_run_id,
		affected_scope_id,
		0,
		repeat('b', 64),
		'disconnect',
		1000,
		60000
	);
	PERFORM pg_temp.assert_true(claim_result.claimed, 'disconnect setup claim failed');

	UPDATE public.user_email_connections
	SET status = 'inactive'
	WHERE id = '00000000-0000-0000-0000-000000000301';
	PERFORM pg_temp.assert_true(
		(SELECT (
			connection_id IS NULL,
			state,
			terminal_reason_code,
			checkpoint_version,
			synthetic_step,
			gmail_quota_reserved,
			runtime_ms_reserved
		) FROM public.email_relevance_scan_connections WHERE id = affected_scope_id)
		= (true, 'cancelled'::text, 'connection_disconnected'::text, 1, 0, 0::bigint, 0::bigint),
		'disconnect did not clear and terminalize only the affected scope'
	);
	PERFORM pg_temp.assert_true(
		(SELECT (state, checkpoint_version, synthetic_step)
		 FROM public.email_relevance_scan_connections WHERE id = unaffected_scope_id)
		= ('pending'::text, 0, 0),
		'disconnect changed the unaffected connection scope'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.email_relevance_scan_reservations
		 WHERE operation_id = claim_result.operation_id AND state = 'released') = 2,
		'disconnect did not release the affected reservations'
	);

	UPDATE public.user_email_connections
	SET status = 'active'
	WHERE id = '00000000-0000-0000-0000-000000000301';
END;
$$;

DO $$
DECLARE
	test_run_id uuid := (SELECT run_id FROM scan_test_runs WHERE name = 'success');
	test_scope_id uuid;
BEGIN
	SELECT id INTO test_scope_id
	FROM public.email_relevance_scan_connections WHERE run_id = test_run_id LIMIT 1;
	BEGIN
		INSERT INTO public.email_relevance_scan_reservations (
			operation_id,
			run_id,
			connection_scope_id,
			checkpoint_version,
			resource_kind,
			operation_code,
			reserved_quantity,
			attempt,
			policy_version
		)
		VALUES (
			gen_random_uuid(),
			test_run_id,
			test_scope_id,
			20,
			'raw_content_bytes',
			'synthetic_step',
			1,
			1,
			'email-relevance-gmail-quota-v1'
		);
		RAISE EXCEPTION 'expected_disabled_resource_rejection';
	EXCEPTION
		WHEN check_violation THEN NULL;
	END;

	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name IN (
					'email_relevance_scan_runs',
					'email_relevance_scan_projects',
					'email_relevance_scan_connections',
					'email_relevance_scan_reservations'
				)
				AND column_name ~ '(email_address|gmail_query|provider_message|provider_thread|raw_cursor|subject|snippet|body|attachment|sender|recipient|domain|free_form|model_output)'
		),
		'forbidden content-bearing column detected'
	);
END;
$$;

DO $$
DECLARE
	expiry_run_id uuid;
	project_run_id uuid;
	expiry_projects jsonb;
	was_created boolean;
BEGIN
	SELECT jsonb_agg(project_entry.value ORDER BY project_entry.value->>'project_id')
	INTO expiry_projects
	FROM public.email_relevance_scan_runs AS run,
		jsonb_array_elements(run.configuration->'projects') AS project_entry(value)
	WHERE run.id = (SELECT run_id FROM scan_test_runs WHERE name = 'success')
		AND project_entry.value->>'project_id' = '00000000-0000-0000-0000-000000000202';
	SELECT run_id, created INTO expiry_run_id, was_created
	FROM public.create_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		repeat('b', 64),
		repeat('b', 64),
		pg_temp.scan_manifest(
			'00000000-0000-0000-0000-000000000001',
			ARRAY['00000000-0000-0000-0000-000000000303'::uuid],
			expiry_projects,
			clock_timestamp() + interval '2 seconds'
		)
	);
	PERFORM pg_temp.assert_true(was_created, 'expiring run was not created');
	INSERT INTO scan_test_runs (name, run_id) VALUES ('expiry', expiry_run_id);

	project_run_id := pg_temp.create_test_run(
		'project_invalidation',
		ARRAY['00000000-0000-0000-0000-000000000303'::uuid],
		'a'
	);
	UPDATE public.onto_projects
	SET deleted_at = now()
	WHERE id = '00000000-0000-0000-0000-000000000201';
	PERFORM pg_temp.assert_true(
		(SELECT (state, terminal_reason_code)
		 FROM public.email_relevance_scan_runs WHERE id = project_run_id)
		= ('failed'::text, 'project_unavailable'::text),
		'pre-start project invalidation did not fail closed'
	);
	PERFORM pg_temp.assert_true(
		(SELECT invalidation_reason_code
		 FROM public.email_relevance_scan_projects
		 WHERE run_id = project_run_id
			AND project_id = '00000000-0000-0000-0000-000000000201') = 'project_unavailable',
		'project selection was not durably invalidated'
	);
END;
$$;

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000001',
	true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
	visible_count integer;
	owned_count integer;
	owned_run_id uuid;
BEGIN
	SELECT count(*), count(*) FILTER (
		WHERE user_id = '00000000-0000-0000-0000-000000000001'
	)
	INTO visible_count, owned_count
	FROM public.email_relevance_scan_runs;
	IF visible_count = 0 OR visible_count <> owned_count THEN
		RAISE EXCEPTION 'owner RLS exposed an unexpected scan run';
	END IF;

	SELECT id INTO owned_run_id FROM public.email_relevance_scan_runs LIMIT 1;
	BEGIN
		UPDATE public.email_relevance_scan_runs
		SET pause_requested_at = now()
		WHERE id = owned_run_id;
		RAISE EXCEPTION 'expected_authenticated_write_denial';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		PERFORM public.control_email_relevance_scan_run(
			'00000000-0000-0000-0000-000000000001',
			owned_run_id,
			'pause'
		);
		RAISE EXCEPTION 'expected_authenticated_rpc_denial';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

RESET ROLE;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000002',
	true
);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM public.email_relevance_scan_runs) THEN
		RAISE EXCEPTION 'foreign RLS exposed scan runs';
	END IF;
	IF EXISTS (SELECT 1 FROM public.email_relevance_scan_projects) THEN
		RAISE EXCEPTION 'foreign RLS exposed project scopes';
	END IF;
	IF EXISTS (SELECT 1 FROM public.email_relevance_scan_connections) THEN
		RAISE EXCEPTION 'foreign RLS exposed connection scopes';
	END IF;
	IF EXISTS (SELECT 1 FROM public.email_relevance_scan_reservations) THEN
		RAISE EXCEPTION 'foreign RLS exposed reservations';
	END IF;
END;
$$;

RESET ROLE;

SELECT run_id AS expiry_run_id
FROM scan_test_runs
WHERE name = 'expiry'
\gset

COMMIT;

SELECT pg_sleep(
	GREATEST(
		0.0,
		EXTRACT(EPOCH FROM (expires_at - clock_timestamp())) + 0.05
	)
)
FROM public.email_relevance_scan_runs
WHERE id = :'expiry_run_id'::uuid;

BEGIN;

SELECT pg_temp.assert_true(
	public.expire_email_relevance_scan_run(
		'00000000-0000-0000-0000-000000000001',
		:'expiry_run_id'::uuid
	) = 'expired',
	'expired manifest did not terminalize'
);

SELECT pg_temp.assert_true(
	(
		SELECT (state, terminal_reason_code)
		FROM public.email_relevance_scan_runs
		WHERE id = :'expiry_run_id'::uuid
	) = ('expired'::text, 'manifest_expired'::text),
	'expired run state or reason is incorrect'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.email_relevance_scan_connections
		WHERE run_id = :'expiry_run_id'::uuid
			AND (
				state <> 'expired'
				OR gmail_quota_reserved <> 0
				OR runtime_ms_reserved <> 0
			)
	),
	'expired run retained runnable or reserved scopes'
);

COMMIT;

SELECT 'gmail_relevance_scan_control_plane_ok' AS result;
