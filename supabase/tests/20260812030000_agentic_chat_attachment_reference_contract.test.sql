-- supabase/tests/20260812030000_agentic_chat_attachment_reference_contract.test.sql
-- Disposable PostgreSQL verification for immutable attachment references.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

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

INSERT INTO public.users (id)
VALUES ('a1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'a2000000-0000-4000-8000-000000000002',
	'a1000000-0000-4000-8000-000000000001',
	'project',
	'active'
);

INSERT INTO public.onto_assets (
	id, project_id, kind, storage_bucket, storage_path, original_filename,
	content_type, file_size_bytes, width, height, checksum_sha256, ocr_status,
	extraction_summary, extracted_text
) VALUES (
	'a3000000-0000-4000-8000-000000000003',
	'a4000000-0000-4000-8000-000000000004',
	'image', 'onto-assets',
	'projects/a4000000-0000-4000-8000-000000000004/a3000000-0000-4000-8000-000000000003.png',
	'diagram.png', 'image/png', 1024, 640, 480, repeat('a', 64), 'complete',
	'Launch diagram', 'Visible OCR text'
);

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	project_id, request_message, request_payload, request_payload_version,
	status, execution_mode, execution_generation
) VALUES (
	'a5000000-0000-4000-8000-000000000005',
	'a2000000-0000-4000-8000-000000000002',
	'a1000000-0000-4000-8000-000000000001',
	'attachment-stream-1', 'attachment-client-1', 'project',
	'a4000000-0000-4000-8000-000000000004', 'Review this diagram.',
	jsonb_build_object(
		'message', 'Review this diagram.',
		'attachments', jsonb_build_array(jsonb_build_object(
			'attachment_kind', 'onto_asset', 'media_type', 'image',
			'asset_id', 'a3000000-0000-4000-8000-000000000003',
			'temporary_attachment_id', NULL,
			'project_id', 'a4000000-0000-4000-8000-000000000004',
			'role', 'analysis_target', 'display_order', 0,
			'file_name', 'diagram.png', 'content_type', 'image/png',
			'file_size_bytes', 1024, 'width', 640, 'height', 480,
			'checksum_sha256', repeat('a', 64), 'ocr_status', 'complete',
			'extraction_summary', 'Launch diagram',
			'extracted_text_preview', 'Visible OCR text'
		))
	),
	'agentic_chat_request_v1', 'queued', 'worker_realtime', 0
);

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	artifact_version, history_source, history, prepared, content_hash,
	history_bytes, content_bytes
) VALUES (
	'a6000000-0000-4000-8000-000000000006',
	'a5000000-0000-4000-8000-000000000005',
	'a2000000-0000-4000-8000-000000000002',
	'a1000000-0000-4000-8000-000000000001',
	NULL, 'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
	jsonb_build_object(
		'historyState', jsonb_build_object(
			'strategy', 'raw_history', 'compressed', false,
			'rawHistoryCount', 0, 'historyForModelCount', 0
		),
		'currentTurn', jsonb_build_object(
			'message', 'Review this diagram.',
			'attachmentContextMaxChars', 7000,
			'attachments', jsonb_build_array(jsonb_build_object(
				'attachment_kind', 'onto_asset', 'media_type', 'image',
				'asset_id', 'a3000000-0000-4000-8000-000000000003',
				'temporary_attachment_id', NULL,
				'project_id', 'a4000000-0000-4000-8000-000000000004',
				'role', 'analysis_target', 'display_order', 0,
				'file_name', 'diagram.png', 'content_type', 'image/png',
				'file_size_bytes', 1024, 'width', 640, 'height', 480,
				'checksum_sha256', repeat('a', 64), 'ocr_status', 'complete',
				'extraction_summary', 'Launch diagram',
				'extracted_text_preview', 'Visible OCR text',
				'storage_bucket', 'onto-assets',
				'storage_path', 'projects/a4000000-0000-4000-8000-000000000004/a3000000-0000-4000-8000-000000000003.png',
				'expires_at', NULL
			))
		)
	),
	repeat('b', 64), 2, 1024
);

INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
VALUES (
	'a7000000-0000-4000-8000-000000000007',
	'a2000000-0000-4000-8000-000000000002',
	'a1000000-0000-4000-8000-000000000001',
	'user', 'Review this diagram.',
	'{"idempotency_key":"chat-turn:a5000000-0000-4000-8000-000000000005:user"}'::jsonb
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.chat_message_attachments
		WHERE message_id = 'a7000000-0000-4000-8000-000000000007'
			AND user_id = 'a1000000-0000-4000-8000-000000000001'
			AND asset_id = 'a3000000-0000-4000-8000-000000000003'
			AND display_order = 0
			AND metadata->>'storage_bucket' = 'onto-assets'
	),
	'worker admission must link the exact frozen asset reference transactionally'
);

UPDATE public.chat_turn_runs
SET status = 'failed'
WHERE id = 'a5000000-0000-4000-8000-000000000005';

