-- Disposable PostgreSQL verification for Gmail relevance Phase A, Slice 4.
-- Prerequisites: minimal platform tables plus Slice 1, Slice 2, Slice 3, Slice 4, and retention
-- migrations. All fixtures are invented and contain no mailbox content.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run this fixture harness against a linked database.

\set ON_ERROR_STOP on

BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.review_manifest(
	p_user_id uuid,
	p_connection_ids uuid[],
	p_projects jsonb
)
RETURNS jsonb LANGUAGE sql STABLE AS $$
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
		'window_start', '2026-06-24T00:00:00.000Z',
		'window_end', '2026-07-24T00:00:00.000Z',
		'expires_at', now() + interval '1 hour',
		'message_cap_per_connection', 1000,
		'metadata_batch_ceiling', 50,
		'per_connection_budgets', jsonb_build_object(
			'gmail_quota_units', 20050, 'runtime_ms', 1200000,
			'raw_content_bytes', 0, 'model_tokens', 0, 'model_cost_micros', 0
		),
		'global_budgets', jsonb_build_object(
			'gmail_quota_units', cardinality(p_connection_ids) * 20050,
			'runtime_ms', cardinality(p_connection_ids) * 1200000,
			'raw_content_bytes', 0, 'model_tokens', 0, 'model_cost_micros', 0
		)
	);
$$;

INSERT INTO public.users (id) VALUES
	('10000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000002');

