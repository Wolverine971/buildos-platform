-- supabase/tests/20261017201000_agentic_chat_admission_rate_limit.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261017201000_agentic_chat_admission_rate_limit.sql \
--     --check supabase/tests/20261017201000_agentic_chat_admission_rate_limit.check.sql
--
-- create_agentic_chat_turn_with_job's per-user rate limit (audit B14), against
-- production's schema and triggers. Every turn is admitted through the real RPC:
--   1. security and grants are unchanged (invoker, search_path only, service_role only);
--   2. 20 admissions inside 60 s pass, the 21st is refused as rate_limited and writes
--      nothing (no turn, session, message or queue job);
--   3. over the limit, an exact resend is still matching_duplicate and a changed
--      resend is still idempotency_conflict (duplicates are checked first);
--   4. the window slides: once the oldest turn ages out the next send is admitted,
--      and retry_after_seconds counts down to when the limiting turn ages out;
--   5. the limit is per user.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO auth.users (id, email)
VALUES
	('b1400000-0000-4000-8000-000000000001', 'rate-limit-a@example.com'),
	('b1400000-0000-4000-8000-000000000002', 'rate-limit-b@example.com');
INSERT INTO public.users (id, email)
VALUES
	('b1400000-0000-4000-8000-000000000001', 'rate-limit-a@example.com'),
	('b1400000-0000-4000-8000-000000000002', 'rate-limit-b@example.com')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.sid(p_prefix text, p_n integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- One session-less global send, turn number p_n. The same p_n is the same client
-- turn (an exact resend); p_variant changes the request hash (an edited resend).
CREATE OR REPLACE FUNCTION pg_temp.admit(p_user uuid, p_n integer, p_variant text DEFAULT '')
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.create_agentic_chat_turn_with_job(
		p_user_id => p_user,
		p_session_id => NULL,
		p_turn_run_id => pg_temp.sid('e1', p_n),
		p_user_message_id => pg_temp.sid('e2', p_n),
		p_input_artifact_id => pg_temp.sid('e3', p_n),
		p_stream_run_id => 'rate-limit-stream-' || p_n,
		p_client_turn_id => 'rate-limit-client-' || p_n,
		p_request_hash => encode(sha256(convert_to('rate-limit-' || p_n || p_variant, 'UTF8')), 'hex'),
		p_request_hash_version => 'agentic_chat_request_hash_v2',
		p_transport_contract_version => 'agentic_chat_worker_v1',
		p_transport_decision_id => pg_temp.sid('e4', p_n),
		p_correlation_id => pg_temp.sid('e5', p_n),
		p_context_type => 'global',
		p_entity_id => NULL,
		p_project_id => NULL,
		p_source => 'live_ui',
		p_gateway_enabled => true,
		p_request_message => 'rate limit fixture ' || p_n,
		p_request_payload => '{}'::jsonb,
		p_request_payload_version => 'agentic_chat_request_v1',
		p_user_message_content => 'rate limit fixture ' || p_n,
		p_user_message_metadata => '{}'::jsonb,
		p_history_limit => 10,
		p_history_source => 'admission_window',
		p_artifact_history => '[]'::jsonb,
		p_artifact_prepared => jsonb_build_object(
			'surfaceProfile', 'global_default',
			'systemPrompt', 'Rate limit fixture',
			'contextPayload', '{}'::jsonb,
			'promptSections', '[]'::jsonb,
			'toolSurface', '{}'::jsonb
		),
		p_artifact_content_hash => repeat('a', 64),
		p_artifact_history_bytes => 2,
		p_artifact_content_bytes => 64,
		p_prepared_prompt_id => NULL,
		p_prepared_context_payload_sha256 => NULL,
		p_prepared_surface_profile => NULL,
		p_session_agent_metadata => '{}'::jsonb,
		p_capacity_available => true
	)
$$;

-- 1. Security and grants are unchanged.
DO $$
DECLARE
	v_signature regprocedure := 'public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean)'::regprocedure;
	v_proc pg_proc%ROWTYPE;
	v_grantees text[];
BEGIN
	SELECT * INTO v_proc FROM pg_proc WHERE oid = v_signature;
	ASSERT NOT v_proc.prosecdef, 'admission RPC stays SECURITY INVOKER';
	ASSERT v_proc.proconfig = ARRAY['search_path=pg_catalog, public'],
		format('only search_path is set on the function: %s', v_proc.proconfig);
	SELECT array_agg(DISTINCT pg_get_userbyid(acl.grantee) ORDER BY pg_get_userbyid(acl.grantee))
	INTO v_grantees
	FROM aclexplode(v_proc.proacl) AS acl
	WHERE acl.grantee <> v_proc.proowner;
	ASSERT v_grantees = ARRAY['service_role'],
		format('only service_role besides the owner may execute: %s', v_grantees);
	ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE'),
		'service_role keeps EXECUTE';
	ASSERT NOT has_function_privilege('authenticated', v_signature, 'EXECUTE'),
		'authenticated must not execute the admission RPC';
	ASSERT NOT has_function_privilege('anon', v_signature, 'EXECUTE'),
		'anon must not execute the admission RPC';
	ASSERT EXISTS (
		SELECT 1 FROM pg_indexes
		WHERE schemaname = 'public'
			AND indexname = 'idx_chat_turn_runs_user_created'
	), 'the window count has its (user_id, created_at) index';
END;
$$;

-- The RPC requires the service role claim.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- 2. 20 admissions inside 60 s pass; the 21st is refused and writes nothing.
DO $$
DECLARE
	v_user uuid := 'b1400000-0000-4000-8000-000000000001';
	v_receipt jsonb;
	v_n integer;
	v_sessions integer;
	v_messages integer;
BEGIN
	FOR v_n IN 1 .. 20 LOOP
		v_receipt := pg_temp.admit(v_user, v_n);
		ASSERT v_receipt->>'outcome' = 'newly_admitted',
			format('turn %s should be admitted: %s', v_n, v_receipt);
	END LOOP;
	SELECT count(*) INTO v_sessions FROM public.chat_sessions WHERE user_id = v_user;
	SELECT count(*) INTO v_messages FROM public.chat_messages WHERE user_id = v_user;

	v_receipt := pg_temp.admit(v_user, 21);
	ASSERT v_receipt->>'outcome' = 'rate_limited'
		AND v_receipt->'execution_may_start' = 'false'::jsonb
		AND (v_receipt->>'recent_count')::integer = 20
		AND (v_receipt->>'limit')::integer = 20
		AND (v_receipt->>'window_seconds')::integer = 60
		AND (v_receipt->>'retry_after_seconds')::integer BETWEEN 1 AND 60, v_receipt::text;
	ASSERT NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = pg_temp.sid('e1', 21)),
		'a refused send writes no turn';
	ASSERT NOT EXISTS (
		SELECT 1 FROM public.queue_jobs
		WHERE dedup_key = 'agentic-chat-turn:' || pg_temp.sid('e1', 21)::text
	), 'a refused send queues no job';
	ASSERT (SELECT count(*) FROM public.chat_sessions WHERE user_id = v_user) = v_sessions,
		'a refused session-less send creates no session';
	ASSERT (SELECT count(*) FROM public.chat_messages WHERE user_id = v_user) = v_messages,
		'a refused send stores no message';