INSERT INTO public.agentic_chat_prepared_prompts (
	id, user_id, session_id, context_type, cache_key, nonce_sha256,
	context_cache_version, context_payload, history_for_model, history_strategy,
	history_compressed, raw_history_count, history_for_model_count,
	prepared_surfaces, default_surface_profile, context_payload_sha256,
	expires_at, created_at, updated_at
) VALUES (
	'a8000000-0000-4000-8000-000000000008',
	'a1000000-0000-4000-8000-000000000001',
	'a2000000-0000-4000-8000-000000000002',
	'project', 'attachment-prepared', repeat('c', 64), 2, '{}'::jsonb,
	jsonb_build_array(jsonb_build_object(
		'role', 'user', 'content', 'Earlier request with image context',
		'attachments', jsonb_build_array(jsonb_build_object(
			'attachment_kind', 'onto_asset', 'media_type', 'image',
			'asset_id', 'a3000000-0000-4000-8000-000000000003',
			'temporary_attachment_id', NULL,
			'project_id', 'a4000000-0000-4000-8000-000000000004',
			'role', 'analysis_target', 'display_order', 0,
			'file_name', 'diagram.png', 'content_type', 'image/png',
			'file_size_bytes', 1024, 'width', 640, 'height', 480,
			'checksum_sha256', repeat('a', 64), 'ocr_status', 'complete',
			'extraction_summary', 'Launch diagram',
			'extracted_text_preview', 'Visible OCR text',
			'storage_bucket', 'onto-assets',
			'storage_path', 'projects/a4000000-0000-4000-8000-000000000004/a3000000-0000-4000-8000-000000000003.png',
			'expires_at', NULL
		))
	)),
	'raw_history', false, 1, 1, '{}'::jsonb, 'project_basic', repeat('d', 64),
	'2099-01-01T00:00:00Z', '2098-01-01T00:00:00Z', '2098-01-01T00:00:00Z'
);

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, request_payload, request_payload_version, status,
	execution_mode, execution_generation
) VALUES (
	'a9000000-0000-4000-8000-000000000009',
	'a2000000-0000-4000-8000-000000000002',
	'a1000000-0000-4000-8000-000000000001',
	'attachment-stream-2', 'attachment-client-2', 'project', 'Continue.',
	'{"message":"Continue.","attachments":[]}'::jsonb,
	'agentic_chat_request_v1', 'failed', 'worker_realtime', 0
);

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	artifact_version, history_source, history, prepared, content_hash,
	history_bytes, content_bytes
) VALUES (
	'aa000000-0000-4000-8000-00000000000a',
	'a9000000-0000-4000-8000-000000000009',
	'a2000000-0000-4000-8000-000000000002',
	'a1000000-0000-4000-8000-000000000001',
	'a8000000-0000-4000-8000-000000000008',
	'agentic_chat_input_v2', 'prepared_prompt',
	jsonb_build_array(jsonb_build_object(
		'sourceMessageId', NULL, 'role', 'user',
		'content', 'Earlier request with image context',
		'attachments', jsonb_build_array(jsonb_build_object(
			'attachment_kind', 'onto_asset', 'media_type', 'image',
			'asset_id', 'a3000000-0000-4000-8000-000000000003',
			'temporary_attachment_id', NULL,
			'project_id', 'a4000000-0000-4000-8000-000000000004',
			'role', 'analysis_target', 'display_order', 0,
			'file_name', 'diagram.png', 'content_type', 'image/png',
			'file_size_bytes', 1024, 'width', 640, 'height', 480,
			'checksum_sha256', repeat('a', 64), 'ocr_status', 'complete',
			'extraction_summary', 'Launch diagram',
			'extracted_text_preview', 'Visible OCR text',
			'storage_bucket', 'onto-assets',
			'storage_path', 'projects/a4000000-0000-4000-8000-000000000004/a3000000-0000-4000-8000-000000000003.png',
			'expires_at', NULL
		)),
		'toolCalls', '[]'::jsonb, 'toolCallId', NULL
	)),
	jsonb_build_object(
		'historyState', jsonb_build_object(
			'strategy', 'raw_history', 'compressed', false,
			'rawHistoryCount', 1, 'historyForModelCount', 1
		),
		'currentTurn', jsonb_build_object(
			'message', 'Continue.',
			'attachmentContextMaxChars', 7000,
			'attachments', '[]'::jsonb
		)
	),
	repeat('e', 64), 1024, 2048
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.chat_turn_input_artifacts
		WHERE id = 'aa000000-0000-4000-8000-00000000000a'
			AND jsonb_array_length(history->0->'attachments') = 1
	),
	'prepared history must retain its exact bounded attachment reference'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_runs (
				id, session_id, user_id, stream_run_id, client_turn_id, context_type,
				request_message, request_payload, request_payload_version, status,
				execution_mode, execution_generation
			) VALUES (
				'ab000000-0000-4000-8000-00000000000b',
				'a2000000-0000-4000-8000-000000000002',
				'a1000000-0000-4000-8000-000000000001',
				'attachment-stream-3', 'attachment-client-3', 'project', 'Review.',
				'{"message":"Review.","attachments":[]}'::jsonb,
				'agentic_chat_request_v1', 'failed', 'worker_realtime', 0
			);
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, artifact_version, history_source,
				history, prepared, content_hash, history_bytes, content_bytes
			) VALUES (
				'ac000000-0000-4000-8000-00000000000c',
				'ab000000-0000-4000-8000-00000000000b',
				'a2000000-0000-4000-8000-000000000002',
				'a1000000-0000-4000-8000-000000000001',
				'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
				'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":0,"historyForModelCount":0},"currentTurn":{"message":"Changed.","attachmentContextMaxChars":7000,"attachments":[]}}'::jsonb,
				repeat('f', 64), 2, 256
			)
		$$,
		'agentic_chat_input_current_turn_request_mismatch'
	),
	'a request/artifact attachment mismatch must roll back the artifact insert'
);

ROLLBACK;

SELECT 'agentic_chat_attachment_reference_contract_ok' AS result;
