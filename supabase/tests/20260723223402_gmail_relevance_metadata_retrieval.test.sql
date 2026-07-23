-- supabase/tests/20260723223402_gmail_relevance_metadata_retrieval.test.sql
-- Disposable PostgreSQL verification for Gmail relevance Phase A, Slice 3.
-- Prerequisites: minimal platform tables, Slice 1, Slice 2, then the matching Slice 3 migration.
-- All fixtures are invented and contain no real mailbox or project content.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run this fixture harness in the Supabase SQL editor
-- or against a linked/staging/production database. Use the matching `.production_verify.sql` file
-- for a read-only linked-schema receipt.

\set ON_ERROR_STOP on

BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.scan_manifest(
	p_user_id uuid,
	p_connection_id uuid,
	p_project_id uuid,
	p_profile_id uuid,
	p_profile_hash text
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
		'connection_ids', jsonb_build_array(p_connection_id),
		'projects', jsonb_build_array(jsonb_build_object(
			'project_id', p_project_id,
			'profile_id', p_profile_id,
			'profile_version', 1,
			'profile_hash', p_profile_hash
		)),
		'window_start', '2026-06-01T00:00:00.000Z',
		'window_end', '2026-07-01T00:00:00.000Z',
		'expires_at', now() + interval '1 hour',
		'message_cap_per_connection', 1000,
		'metadata_batch_ceiling', 50,
		'per_connection_budgets', jsonb_build_object(
			'gmail_quota_units', 20050, 'runtime_ms', 1200000,
			'raw_content_bytes', 0, 'model_tokens', 0, 'model_cost_micros', 0
		),
		'global_budgets', jsonb_build_object(
			'gmail_quota_units', 20050, 'runtime_ms', 1200000,
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
	('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002');
INSERT INTO public.user_email_connections (id, user_id, provider, status, read_enabled) VALUES
	('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'google_gmail', 'active', true),
	('13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'google_gmail', 'active', true);
INSERT INTO public.email_project_profiles (id, user_id, project_id) VALUES
	('14000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001'),
	('14000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002');
INSERT INTO public.email_project_profile_versions (
	id, profile_id, profile_version, compiler_version, source_snapshot_at, profile_hash, groups
) VALUES
	(
		'15000000-0000-4000-8000-000000000001',
		'14000000-0000-4000-8000-000000000001', 1, 'project-email-profile-v1', now(),
		'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
		'{"identity":[],"actors":[],"artifacts":[],"identifiers":[],"semantic_context":[],"negative_evidence":[],"user_rules":[],"recency":[]}'::jsonb
	),
	(
		'15000000-0000-4000-8000-000000000002',
		'14000000-0000-4000-8000-000000000002', 1, 'project-email-profile-v1', now(),
		'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
		'{"identity":[],"actors":[],"artifacts":[],"identifiers":[],"semantic_context":[],"negative_evidence":[],"user_rules":[],"recency":[]}'::jsonb
	);

CREATE TEMP TABLE slice3_runtime (
	run_id uuid,
	scope_id uuid,
	list_operation_id uuid,
	metadata_operation_id uuid
) ON COMMIT DROP;

DO $$
DECLARE
	created record;
	configured jsonb;
	scope_id uuid;
BEGIN
	configured := pg_temp.scan_manifest(
		'10000000-0000-4000-8000-000000000001',
		'13000000-0000-4000-8000-000000000001',
		'12000000-0000-4000-8000-000000000001',
		'14000000-0000-4000-8000-000000000001',
		'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
	);
	SELECT * INTO created FROM public.create_email_relevance_scan_run(
		'10000000-0000-4000-8000-000000000001',
		repeat('a', 64),
		repeat('b', 64),
		configured
	);
	SELECT id INTO scope_id FROM public.email_relevance_scan_connections
	WHERE run_id = created.run_id;
	INSERT INTO slice3_runtime (run_id, scope_id) VALUES (created.run_id, scope_id);
END;
$$;

DO $$
DECLARE
	claimed record;
	runtime slice3_runtime%ROWTYPE;
BEGIN
	SELECT * INTO runtime FROM slice3_runtime;
	SELECT * INTO claimed FROM public.claim_email_relevance_scan_operation(
		'10000000-0000-4000-8000-000000000001', runtime.run_id, runtime.scope_id, 0,
		'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		'slice3_sql_test', 'list_page', NULL
	);
	PERFORM pg_temp.assert_true(claimed.claimed, 'list page must claim');
	UPDATE slice3_runtime SET list_operation_id = claimed.operation_id;
	PERFORM pg_temp.assert_true(
		(SELECT bool_and(
			operation_code = 'list_page'
			AND ((resource_kind = 'gmail_quota' AND reserved_quantity = 5)
				OR (resource_kind = 'runtime_ms' AND reserved_quantity = 15000))
		) FROM public.email_relevance_scan_reservations
		WHERE operation_id = claimed.operation_id),
		'database must price list reservations'
	);
END;
$$;

DO $$
DECLARE
	settled record;
	runtime slice3_runtime%ROWTYPE;
BEGIN
	SELECT * INTO runtime FROM slice3_runtime;
	SELECT * INTO settled FROM public.settle_email_relevance_list_page(
		'10000000-0000-4000-8000-000000000001', runtime.run_id, runtime.scope_id, 0,
		'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		runtime.list_operation_id, 900,
		jsonb_build_array(
			jsonb_build_object(
				'provider_message_id_hash', repeat('1', 64),
				'provider_message_id_ciphertext', 'enc:gmail-relevance:v1.cipher_message_1',
				'provider_thread_id_hash', repeat('2', 64),
				'provider_thread_id_ciphertext', 'enc:gmail-relevance:v1.cipher_thread_1',
				'key_version', 1
			),
			jsonb_build_object(
				'provider_message_id_hash', repeat('3', 64),
				'provider_message_id_ciphertext', 'enc:gmail-relevance:v1.cipher_message_2',
				'provider_thread_id_hash', repeat('4', 64),
				'provider_thread_id_ciphertext', 'enc:gmail-relevance:v1.cipher_thread_2',
				'key_version', 1
			)
		),
		'enc:gmail-relevance:v1.cipher_page_2', 1
	);
	PERFORM pg_temp.assert_true(settled.committed AND settled.checkpoint_version = 1, 'list must settle once');
	PERFORM pg_temp.assert_true(
		(SELECT observations_discovered = 2 AND list_pages_completed = 1
			AND pending_cursor_envelope IS NOT NULL AND cursor_envelope IS NULL
		FROM public.email_relevance_scan_connections WHERE id = runtime.scope_id),
		'page cursor must wait until every observation is processed'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) = 2 FROM public.email_relevance_message_observations
		WHERE connection_scope_id = runtime.scope_id AND processing_state = 'pending'),
		'list settlement must durably deduplicate discoveries'
	);
END;
$$;

DO $$
DECLARE
	claimed record;
	runtime slice3_runtime%ROWTYPE;
BEGIN
	SELECT * INTO runtime FROM slice3_runtime;
	SELECT * INTO claimed FROM public.claim_email_relevance_scan_operation(
		'10000000-0000-4000-8000-000000000001', runtime.run_id, runtime.scope_id, 1,
		'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		'slice3_sql_test', 'metadata_batch', 2
	);
	PERFORM pg_temp.assert_true(claimed.claimed, 'metadata batch must claim');
	UPDATE slice3_runtime SET metadata_operation_id = claimed.operation_id;
	PERFORM pg_temp.assert_true(
		(SELECT bool_and(
			operation_code = 'metadata_batch'
			AND ((resource_kind = 'gmail_quota' AND reserved_quantity = 40)
				OR (resource_kind = 'runtime_ms' AND reserved_quantity = 60000))
		) FROM public.email_relevance_scan_reservations
		WHERE operation_id = claimed.operation_id),
		'database must price metadata reservations by bounded count'
	);
END;
$$;

DO $$
DECLARE
	settled record;
	runtime slice3_runtime%ROWTYPE;
	first_observation uuid;
	second_observation uuid;
	candidate jsonb;
BEGIN
	SELECT * INTO runtime FROM slice3_runtime;
	SELECT id INTO first_observation FROM public.email_relevance_message_observations
	WHERE connection_scope_id = runtime.scope_id ORDER BY id LIMIT 1;
	SELECT id INTO second_observation FROM public.email_relevance_message_observations
	WHERE connection_scope_id = runtime.scope_id ORDER BY id LIMIT 1 OFFSET 1;
	candidate := jsonb_build_object(
		'project_id', '12000000-0000-4000-8000-000000000001',
		'profile_version_id', '15000000-0000-4000-8000-000000000001',
		'variant', 'a', 'score', 70, 'confidence', 0.7,
		'confirmed_thread', false, 'explicit_rule', true,
		'actor_overlap', false, 'domain_overlap', false,
		'artifact_overlap', false, 'identifier_overlap', false,
		'lexical_overlap', false, 'negative_evidence', false,
		'actor_overlap_count', 0, 'domain_overlap_count', 0,
		'artifact_overlap_count', 0, 'identifier_overlap_count', 0,
		'lexical_overlap_count', 0, 'negative_evidence_count', 0
	);
	SELECT * INTO settled FROM public.settle_email_relevance_metadata_batch(
		'10000000-0000-4000-8000-000000000001', runtime.run_id, runtime.scope_id, 1,
		'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		runtime.metadata_operation_id, 1200,
		jsonb_build_array(
			jsonb_build_object(
				'observation_id', first_observation,
				'internal_date', '2026-06-15T12:00:00Z',
				'mailbox_inbox', true, 'mailbox_sent', false,
				'evidence_fingerprints', jsonb_build_array(repeat('5', 64)),
				'candidates', jsonb_build_array(candidate)
			),
			jsonb_build_object(
				'observation_id', second_observation,
				'internal_date', '2026-06-16T12:00:00Z',
				'mailbox_inbox', false, 'mailbox_sent', true,
				'evidence_fingerprints', '[]'::jsonb,
				'candidates', '[]'::jsonb
			)
		)
	);
	PERFORM pg_temp.assert_true(settled.committed AND settled.checkpoint_version = 2, 'metadata must settle once');
	PERFORM pg_temp.assert_true(
		(SELECT observations_processed = 2 AND cursor_envelope IS NOT NULL
			AND pending_cursor_envelope IS NULL AND state = 'pending'
		FROM public.email_relevance_scan_connections WHERE id = runtime.scope_id),
		'drained page must atomically promote its encrypted cursor'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) = 1 FROM public.email_relevance_project_candidates
		WHERE user_id = '10000000-0000-4000-8000-000000000001'),
		'only positive candidate rows must persist'
	);