END;
$$;

-- 3. Duplicates first: over the limit, resends still resolve to the existing turn.
DO $$
DECLARE
	v_user uuid := 'b1400000-0000-4000-8000-000000000001';
	v_receipt jsonb;
BEGIN
	v_receipt := pg_temp.admit(v_user, 5);
	ASSERT v_receipt->>'outcome' = 'matching_duplicate'
		AND v_receipt->>'turn_run_id' = pg_temp.sid('e1', 5)::text, v_receipt::text;

	v_receipt := pg_temp.admit(v_user, 5, 'edited');
	ASSERT v_receipt->>'outcome' = 'idempotency_conflict'
		AND v_receipt->>'conflict_reason' = 'request_hash_mismatch', v_receipt::text;
END;
$$;

-- 4. The window slides. Age turn 1 out of the window and put turn 2 at -50 s: the
-- next send is admitted, which brings the user back to 20, and the one after is
-- refused until turn 2 ages out (~10 s).
DO $$
DECLARE
	v_user uuid := 'b1400000-0000-4000-8000-000000000001';
	v_receipt jsonb;
BEGIN
	UPDATE public.chat_turn_runs
	SET created_at = clock_timestamp() - interval '61 seconds'
	WHERE id = pg_temp.sid('e1', 1);
	UPDATE public.chat_turn_runs
	SET created_at = clock_timestamp() - interval '50 seconds'
	WHERE id = pg_temp.sid('e1', 2);

	v_receipt := pg_temp.admit(v_user, 21);
	ASSERT v_receipt->>'outcome' = 'newly_admitted', v_receipt::text;

	v_receipt := pg_temp.admit(v_user, 22);
	ASSERT v_receipt->>'outcome' = 'rate_limited'
		AND (v_receipt->>'recent_count')::integer = 20
		AND (v_receipt->>'retry_after_seconds')::integer BETWEEN 9 AND 11, v_receipt::text;
END;
$$;

-- 5. Per user: another account is not affected.
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := pg_temp.admit('b1400000-0000-4000-8000-000000000002', 101);
	ASSERT v_receipt->>'outcome' = 'newly_admitted', v_receipt::text;
END;
$$;

SELECT set_config('request.jwt.claims', '', false);
