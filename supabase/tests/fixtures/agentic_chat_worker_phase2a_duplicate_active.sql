-- supabase/tests/fixtures/agentic_chat_worker_phase2a_duplicate_active.sql
-- Create a deterministic running+queued collision after the status expansion
-- but before the queued/running replacement index is built.

INSERT INTO public.users (id)
VALUES ('d1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'd2000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, context_type,
	request_message, status, execution_mode
)
VALUES
	(
		'd3000000-0000-4000-8000-000000000001',
		'd2000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		'phase2a-preflight-running',
		'global',
		'Running preflight fixture',
		'running',
		'legacy_sse'
	),
	(
		'd3000000-0000-4000-8000-000000000002',
		'd2000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		'phase2a-preflight-queued',
		'global',
		'Queued preflight fixture',
		'queued',
		'worker_realtime'
	);
