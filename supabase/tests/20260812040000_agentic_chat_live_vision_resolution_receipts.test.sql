-- supabase/tests/20260812040000_agentic_chat_live_vision_resolution_receipts.test.sql
-- Disposable PostgreSQL verification for S4 live-vision receipts.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION WHEN OTHERS THEN
	RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SET ROLE service_role;
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('7', 64), 'provider', 'provider_media_resolved',
	jsonb_build_object(
		'requested', true,
		'policy', jsonb_build_object(
			'max_images', 2,
			'max_image_bytes', 8388608,
			'render_width', 1600,
			'signed_url_ttl_seconds', 900
		),
		'resolved', jsonb_build_array(jsonb_build_object(
			'attachment_key', 'asset:aa000000-0000-4000-8000-000000000001',
			'content_type', 'image/png',
			'file_size_bytes', 1024,
			'checksum_sha256', repeat('a', 64)
		)),
		'failed', '[]'::jsonb,
		'skipped_by_limit', 0
	)
) AS receipt \gset media_first_
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('7', 64), 'provider', 'provider_media_resolved',
	jsonb_build_object(
		'requested', true,
		'policy', jsonb_build_object(
			'max_images', 2,
			'max_image_bytes', 8388608,
			'render_width', 1600,
			'signed_url_ttl_seconds', 900
		),
		'resolved', jsonb_build_array(jsonb_build_object(
			'attachment_key', 'asset:aa000000-0000-4000-8000-000000000001',
			'content_type', 'image/png',
			'file_size_bytes', 1024,
			'checksum_sha256', repeat('a', 64)
		)),
		'failed', '[]'::jsonb,
		'skipped_by_limit', 0
	)
) AS receipt \gset media_replay_

SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('8', 64), 'provider', 'provider_attempt_started',
	'{"round":"initial","route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	:'media_first_receipt'::jsonb->>'outcome' = 'persisted'
	AND :'media_replay_receipt'::jsonb->>'outcome' = 'already_persisted',
	'media-resolution observation replay is not exact and idempotent'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND bool_and(
				NOT payload ? 'url'
				AND NOT payload ? 'signed_url'
				AND NOT payload ? 'storage_path'
				AND NOT payload ? 'storage_bucket'
			)
		FROM public.agentic_chat_execution_observations
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
			AND event_type = 'provider_media_resolved'
	),
	'media-resolution receipt leaked an ephemeral source pointer'
);

SELECT pg_temp.assert_true(
	(
		SELECT min(observation_sequence_index) FILTER (
			WHERE event_type = 'provider_media_resolved'
		) < min(observation_sequence_index) FILTER (
			WHERE event_type = 'provider_attempt_started'
		)
		FROM public.agentic_chat_worker_lifecycle_observations
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
	),
	'media-resolution receipt is not ordered before the initial provider attempt'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_execution_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('9', 64), 'provider', 'provider_media_resolved',
				'{
					"requested":true,
					"policy":{"max_images":2,"max_image_bytes":8388608,"render_width":1600,"signed_url_ttl_seconds":900},
					"resolved":[],"failed":[],"skipped_by_limit":0,
					"signed_url":"https://must-not-persist.example/image"
				}'::jsonb
			)
		$$,
		'invalid_media_receipt'
	),
	'media-resolution observation accepted a signed URL'
);
RESET ROLE;

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'fb100000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'global', 'active'
);
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, request_payload, request_payload_version, status,
	execution_mode, execution_generation
) VALUES (
	'fb200000-0000-4000-8000-000000000001',
	'fb100000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	's4-policy-stream', 's4-policy-client', 'global', 'Policy.',
	'{"message":"Policy.","attachments":[]}'::jsonb,
	'agentic_chat_request_v1', 'failed', 'worker_realtime', 0
);
INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, artifact_version, history_source,
	history, prepared, content_hash, history_bytes, content_bytes
) VALUES (
	'fb300000-0000-4000-8000-000000000001',
	'fb200000-0000-4000-8000-000000000001',
	'fb100000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
	'{
		"currentTurn":{
			"message":"Policy.",
			"attachmentContextMaxChars":7000,
			"liveVision":{"requested":false,"maxImages":2,"maxImageBytes":8388608,"renderWidth":1600,"signedUrlTtlSeconds":900},
			"attachments":[]
		}
	}'::jsonb,
	repeat('b', 64), 2, 1024
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, artifact_version, history_source,
				history, prepared, content_hash, history_bytes, content_bytes
			) VALUES (
				'fb400000-0000-4000-8000-000000000001',
				'fb200000-0000-4000-8000-000000000001',
				'fb100000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
				'{
					"currentTurn":{
						"message":"Policy.",
						"attachmentContextMaxChars":7000,
						"liveVision":{"requested":true,"maxImages":17,"maxImageBytes":8388608,"renderWidth":1600,"signedUrlTtlSeconds":900},
						"attachments":[]
					}
				}'::jsonb,
				repeat('c', 64), 2, 1024
			)
		$$,
		'agentic_chat_input_live_vision_policy_invalid'
	),
	'admission accepted an out-of-bound live-vision policy'
);

SELECT 'agentic_chat_live_vision_resolution_receipts_ok' AS result;
