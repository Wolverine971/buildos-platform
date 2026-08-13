-- supabase/tests/fixtures/agentic_chat_stated_future_base.sql
-- Disposable-only fixture for P4 S6 deterministic stated-future evidence.
\ir agentic_chat_research_capture_base.sql

ALTER TABLE public.chat_tool_executions ADD COLUMN error_message text;

INSERT INTO public.queue_jobs(id, user_id, job_type, status, processing_token, metadata)
VALUES (
	'ac500000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
	'agentic_chat_turn', 'processing', 'ac600000-0000-4000-8000-000000000001',
	'{"turnRunId":"ac700000-0000-4000-8000-000000000001","correlationId":"ac800000-0000-4000-8000-000000000001"}'
);
INSERT INTO public.chat_turn_runs(
	id, queue_job_id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status, stream_run_id, project_id, execution_started_at
) VALUES (
	'ac700000-0000-4000-8000-000000000001', 'ac500000-0000-4000-8000-000000000001',
	'aa200000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
	'ac800000-0000-4000-8000-000000000001', 'worker_realtime', 2, 'running',
	'stream-stated-future-1', 'aa400000-0000-4000-8000-000000000001', transaction_timestamp()
);
INSERT INTO public.chat_tool_executions(
	id, turn_run_id, sequence_index, tool_name, arguments, result, success, error_message, created_at
) VALUES
	(
		'ac900000-0000-4000-8000-000000000001',
		'ac700000-0000-4000-8000-000000000001', 1, 'update_onto_task',
		'{"task_id":"secret-task","state_key":"done","secret":"strip-me"}',
		'{"status":"updated","secret":"strip-me"}', true, NULL, '2026-08-13T15:00:00Z'
	),
	(
		'ac900000-0000-4000-8000-000000000002',
		'ac700000-0000-4000-8000-000000000001', 2, 'update_onto_document',
		'{"document_id":"secret-document","state_key":"ready","secret":"strip-me"}',
		'{}', true, NULL, '2026-08-13T15:01:00Z'
	),
	(
		'ac900000-0000-4000-8000-000000000003',
		'ac700000-0000-4000-8000-000000000001', 3, 'move_onto_task',
		'{"task_id":"secret-task"}', '{"data":{"status":"moved","secret":"strip-me"}}',
		true, NULL, '2026-08-13T15:02:00Z'
	),
	(
		'ac900000-0000-4000-8000-000000000004',
		'ac700000-0000-4000-8000-000000000001', 4, 'update_onto_task', '{}', '{}', false,
		'Tool validation failed: Duplicate commissioned target skipped: already handled',
		'2026-08-13T15:03:00Z'
	),
	(
		'ac900000-0000-4000-8000-000000000005',
		'ac700000-0000-4000-8000-000000000001', 5, 'update_onto_document',
		'{"document":{"body_markdown":"Waiting on legal approval","secret":"strip-me"},"secret":"strip-me"}',
		'{"result":{"status":"duplicate_write_skipped","secret":"strip-me"}}',
		true, NULL, '2026-08-13T15:04:00Z'
	);