END;
$$;

DO $$
DECLARE
	runtime slice3_runtime%ROWTYPE;
	replay record;
	observation_id uuid;
BEGIN
	SELECT * INTO runtime FROM slice3_runtime;
	SELECT id INTO observation_id FROM public.email_relevance_message_observations
	WHERE connection_scope_id = runtime.scope_id ORDER BY id LIMIT 1;
	SELECT * INTO replay FROM public.settle_email_relevance_metadata_batch(
		'10000000-0000-4000-8000-000000000001', runtime.run_id, runtime.scope_id, 1,
		'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		runtime.metadata_operation_id, 1200,
		jsonb_build_array(jsonb_build_object(
			'observation_id', observation_id,
			'internal_date', '2026-06-15T12:00:00Z',
			'mailbox_inbox', true, 'mailbox_sent', false,
			'evidence_fingerprints', '[]'::jsonb,
			'candidates', '[]'::jsonb
		))
	);
	PERFORM pg_temp.assert_true(NOT replay.committed AND replay.error_code = 'stale_checkpoint', 'replay must be a no-op');
END;
$$;

DO $$
DECLARE runtime slice3_runtime%ROWTYPE; failed boolean := false;
BEGIN
	SELECT * INTO runtime FROM slice3_runtime;
	BEGIN
		PERFORM public.claim_email_relevance_scan_operation(
			'10000000-0000-4000-8000-000000000002', runtime.run_id, runtime.scope_id, 2,
			'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
			'slice3_sql_test', 'list_page', NULL
		);
	EXCEPTION WHEN insufficient_privilege THEN failed := true;
	END;
	PERFORM pg_temp.assert_true(failed, 'foreign user claim must fail');
	BEGIN
		PERFORM public.claim_email_relevance_scan_operation(
			'10000000-0000-4000-8000-000000000001', runtime.run_id, runtime.scope_id, 2,
			'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
			'slice3_sql_test', 'metadata_batch', 51
		);
		failed := false;
	EXCEPTION WHEN invalid_parameter_value THEN failed := true;
	END;
	PERFORM pg_temp.assert_true(failed, 'unpriced metadata count must fail closed');
