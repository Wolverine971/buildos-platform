-- supabase/tests/20261017202000_agentic_chat_review_decision_observations.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261017202000_agentic_chat_review_decision_observations.sql \
--     --check supabase/tests/20261017202000_agentic_chat_review_decision_observations.check.sql
--
-- The review-decision and write-commission receipts (audit 2026-10-17 M5/S5):
--   1. the worker's exact payload shapes pass the redaction allowlist (they reach
--      the turn lookup, which fails here because no turn exists);
--   2. prose, unknown keys, wrong types, and out-of-range values are refused;
--   3. the table CHECK admits both event types under the provider phase only;
--   4. the function is still SECURITY INVOKER, search_path-only, service_role only;
--   5. the existing provider allowlist and media branch are unchanged.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION pg_temp.observe(p_event_type text, p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	PERFORM public.persist_agentic_chat_execution_observation(
		'f2020000-0000-4000-8000-000000000001',
		'f2020000-0000-4000-8000-000000000002',
		'f2020000-0000-4000-8000-000000000003',
		'f2020000-0000-4000-8000-000000000004',
		1,
		repeat('a', 64),
		'provider',
		p_event_type,
		p_payload
	);
	RETURN 'persisted';
EXCEPTION WHEN OTHERS THEN
	RETURN SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_actual text, p_expected text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF p_actual IS DISTINCT FROM p_expected THEN
		RAISE EXCEPTION 'check failed (%): expected %, got %', p_label, p_expected, p_actual;
	END IF;
END;
$$;

-- Payloads exactly as review-telemetry.ts builds them.
CREATE OR REPLACE FUNCTION pg_temp.review_payload()
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'logical_provider_round', 3,
		'review_lane', 'mutation_batch',
		'review_attempt', 1,
		'review_outcome', 'revision_requested',
		'review_decision_tool', 'request_proposal_revision',
		'review_rejection_code', 'revision_without_defective_call',
		'review_finding_codes', jsonb_build_array('missing_commissioned_write'),
		'review_defective_calls', jsonb_build_array(2, 40),
		'review_argument_check_count', 4,
		'review_stage_call_count', 8,
		'review_stage_tools', jsonb_build_array('create_onto_task', 'update_onto_task'),
		'review_prior_revisions', 0,
		'review_read_only_offered', true,
		'duration_ms', 2140
	)
$$;

CREATE OR REPLACE FUNCTION pg_temp.commission_payload()
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'jev_status', 'selected',
		'jev_write_commission', 0.12,
		'jev_commissioned_write_tools', '[]'::jsonb,
		'proposed_write_tools', jsonb_build_array('create_onto_task'),
		'proposed_write_call_count', 3,
		'review_outcomes', jsonb_build_array('revision_requested', 'approved'),
		'awaiting_user_card', false,
		'writes_held', false,
		'hold_enabled', false,
		'turn_rules_playbook', 'task_management',
		'finished_reason', 'stop'
	)
$$;

DO $check$
DECLARE
	v_ok constant text := 'agentic_chat_execution_observation_turn_not_found';
	v_review_bad constant text := 'agentic_chat_execution_observation_invalid_review_receipt';
	v_commission_bad constant text := 'agentic_chat_execution_observation_invalid_commission_receipt';
	v_def text;
	v_proc record;