INSERT INTO public.onto_actors (id, user_id) VALUES
	('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
	('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002');

INSERT INTO public.onto_projects (id, created_by) VALUES
	('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001'),
	('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001'),
	('12000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001'),
	('12000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000002');

INSERT INTO public.user_email_connections (id, user_id, provider, status, read_enabled) VALUES
	('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'google_gmail', 'active', true),
	('13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'google_gmail', 'active', true),
	('13000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'google_gmail', 'active', true);

INSERT INTO public.email_project_profiles (id, user_id, project_id) VALUES
	('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001'),
	('14000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002'),
	('14000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003');

INSERT INTO public.email_project_profile_versions (
	id, profile_id, profile_version, compiler_version, source_snapshot_at, profile_hash, groups
) VALUES
	(
		'15000000-0000-4000-8000-000000000001',
		'14000000-0000-4000-8000-000000000001', 1, 'project-email-profile-v1', now(),
		repeat('a', 64),
		'{"identity":[],"actors":[],"artifacts":[],"identifiers":[],"semantic_context":[],"negative_evidence":[],"user_rules":[],"recency":[]}'::jsonb
	),
	(
		'15000000-0000-4000-8000-000000000002',
		'14000000-0000-4000-8000-000000000002', 1, 'project-email-profile-v1', now(),
		repeat('b', 64),
		'{"identity":[],"actors":[],"artifacts":[],"identifiers":[],"semantic_context":[],"negative_evidence":[],"user_rules":[],"recency":[]}'::jsonb
	),
	(
		'15000000-0000-4000-8000-000000000003',
		'14000000-0000-4000-8000-000000000003', 1, 'project-email-profile-v1', now(),
		repeat('c', 64),
		'{"identity":[],"actors":[],"artifacts":[],"identifiers":[],"semantic_context":[],"negative_evidence":[],"user_rules":[],"recency":[]}'::jsonb
	);

CREATE TEMP TABLE review_runtime (run_id uuid PRIMARY KEY) ON COMMIT DROP;

DO $$
DECLARE
	created record;
	configuration jsonb;
BEGIN
	configuration := pg_temp.review_manifest(
		'10000000-0000-4000-8000-000000000001',
		ARRAY[
			'13000000-0000-4000-8000-000000000001'::uuid,
			'13000000-0000-4000-8000-000000000002'::uuid,
			'13000000-0000-4000-8000-000000000003'::uuid
		],
		jsonb_build_array(
			jsonb_build_object(
				'project_id', '12000000-0000-4000-8000-000000000001',
				'profile_id', '14000000-0000-4000-8000-000000000001',
				'profile_version', 1, 'profile_hash', repeat('a', 64)
			),
			jsonb_build_object(
				'project_id', '12000000-0000-4000-8000-000000000002',
				'profile_id', '14000000-0000-4000-8000-000000000002',
				'profile_version', 1, 'profile_hash', repeat('b', 64)
			),
			jsonb_build_object(
				'project_id', '12000000-0000-4000-8000-000000000003',
				'profile_id', '14000000-0000-4000-8000-000000000003',
				'profile_version', 1, 'profile_hash', repeat('c', 64)
			)
		)
	);
	SELECT * INTO created FROM public.create_email_relevance_scan_run(
		'10000000-0000-4000-8000-000000000001', repeat('d', 64), repeat('e', 64), configuration
	);
	INSERT INTO review_runtime VALUES (created.run_id);
END;
$$;

CREATE TEMP TABLE review_observation_fixture (
	observation_id uuid PRIMARY KEY,
	connection_scope_id uuid NOT NULL,
	ordinal integer NOT NULL
) ON COMMIT DROP;

INSERT INTO review_observation_fixture
SELECT gen_random_uuid(), scope.id, ordinal
FROM public.email_relevance_scan_connections scope
JOIN review_runtime runtime ON runtime.run_id = scope.run_id
CROSS JOIN generate_series(1, 100) AS ordinal;

INSERT INTO public.email_relevance_message_observations (
	id, user_id, run_id, connection_scope_id,
	provider_message_id_hash, provider_message_id_ciphertext,
	provider_thread_id_hash, provider_thread_id_ciphertext,
	key_version, discovery_page, internal_date, mailbox_inbox, mailbox_sent,
	processing_state, evidence_fingerprints, retention_expires_at, created_at, processed_at
)
SELECT
	fixture.observation_id,
	'10000000-0000-4000-8000-000000000001',
	runtime.run_id,
	fixture.connection_scope_id,
	encode(digest(fixture.connection_scope_id::text || ':message:' || fixture.ordinal, 'sha256'), 'hex'),
	'enc:gmail-relevance:v1.synthetic-message-' || fixture.ordinal,
	encode(digest(fixture.connection_scope_id::text || ':thread:' || fixture.ordinal, 'sha256'), 'hex'),
	'enc:gmail-relevance:v1.synthetic-thread-' || fixture.ordinal,
	1, 1, now() - fixture.ordinal * interval '1 minute', true, false,
	'processed', '{}'::text[], now() + interval '6 days', now() - interval '1 hour', now()
FROM review_observation_fixture fixture
CROSS JOIN review_runtime runtime;

INSERT INTO public.email_relevance_project_candidates (
	observation_id, user_id, project_id, profile_version_id, variant,
	scorer_version, policy_version, score, confidence,
	actor_overlap, domain_overlap, lexical_overlap, retention_expires_at, created_at
)
SELECT
	fixture.observation_id,
	'10000000-0000-4000-8000-000000000001',
	project.project_id,
	version.id,
	variant.code,
	'email-relevance-ab-scorer-v1',
	'email-relevance-metadata-policy-v1',
	CASE WHEN variant.code = 'a' THEN 72 ELSE 48 END,
	CASE WHEN variant.code = 'a' THEN 0.72 ELSE 0.48 END,
	variant.code = 'a', variant.code = 'a', variant.code = 'b',
	now() + interval '6 days', now() - interval '1 hour'
FROM review_observation_fixture fixture
CROSS JOIN public.email_relevance_scan_projects project
JOIN review_runtime runtime ON runtime.run_id = project.run_id
JOIN public.email_project_profile_versions version
	ON version.profile_id = project.profile_id
	AND version.profile_version = project.profile_version
CROSS JOIN LATERAL (
	SELECT 'a'::text AS code WHERE fixture.ordinal % 4 IN (0, 1)
	UNION ALL
	SELECT 'b'::text AS code WHERE fixture.ordinal % 4 IN (1, 2)
) variant;

UPDATE public.email_relevance_scan_connections
SET state = 'completed', terminal_reason_code = 'completed', messages_seen = 100,
	observations_discovered = 100, observations_processed = 100,
	completed_at = now(), updated_at = now()
WHERE run_id = (SELECT run_id FROM review_runtime);

UPDATE public.email_relevance_scan_runs
SET state = 'completed', terminal_reason_code = 'completed', messages_seen = 300,
	completed_at = now(), updated_at = now()
WHERE id = (SELECT run_id FROM review_runtime);

DO $$
DECLARE
	prepared record;
BEGIN
	SELECT * INTO prepared FROM public.prepare_email_relevance_review_sample(
		'10000000-0000-4000-8000-000000000001',
		(SELECT run_id FROM review_runtime),
		100
	);
	PERFORM pg_temp.assert_true(prepared.total_samples = 300, 'sample must contain 300 rows');
	PERFORM pg_temp.assert_true(prepared.scope_count = 3, 'sample must cover three accounts');
	PERFORM pg_temp.assert_true(
		(SELECT bool_and(sample_count = 100) FROM (
			SELECT count(*) AS sample_count
			FROM public.email_relevance_review_samples
			GROUP BY connection_scope_id
		) counts),
		'each account must contribute exactly 100 samples'
	);
	PERFORM pg_temp.assert_true(
		(SELECT bool_and(stratum_count = 25) FROM (
			SELECT count(*) AS stratum_count
			FROM public.email_relevance_review_samples
			GROUP BY connection_scope_id, sampling_stratum
		) counts),
		'each synthetic account must contain 25 samples from every stratum'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) = count(DISTINCT (source_observation_id, project_id))
		 FROM public.email_relevance_review_samples),
		'A/B overlap must not double-count an observation/project pair'
	);
END;
$$;

DO $$
DECLARE
	denied boolean := false;
BEGIN
	BEGIN
		PERFORM public.prepare_email_relevance_review_sample(
			'10000000-0000-4000-8000-000000000002',
			(SELECT run_id FROM review_runtime), 100
		);
	EXCEPTION WHEN no_data_found THEN denied := true;
	END;
	PERFORM pg_temp.assert_true(denied, 'foreign user must not prepare a sample');
END;
$$;

CREATE TEMP TABLE reviewed_sample (sample_id uuid PRIMARY KEY) ON COMMIT DROP;

DO $$
DECLARE
	sample_id uuid;
	first_result record;
	replay_result record;
	conflicted boolean := false;
BEGIN
	SELECT sample.id INTO sample_id
	FROM public.email_relevance_review_samples sample
	JOIN public.email_relevance_scan_connections scope
		ON scope.id = sample.connection_scope_id
	WHERE scope.connection_id = '13000000-0000-4000-8000-000000000001'
	ORDER BY sample.id LIMIT 1;
	INSERT INTO reviewed_sample VALUES (sample_id);
	SELECT * INTO first_result FROM public.record_email_relevance_adjudication(
		'10000000-0000-4000-8000-000000000001',
		(SELECT run_id FROM review_runtime), sample_id,
		'10000000-0000-4000-8000-000000000001',
		'correct_project', NULL, NULL, NULL, repeat('1', 64), repeat('2', 64)
	);
	SELECT * INTO replay_result FROM public.record_email_relevance_adjudication(
		'10000000-0000-4000-8000-000000000001',
		(SELECT run_id FROM review_runtime), sample_id,
		'10000000-0000-4000-8000-000000000001',
		'correct_project', NULL, NULL, NULL, repeat('1', 64), repeat('2', 64)
	);
	PERFORM pg_temp.assert_true(NOT first_result.replayed, 'first decision must be new');
	PERFORM pg_temp.assert_true(replay_result.replayed, 'same decision must replay idempotently');
	BEGIN
		PERFORM public.record_email_relevance_adjudication(
			'10000000-0000-4000-8000-000000000001',
			(SELECT run_id FROM review_runtime), sample_id,
			'10000000-0000-4000-8000-000000000001',
			'not_project_relevant', 'wrong_actor', NULL, NULL, repeat('1', 64), repeat('3', 64)
		);
	EXCEPTION WHEN unique_violation THEN conflicted := true;
	END;
	PERFORM pg_temp.assert_true(conflicted, 'changed replay must conflict');
END;
$$;

DO $$
DECLARE
	blocked boolean := false;
BEGIN
	BEGIN
		UPDATE public.email_relevance_adjudications
		SET decision_hash = repeat('4', 64)
		WHERE sample_id = (SELECT sample_id FROM reviewed_sample);
	EXCEPTION WHEN integrity_constraint_violation THEN blocked := true;
	END;
	PERFORM pg_temp.assert_true(blocked, 'recorded adjudications must reject updates');
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
	denied boolean := false;
BEGIN
	BEGIN
		UPDATE public.email_relevance_review_samples SET state = 'expired';
	EXCEPTION WHEN insufficient_privilege THEN denied := true;
	END;
	PERFORM pg_temp.assert_true(denied, 'authenticated browser must not write review rows');
END;
$$;
RESET ROLE;

DO $$
DECLARE
	target_scope uuid;
BEGIN
	SELECT id INTO target_scope
	FROM public.email_relevance_scan_connections
	WHERE run_id = (SELECT run_id FROM review_runtime)
		AND connection_id = '13000000-0000-4000-8000-000000000002';
	UPDATE public.user_email_connections
	SET status = 'disabled'
	WHERE id = '13000000-0000-4000-8000-000000000002';
	PERFORM pg_temp.assert_true(
		(SELECT count(*) = 0 FROM public.email_relevance_message_observations
		 WHERE connection_scope_id = target_scope),
		'disconnect must delete source observations'
	);
	PERFORM pg_temp.assert_true(
		(SELECT bool_and(state = 'expired') FROM public.email_relevance_review_samples
		 WHERE connection_scope_id = target_scope),
		'disconnect must expire pending review samples'
	);
END;
$$;

DO $$
DECLARE
	target_scope uuid;
	purged record;
BEGIN
	SELECT id INTO target_scope
	FROM public.email_relevance_scan_connections
	WHERE run_id = (SELECT run_id FROM review_runtime)
		AND connection_id = '13000000-0000-4000-8000-000000000003';
	UPDATE public.email_relevance_project_candidates candidate
	SET created_at = now() - interval '2 days', retention_expires_at = now() - interval '1 day'
	FROM public.email_relevance_message_observations observation
	WHERE candidate.observation_id = observation.id
		AND observation.connection_scope_id = target_scope;
	UPDATE public.email_relevance_message_observations
	SET created_at = now() - interval '2 days', retention_expires_at = now() - interval '1 day'
	WHERE connection_scope_id = target_scope;
	SELECT * INTO purged FROM public.purge_expired_email_relevance_metadata(1000);
	PERFORM pg_temp.assert_true(purged.observations_deleted = 100, 'purge must delete expired sources');
	PERFORM pg_temp.assert_true(
		(SELECT bool_and(state = 'expired') FROM public.email_relevance_review_samples
		 WHERE connection_scope_id = target_scope AND state <> 'reviewed'),
		'physical retention purge must expire pending review samples'
	);
END;
$$;

DELETE FROM public.users WHERE id = '10000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.email_relevance_review_samples),
	'account deletion must remove review samples'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.email_relevance_adjudications),
	'account deletion must remove adjudications without an immutable-delete conflict'
);

ROLLBACK;

SELECT 'gmail_relevance_review_evaluation_ok' AS result;