END;
$$;

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name IN (
				'email_relevance_message_observations',
				'email_relevance_project_candidates'
			)
			AND column_name IN (
				'subject', 'snippet', 'body', 'headers', 'participant_addresses',
				'raw_label', 'gmail_query', 'gmail_url', 'metadata', 'context', 'error_message'
			)
	),
	'content-bearing and generic durable columns must not exist'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.email_relevance_message_observations),
	'foreign observations must be hidden by RLS'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.email_relevance_project_candidates),
	'foreign candidates must be hidden by RLS'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE denied boolean := false;
BEGIN
	BEGIN
		PERFORM provider_message_id_ciphertext FROM public.email_relevance_message_observations LIMIT 1;
	EXCEPTION WHEN insufficient_privilege THEN denied := true;
	END;
	PERFORM pg_temp.assert_true(denied, 'browser role must not read encrypted provider links');
	denied := false;
	BEGIN
		INSERT INTO public.email_relevance_project_candidates (
			observation_id, user_id, project_id, profile_version_id, variant,
			scorer_version, policy_version, score, confidence, retention_expires_at
		) VALUES (
			gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
			'12000000-0000-4000-8000-000000000001',
			'15000000-0000-4000-8000-000000000001', 'a',
			'email-relevance-ab-scorer-v1', 'email-relevance-metadata-policy-v1',
			50, 0.5, now() + interval '1 day'
		);
	EXCEPTION WHEN insufficient_privilege THEN denied := true;
	END;
	PERFORM pg_temp.assert_true(denied, 'browser role must not write candidates');
END;
$$;
RESET ROLE;

UPDATE public.user_email_connections
SET status = 'disabled'
WHERE id = '13000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.email_relevance_message_observations),
	'disconnect must delete transient observations and provider links'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.email_relevance_project_candidates),
	'disconnect must delete unaccepted candidates'
);

ROLLBACK;

SELECT 'gmail_relevance_metadata_retrieval_ok' AS result;
