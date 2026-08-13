-- supabase/tests/20260813030000_agentic_chat_research_capture.test.sql
-- Disposable PostgreSQL proof for P4 S5 deterministic research capture.
\set ON_ERROR_STOP on

DO $$
BEGIN
	IF has_function_privilege('anon', 'public.load_agentic_chat_research_capture_evidence(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
		OR has_function_privilege('authenticated', 'public.load_agentic_chat_research_capture_evidence(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.load_agentic_chat_research_capture_evidence(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
		OR has_function_privilege('anon', 'public.apply_agentic_chat_research_capture(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,text,text,text)', 'EXECUTE')
		OR has_function_privilege('authenticated', 'public.apply_agentic_chat_research_capture(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,text,text,text)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.apply_agentic_chat_research_capture(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,text,text,text)', 'EXECUTE') THEN
		RAISE EXCEPTION 'research capture RPC ACL mismatch';
	END IF;
END;
$$;

SET ROLE anon;
DO $$
BEGIN
	PERFORM public.load_agentic_chat_research_capture_evidence(
		'aa700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000001',
		'aa600000-0000-4000-8000-000000000001', 1
	);
	RAISE EXCEPTION 'anonymous evidence call unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;
RESET ROLE;

SET ROLE service_role;

DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.load_agentic_chat_research_capture_evidence(
		'aa700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000001',
		'aa600000-0000-4000-8000-000000000001', 1
	);
	IF v_receipt->>'outcome' <> 'eligible'
		OR jsonb_array_length(v_receipt->'calls') <> 2
		OR v_receipt#>>'{calls,0,name}' <> 'web_search'
		OR v_receipt#>>'{calls,1,name}' <> 'util.web.visit'
		OR v_receipt#>>'{calls,0,result,answer}' <> 'Durable evidence wins.'
		OR v_receipt#>>'{calls,0,result,urls,0}' <> 'https://example.com/a'
		OR (v_receipt->>'captured_at')::timestamptz <> '2026-08-13T14:01:00Z'::timestamptz THEN
		RAISE EXCEPTION 'durable name-only research evidence mismatch: %', v_receipt;
	END IF;
END;
$$;

DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.apply_agentic_chat_research_capture(
		'aa700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000001',
		'aa600000-0000-4000-8000-000000000001', 1,
		'ab100000-0000-4000-8000-000000000001', repeat('a', 64),
		'aa400000-0000-4000-8000-000000000001', 'stream-research-1',
		E'## 2026-08-13 · Research durable evidence\n<!-- run:stream-research-1 -->\n\n- Queries: durable research',
		'Auto-captured research. Latest: Research durable evidence'
	);
	IF v_receipt->>'outcome' <> 'appended'
		OR (v_receipt->>'rotated')::integer <> 0
		OR v_receipt->>'document_id' IS NULL THEN
		RAISE EXCEPTION 'first research append mismatch: %', v_receipt;
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM public.chat_turn_effects effects
		WHERE effects.id = 'ab100000-0000-4000-8000-000000000001'
			AND effects.state = 'succeeded'
			AND effects.downstream_receipt->>'status' = 'appended'
	) OR NOT EXISTS (
		SELECT 1 FROM public.onto_documents documents
		WHERE documents.id = (v_receipt->>'document_id')::uuid
			AND documents.content LIKE '%<!-- run:stream-research-1 -->%'
			AND documents.props->>'body_markdown' = documents.content
	) THEN
		RAISE EXCEPTION 'research effect/document did not commit atomically';
	END IF;
END;
$$;

-- Lost response: exact effect replay resolves after ownership and turn terminality are gone.
UPDATE public.chat_turn_runs
SET status = 'completed', terminalized_at = transaction_timestamp()
WHERE id = 'aa700000-0000-4000-8000-000000000001';
UPDATE public.queue_jobs SET status = 'completed', processing_token = NULL
WHERE id = 'aa500000-0000-4000-8000-000000000001';
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.apply_agentic_chat_research_capture(
		'aa700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000001',
		'aa600000-0000-4000-8000-000000000001', 1,
		'ab100000-0000-4000-8000-000000000001', repeat('a', 64),
		'aa400000-0000-4000-8000-000000000001', 'stream-research-1',
		E'## 2026-08-13 · Research durable evidence\n<!-- run:stream-research-1 -->\n\n- Queries: durable research',
		'Auto-captured research. Latest: Research durable evidence'
	);
	IF v_receipt->>'outcome' <> 'appended'
		OR (SELECT count(*) FROM public.chat_turn_effects WHERE id = 'ab100000-0000-4000-8000-000000000001') <> 1
		OR (SELECT count(*) FROM public.onto_documents WHERE content LIKE '%<!-- run:stream-research-1 -->%') <> 1 THEN
		RAISE EXCEPTION 'lost-response replay was not exact: %', v_receipt;
	END IF;
END;
$$;

-- Cancellation is observed before evidence/application and creates no effect.
INSERT INTO public.queue_jobs(id, user_id, job_type, status, processing_token, metadata)
VALUES (
	'aa500000-0000-4000-8000-000000000002', 'aa100000-0000-4000-8000-000000000001',
	'agentic_chat_turn', 'processing', 'aa600000-0000-4000-8000-000000000002',
	'{"turnRunId":"aa700000-0000-4000-8000-000000000002","correlationId":"aa800000-0000-4000-8000-000000000002"}'
);
INSERT INTO public.chat_turn_runs(
	id, queue_job_id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status, stream_run_id, project_id, execution_started_at,
	cancel_requested_at
) VALUES (
	'aa700000-0000-4000-8000-000000000002', 'aa500000-0000-4000-8000-000000000002',
	'aa200000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
	'aa800000-0000-4000-8000-000000000002', 'worker_realtime', 1, 'running',
	'stream-research-2', 'aa400000-0000-4000-8000-000000000001',
	transaction_timestamp(), transaction_timestamp()
);
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.load_agentic_chat_research_capture_evidence(
		'aa700000-0000-4000-8000-000000000002',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000002',
		'aa600000-0000-4000-8000-000000000002', 1
	);
	IF v_receipt->>'outcome' <> 'cancel_requested' THEN
		RAISE EXCEPTION 'cancellation evidence mismatch: %', v_receipt;
	END IF;
	BEGIN
		PERFORM public.apply_agentic_chat_research_capture(
			'aa700000-0000-4000-8000-000000000002',
			'aa100000-0000-4000-8000-000000000001',
			'aa500000-0000-4000-8000-000000000002',
			'aa600000-0000-4000-8000-000000000002', 1,
			'ab100000-0000-4000-8000-000000000002', repeat('b', 64),
			'aa400000-0000-4000-8000-000000000001', 'stream-research-2',
			E'## 2026-08-13 · Cancelled\n<!-- run:stream-research-2 -->',
			'Auto-captured research. Latest: Cancelled'
		);
		RAISE EXCEPTION 'cancelled apply unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM <> 'agentic_chat_research_capture_cancel_requested' THEN RAISE; END IF;
	END;
	IF EXISTS (SELECT 1 FROM public.chat_turn_effects WHERE id = 'ab100000-0000-4000-8000-000000000002') THEN
		RAISE EXCEPTION 'cancelled capture created an effect';
	END IF;
END;
$$;

-- A deterministic append failure records a terminal failed effect and returns normally.
INSERT INTO public.queue_jobs(id, user_id, job_type, status, processing_token, metadata)
VALUES (
	'aa500000-0000-4000-8000-000000000003', 'aa100000-0000-4000-8000-000000000001',
	'agentic_chat_turn', 'processing', 'aa600000-0000-4000-8000-000000000003',
	'{"turnRunId":"aa700000-0000-4000-8000-000000000003","correlationId":"aa800000-0000-4000-8000-000000000003"}'
);
INSERT INTO public.chat_turn_runs(
	id, queue_job_id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status, stream_run_id, project_id, execution_started_at
) VALUES (
	'aa700000-0000-4000-8000-000000000003', 'aa500000-0000-4000-8000-000000000003',
	'aa200000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
	'aa800000-0000-4000-8000-000000000003', 'worker_realtime', 1, 'running',
	'stream-research-3', 'aa400000-0000-4000-8000-000000000002', transaction_timestamp()
);
INSERT INTO public.chat_tool_executions(
	id, turn_run_id, sequence_index, tool_name, arguments, result, success
) VALUES
	('aa900000-0000-4000-8000-000000000031', 'aa700000-0000-4000-8000-000000000003', 1, 'web_search', '{}', '{}', true),
	('aa900000-0000-4000-8000-000000000032', 'aa700000-0000-4000-8000-000000000003', 2, 'web_visit', '{}', '{}', true);
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.apply_agentic_chat_research_capture(
		'aa700000-0000-4000-8000-000000000003',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000003',
		'aa600000-0000-4000-8000-000000000003', 1,
		'ab100000-0000-4000-8000-000000000003', repeat('c', 64),
		'aa400000-0000-4000-8000-000000000002', 'stream-research-3',
		E'## 2026-08-13 · Denied project\n<!-- run:stream-research-3 -->',
		'Auto-captured research. Latest: Denied project'
	);
	IF v_receipt->>'outcome' <> 'failed'
		OR v_receipt->>'failure_code' <> 'research_capture_failed'
		OR NOT EXISTS (
			SELECT 1 FROM public.chat_turn_effects effects
			WHERE effects.id = 'ab100000-0000-4000-8000-000000000003'
				AND effects.state = 'failed'
				AND effects.finished_at IS NOT NULL
		) THEN
		RAISE EXCEPTION 'capture failure was not terminal and non-throwing: %', v_receipt;
	END IF;
END;
$$;

-- Twenty live entries rotate the oldest one on the next append.
UPDATE public.onto_documents documents
SET content = E'# Research Log\n\nResearch captured automatically from chat turns, newest first. Each entry records what was\nsearched, which sources were read, and what went unresolved.\n' || (
	SELECT string_agg(
		format(E'## 2026-08-%s · Old %s\n<!-- run:old-%s -->', lpad(day::text, 2, '0'), day, day),
		E'\n\n' ORDER BY day DESC
	)
	FROM generate_series(1, 20) day
)
WHERE documents.title = 'Research Log';
INSERT INTO public.queue_jobs(id, user_id, job_type, status, processing_token, metadata)
VALUES (
	'aa500000-0000-4000-8000-000000000004', 'aa100000-0000-4000-8000-000000000001',
	'agentic_chat_turn', 'processing', 'aa600000-0000-4000-8000-000000000004',
	'{"turnRunId":"aa700000-0000-4000-8000-000000000004","correlationId":"aa800000-0000-4000-8000-000000000004"}'
);
INSERT INTO public.chat_turn_runs(
	id, queue_job_id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status, stream_run_id, project_id, execution_started_at
) VALUES (
	'aa700000-0000-4000-8000-000000000004', 'aa500000-0000-4000-8000-000000000004',
	'aa200000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
	'aa800000-0000-4000-8000-000000000004', 'worker_realtime', 1, 'running',
	'stream-research-4', 'aa400000-0000-4000-8000-000000000001', transaction_timestamp()
);
INSERT INTO public.chat_tool_executions(
	id, turn_run_id, sequence_index, tool_name, arguments, result, success
) VALUES
	('aa900000-0000-4000-8000-000000000041', 'aa700000-0000-4000-8000-000000000004', 1, 'web_search', '{}', '{}', true),
	('aa900000-0000-4000-8000-000000000042', 'aa700000-0000-4000-8000-000000000004', 2, 'web_visit', '{}', '{}', true);
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.apply_agentic_chat_research_capture(
		'aa700000-0000-4000-8000-000000000004',
		'aa100000-0000-4000-8000-000000000001',
		'aa500000-0000-4000-8000-000000000004',
		'aa600000-0000-4000-8000-000000000004', 1,
		'ab100000-0000-4000-8000-000000000004', repeat('d', 64),
		'aa400000-0000-4000-8000-000000000001', 'stream-research-4',
		E'## 2026-08-13 · Newest\n<!-- run:stream-research-4 -->',
		'Auto-captured research. Latest: Newest'
	);
	IF v_receipt->>'outcome' <> 'appended' OR (v_receipt->>'rotated')::integer <> 1
		OR cardinality(public.agentic_chat_research_log_entries((
			SELECT content FROM public.onto_documents WHERE title = 'Research Log'
		))) <> 20
		OR cardinality(public.agentic_chat_research_log_entries((
			SELECT content FROM public.onto_documents WHERE title = 'Research Log (Archive)'
		))) <> 1 THEN
		RAISE EXCEPTION 'research rotation mismatch: %', v_receipt;
	END IF;
END;
$$;

RESET ROLE;
SELECT 'agentic_chat_research_capture_ok' AS result;