BEGIN
	-- 1. Valid shapes clear the allowlist and reach the turn lookup.
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload()), v_ok, 'review valid');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided',
		pg_temp.review_payload() || jsonb_build_object(
			'review_lane', 'turn_contract', 'review_attempt', 2, 'review_outcome', 'invalid',
			'review_decision_tool', NULL, 'review_rejection_code', NULL,
			'review_finding_codes', '[]'::jsonb, 'review_defective_calls', '[]'::jsonb,
			'review_stage_tools', '[]'::jsonb, 'review_stage_call_count', 0, 'duration_ms', 0
		)), v_ok, 'review nulls and empties');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload()), v_ok, 'commission valid');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed',
		pg_temp.commission_payload() || jsonb_build_object(
			'jev_status', 'absent', 'jev_write_commission', NULL, 'turn_rules_playbook', NULL,
			'finished_reason', NULL, 'awaiting_user_card', true, 'review_outcomes', '[]'::jsonb,
			'proposed_write_tools', '[]'::jsonb, 'proposed_write_call_count', 0
		)), v_ok, 'commission nulls');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed',
		pg_temp.commission_payload() || jsonb_build_object('jev_write_commission', 1, 'writes_held', true, 'hold_enabled', true)),
		v_ok, 'commission bounds');

	-- 2. Review receipts refuse prose, unknown keys, and bad types or ranges.
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"reason":"the user asked"}'), v_review_bad, 'review prose key');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() - 'review_outcome'), v_review_bad, 'review missing key');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_lane":"research"}'), v_review_bad, 'review lane');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_attempt":3}'), v_review_bad, 'review attempt');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_outcome":"maybe"}'), v_review_bad, 'review outcome');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_finding_codes":["Missing work: add the tasks"]}'), v_review_bad, 'review finding prose');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_defective_calls":[41]}'), v_review_bad, 'review defective range');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_defective_calls":["2"]}'), v_review_bad, 'review defective type');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_stage_tools":["Create Task"]}'), v_review_bad, 'review stage tool');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_argument_check_count":21}'), v_review_bad, 'review check count');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_read_only_offered":"yes"}'), v_review_bad, 'review boolean');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"review_decision_tool":"approve; drop table"}'), v_review_bad, 'review tool name');

	-- Commission receipts likewise.
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"message":"add a task"}'), v_commission_bad, 'commission prose key');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() - 'awaiting_user_card'), v_commission_bad, 'commission missing key');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"jev_write_commission":1.5}'), v_commission_bad, 'commission probability');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"jev_write_commission":"0.4"}'), v_commission_bad, 'commission probability type');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"jev_status":"guessed"}'), v_commission_bad, 'commission status');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"proposed_write_tools":["update onto task"]}'), v_commission_bad, 'commission tool');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"review_outcomes":["approved","bounced"]}'), v_commission_bad, 'commission outcome');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"proposed_write_call_count":1001}'), v_commission_bad, 'commission count');
	PERFORM pg_temp.expect(pg_temp.observe('provider_commission_observed', pg_temp.commission_payload() || '{"finished_reason":"The model stopped."}'), v_commission_bad, 'commission finish');

	-- Generic checks still apply to the new events.
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"logical_provider_round":0}'), 'agentic_chat_execution_observation_invalid_logical_round', 'generic round');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_decided', pg_temp.review_payload() || '{"duration_ms":-1}'), 'agentic_chat_execution_observation_invalid_duration', 'generic duration');

	-- 5. The other provider events keep their own allowlist: a review key on an
	-- attempt receipt is still not redacted, and an unknown event is refused.
	PERFORM pg_temp.expect(pg_temp.observe('provider_media_resolved', '{"review_lane":"mutation_batch"}'), 'agentic_chat_execution_observation_invalid_media_receipt', 'media branch');
	PERFORM pg_temp.expect(pg_temp.observe('provider_review_skipped', pg_temp.review_payload()), 'agentic_chat_execution_observation_invalid_identity', 'unknown event');

	-- 3. The table CHECK admits both new events, provider phase only.
	SELECT pg_catalog.pg_get_constraintdef(oid) INTO STRICT v_def
	FROM pg_catalog.pg_constraint
	WHERE conrelid = 'public.agentic_chat_execution_observations'::regclass
		AND conname = 'agentic_chat_execution_observations_event_type_check'
		AND convalidated;
	IF position('provider_review_decided' IN v_def) = 0
		OR position('provider_commission_observed' IN v_def) = 0
		OR position('provider_media_resolved' IN v_def) = 0 THEN
		RAISE EXCEPTION 'check failed (constraint): %', v_def;
	END IF;
	IF (SELECT count(*) FROM pg_catalog.pg_constraint
		WHERE conrelid = 'public.agentic_chat_execution_observations'::regclass
			AND contype = 'c'
			AND pg_catalog.pg_get_constraintdef(oid) LIKE '%provider_attempt_started%') <> 1 THEN
		RAISE EXCEPTION 'check failed (constraint): expected exactly one event_type CHECK';
	END IF;

	-- 4. Same security shape as before.
	SELECT p.prosecdef, p.proconfig INTO STRICT v_proc
	FROM pg_catalog.pg_proc p
	WHERE p.oid = 'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;
	IF v_proc.prosecdef OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] THEN
		RAISE EXCEPTION 'check failed (security): definer=% config=%', v_proc.prosecdef, v_proc.proconfig;
	END IF;
	IF has_function_privilege('anon', 'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE')
		OR has_function_privilege('authenticated', 'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)', 'EXECUTE') THEN
		RAISE EXCEPTION 'check failed (grants)';
	END IF;
	PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
	BEGIN
		PERFORM public.persist_agentic_chat_execution_observation(
			'f2020000-0000-4000-8000-000000000001', 'f2020000-0000-4000-8000-000000000002',
			'f2020000-0000-4000-8000-000000000003', 'f2020000-0000-4000-8000-000000000004',
			1, repeat('a', 64), 'provider', 'provider_review_decided', pg_temp.review_payload());
		RAISE EXCEPTION 'check failed (role): authenticated claims were accepted';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;

	RAISE NOTICE 'review decision observation checks passed';
END;
$check$;
