-- supabase/tests/20260813040000_agentic_chat_stated_future_evidence.test.sql
-- Disposable PostgreSQL proof for P4 S6 deterministic stated-future evidence.
\set ON_ERROR_STOP on

DO $$
BEGIN
	IF has_function_privilege('anon', 'public.load_agentic_chat_stated_future_evidence(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
		OR has_function_privilege('authenticated', 'public.load_agentic_chat_stated_future_evidence(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.load_agentic_chat_stated_future_evidence(uuid,uuid,uuid,uuid,integer)', 'EXECUTE') THEN
		RAISE EXCEPTION 'stated-future evidence RPC ACL mismatch';
	END IF;
END;
$$;

SET ROLE anon;
DO $$
BEGIN
	PERFORM public.load_agentic_chat_stated_future_evidence(
		'ac700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'ac500000-0000-4000-8000-000000000001',
		'ac600000-0000-4000-8000-000000000001', 2
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
	v_receipt := public.load_agentic_chat_stated_future_evidence(
		'ac700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'ac500000-0000-4000-8000-000000000001',
		'ac600000-0000-4000-8000-000000000001', 2
	);
	IF v_receipt->>'outcome' <> 'eligible'
		OR v_receipt->>'stream_run_id' <> 'stream-stated-future-1'
		OR jsonb_array_length(v_receipt->'executions') <> 5
		OR v_receipt#>>'{executions,0,name}' <> 'update_onto_task'
		OR v_receipt#>'{executions,0,args}' <> '{}'::jsonb
		OR v_receipt#>'{executions,0,result}' <> '{"status":"updated"}'::jsonb
		OR v_receipt#>>'{executions,2,result,data,status}' <> 'moved'
		OR v_receipt#>>'{executions,3,error}' NOT LIKE 'Tool validation failed: Duplicate commissioned target skipped:%'
		OR v_receipt#>>'{executions,4,args,document,body_markdown}' <> 'Waiting on legal approval'
		OR v_receipt#>'{executions,4,result,result}' <> '{"status":"duplicate_write_skipped"}'::jsonb
		OR v_receipt::text LIKE '%strip-me%'
		OR v_receipt::text LIKE '%secret-task%'
		OR v_receipt::text LIKE '%secret-document%' THEN
		RAISE EXCEPTION 'bounded stated-future evidence mismatch: %', v_receipt;
	END IF;
END;
$$;

-- Cancellation is visible before any evidence can be used.
UPDATE public.chat_turn_runs
SET cancel_requested_at = transaction_timestamp()
WHERE id = 'ac700000-0000-4000-8000-000000000001';
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.load_agentic_chat_stated_future_evidence(
		'ac700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'ac500000-0000-4000-8000-000000000001',
		'ac600000-0000-4000-8000-000000000001', 2
	);
	IF v_receipt->>'outcome' <> 'cancel_requested'
		OR v_receipt->'executions' <> '[]'::jsonb THEN
		RAISE EXCEPTION 'stated-future cancellation mismatch: %', v_receipt;
	END IF;
END;
$$;

-- A superseded generation is rejected before queue ownership is consulted.
UPDATE public.chat_turn_runs
SET cancel_requested_at = NULL, execution_generation = 3
WHERE id = 'ac700000-0000-4000-8000-000000000001';
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.load_agentic_chat_stated_future_evidence(
		'ac700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'ac500000-0000-4000-8000-000000000001',
		'ac600000-0000-4000-8000-000000000001', 2
	);
	IF v_receipt->>'outcome' <> 'stale_generation' THEN
		RAISE EXCEPTION 'stated-future stale generation mismatch: %', v_receipt;
	END IF;
END;
$$;

-- Terminality wins and never leaks the durable ledger.
UPDATE public.chat_turn_runs
SET status = 'completed', terminalized_at = transaction_timestamp()
WHERE id = 'ac700000-0000-4000-8000-000000000001';
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := public.load_agentic_chat_stated_future_evidence(
		'ac700000-0000-4000-8000-000000000001',
		'aa100000-0000-4000-8000-000000000001',
		'ac500000-0000-4000-8000-000000000001',
		'ac600000-0000-4000-8000-000000000001', 3
	);
	IF v_receipt->>'outcome' <> 'already_terminal'
		OR v_receipt->'executions' <> '[]'::jsonb THEN
		RAISE EXCEPTION 'stated-future terminal mismatch: %', v_receipt;
	END IF;
END;
$$;

RESET ROLE;
SELECT 'agentic_chat_stated_future_evidence_ok' AS result;
