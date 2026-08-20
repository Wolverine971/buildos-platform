-- supabase/tests/20260820010000_agentic_chat_worker_retention_cleanup.test.sql
-- Disposable PostgreSQL proof for Phase 5 Agentic Chat retention cleanup.
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

SELECT pg_temp.assert_true(
	(
		SELECT uncertain_reconciled_at = updated_at
		FROM public.chat_turn_effects
		WHERE id = 'e0700000-0000-4000-8000-000000000001'
	),
	'pre-migration terminal effect was not conservatively backfilled'
);

INSERT INTO public.users (id)
VALUES ('e1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'global', 'active');

-- Seed all rows as running so the normal signal/effect validators see valid
-- ownership. The disposable fixture ages and terminalizes them afterward.
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, source,
	context_type, gateway_enabled, request_message, status, execution_mode,
	execution_generation, cancel_requested_at, cancel_reason
)
VALUES
	(
		'e3000000-0000-4000-8000-000000000001',
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'retention-old', 'retention-old-client', 'live_ui', 'global', true,
		'old terminal', 'running', 'worker_realtime', 1, now(), 'user_cancelled'
	),
	(
		'e3000000-0000-4000-8000-000000000002',
		'e2000000-0000-4000-8000-000000000002',
		'e1000000-0000-4000-8000-000000000001',
		'retention-fresh', 'retention-fresh-client', 'live_ui', 'global', true,
		'fresh terminal', 'running', 'worker_realtime', 1, now(), 'user_cancelled'
	),
	(
		'e3000000-0000-4000-8000-000000000003',
		'e2000000-0000-4000-8000-000000000003',
		'e1000000-0000-4000-8000-000000000001',
		'retention-active', 'retention-active-client', 'live_ui', 'global', true,
		'active turn', 'running', 'worker_realtime', 1, now(), 'user_cancelled'
	);

INSERT INTO public.chat_turn_stream_state (
	turn_run_id, session_id, user_id, execution_generation,
	snapshot_sequence, durable_through_sequence, projection_durable_sequence,
	assistant_text, projection
)
VALUES
	('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1, 1, 1, 1, 'old', '{}'::jsonb),
	('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 1, 1, 1, 1, 'fresh', '{}'::jsonb),
	('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 1, 1, 1, 1, 'active', '{}'::jsonb);

INSERT INTO public.chat_turn_signals (
	id, turn_run_id, session_id, user_id, reason, source
)
VALUES
	('e4000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'user_cancelled', 'browser'),
	('e4000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'user_cancelled', 'browser'),
	('e4000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'user_cancelled', 'browser');

INSERT INTO public.chat_turn_events (
	id, turn_run_id, session_id, user_id, stream_run_id, sequence_index,
	phase, event_type, payload, execution_generation, event_id
)
VALUES
	('e5000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'retention-old', 1, 'stream', 'text_delta', '{}'::jsonb, 1, 'e3000000-0000-4000-8000-000000000001:1:1'),
	('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'retention-fresh', 1, 'stream', 'text_delta', '{}'::jsonb, 1, 'e3000000-0000-4000-8000-000000000002:1:1'),
	('e5000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'retention-active', 1, 'stream', 'text_delta', '{}'::jsonb, 1, 'e3000000-0000-4000-8000-000000000003:1:1');

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, artifact_version, history_source,
	history, prepared, content_hash, history_bytes, content_bytes,
	created_at, retain_until
)
VALUES
	('e6000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb, repeat('a', 64), 2, 32, now() - interval '120 days', now() - interval '113 days'),
	('e6000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb, repeat('b', 64), 2, 32, now() - interval '5 days', now() + interval '2 days'),
	('e6000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb, repeat('c', 64), 2, 32, now() - interval '120 days', now() - interval '113 days');

UPDATE public.chat_turn_runs turns
SET input_artifact_id = artifacts.id
FROM public.chat_turn_input_artifacts artifacts
WHERE artifacts.turn_run_id = turns.id;

INSERT INTO public.chat_turn_effects (
	id, turn_run_id, session_id, user_id, execution_generation, tool_name,
	operation_name, canonical_argument_hash, state,
	downstream_idempotency_supported, reserved_at, created_at, updated_at
)
VALUES
	('e7000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1, 'direct_old', 'direct_old', repeat('1', 64), 'reserved', true, now() - interval '120 days', now() - interval '120 days', now() - interval '120 days'),
	('e7000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1, 'uncertain_old', 'uncertain_old', repeat('2', 64), 'reserved', false, now() - interval '120 days', now() - interval '120 days', now() - interval '120 days'),
	('e7000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1, 'reconciled_old', 'reconciled_old', repeat('3', 64), 'reserved', true, now() - interval '120 days', now() - interval '120 days', now() - interval '120 days'),
	('e7000000-0000-4000-8000-000000000004', 'e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 1, 'direct_fresh', 'direct_fresh', repeat('4', 64), 'reserved', true, now() - interval '5 days', now() - interval '5 days', now() - interval '5 days'),
	('e7000000-0000-4000-8000-000000000005', 'e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 1, 'active', 'active', repeat('5', 64), 'reserved', true, now(), now(), now());

-- Age terminal rows and construct historical effect states without pretending
-- those transitions occurred in the present test transaction.
SET LOCAL session_replication_role = replica;

UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = now() - interval '100 days',
	finished_at = now() - interval '100 days',
	updated_at = now() - interval '100 days'
WHERE id = 'e3000000-0000-4000-8000-000000000001';

UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = now() - interval '2 days',
	finished_at = now() - interval '2 days',
	updated_at = now() - interval '2 days'
WHERE id = 'e3000000-0000-4000-8000-000000000002';

UPDATE public.chat_turn_effects
SET state = 'succeeded', started_at = now() - interval '119 days',
	finished_at = now() - interval '118 days', updated_at = now() - interval '118 days'
WHERE id = 'e7000000-0000-4000-8000-000000000001';

UPDATE public.chat_turn_effects
SET state = 'uncertain', started_at = now() - interval '119 days',
	finished_at = now() - interval '118 days', updated_at = now() - interval '118 days',
	failure_code = 'uncertain_external_commit'
WHERE id = 'e7000000-0000-4000-8000-000000000002';

UPDATE public.chat_turn_effects
SET state = 'succeeded', started_at = now() - interval '119 days',
	finished_at = now() - interval '118 days', updated_at = now() - interval '100 days',
	uncertain_reconciled_at = now() - interval '100 days'
WHERE id = 'e7000000-0000-4000-8000-000000000003';

UPDATE public.chat_turn_effects
SET state = 'succeeded', started_at = now() - interval '4 days',
	finished_at = now() - interval '3 days', updated_at = now() - interval '3 days'
WHERE id = 'e7000000-0000-4000-8000-000000000004';

SET LOCAL session_replication_role = origin;

-- Explicit reconciliation owns its audit timestamp even if a caller supplies
-- one. Exercise the normal trigger path on an active effect.
UPDATE public.chat_turn_effects
SET state = 'started', started_at = clock_timestamp()
WHERE id = 'e7000000-0000-4000-8000-000000000005';
UPDATE public.chat_turn_effects
SET state = 'uncertain', finished_at = clock_timestamp(),
	failure_code = 'uncertain_external_commit'
WHERE id = 'e7000000-0000-4000-8000-000000000005';
UPDATE public.chat_turn_effects
SET state = 'succeeded',
	downstream_receipt = '{"reconciled":true}'::jsonb,
	uncertain_reconciled_at = clock_timestamp() - interval '365 days'
WHERE id = 'e7000000-0000-4000-8000-000000000005';

SELECT pg_temp.assert_true(
	(SELECT uncertain_reconciled_at > clock_timestamp() - interval '1 minute'
	 FROM public.chat_turn_effects
	 WHERE id = 'e7000000-0000-4000-8000-000000000005'),
	'explicit uncertain reconciliation accepted a caller-owned audit timestamp'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'authenticated',
		'public.cleanup_agentic_chat_worker_artifacts(integer,integer,integer,integer)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.cleanup_agentic_chat_worker_artifacts(integer,integer,integer,integer)',
		'EXECUTE'
	),
	'cleanup RPC privilege boundary is not service-only'
);

DO $$
DECLARE
	v_rejected boolean := false;
BEGIN
	BEGIN
		DELETE FROM public.chat_turn_events
		WHERE id = 'e5000000-0000-4000-8000-000000000002';
	EXCEPTION WHEN OTHERS THEN
		v_rejected := SQLERRM = 'agentic_chat_control_row_retention_not_elapsed';
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'fresh terminal event bypassed retention');
END;
$$;

DO $$
DECLARE
	v_fresh_rejected boolean := false;
	v_active_rejected boolean := false;
	v_uncertain_rejected boolean := false;
BEGIN
	BEGIN
		DELETE FROM public.chat_turn_effects
		WHERE id = 'e7000000-0000-4000-8000-000000000004';
	EXCEPTION WHEN OTHERS THEN
		v_fresh_rejected := SQLERRM = 'agentic_chat_effect_retention_not_elapsed';
	END;
	BEGIN
		DELETE FROM public.chat_turn_effects
		WHERE id = 'e7000000-0000-4000-8000-000000000005';
	EXCEPTION WHEN OTHERS THEN
		v_active_rejected := SQLERRM = 'agentic_chat_active_effect_cannot_be_deleted';
	END;
	BEGIN
		DELETE FROM public.chat_turn_effects
		WHERE id = 'e7000000-0000-4000-8000-000000000002';
	EXCEPTION WHEN OTHERS THEN
		v_uncertain_rejected := SQLERRM = 'agentic_chat_uncertain_effect_cannot_be_deleted';
	END;
	PERFORM pg_temp.assert_true(
		v_fresh_rejected AND v_active_rejected AND v_uncertain_rejected,
		'effect delete guards did not independently protect fresh, active, and uncertain rows'
	);
END;
$$;

CREATE TEMP TABLE phase5_retention_result (summary jsonb);
GRANT SELECT, INSERT ON phase5_retention_result TO service_role;

SET LOCAL ROLE service_role;
INSERT INTO phase5_retention_result
SELECT public.cleanup_agentic_chat_worker_artifacts();
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT summary @> '{
		"turn_events_deleted": 1,
		"stream_states_deleted": 1,
		"turn_signals_deleted": 1,
		"input_artifacts_deleted": 1,
		"effects_deleted": 2,
		"terminal_retention_days": 7,
		"effect_retention_days": 30,
		"uncertain_effect_retention_days": 90,
		"batch_size": 1000
	}'::jsonb FROM phase5_retention_result),
	'cleanup returned an unexpected bounded deletion summary'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_stream_state WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_signals WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_input_artifacts WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001')
	AND (SELECT input_artifact_id IS NULL FROM public.chat_turn_runs WHERE id = 'e3000000-0000-4000-8000-000000000001'),
	'eligible terminal stream/event/signal/input artifacts were not removed together'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.chat_turn_effects
		WHERE id = 'e7000000-0000-4000-8000-000000000002' AND state = 'uncertain'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_turn_effects
		WHERE id IN (
			'e7000000-0000-4000-8000-000000000001',
			'e7000000-0000-4000-8000-000000000003'
		)
	),
	'cleanup deleted unresolved uncertainty or retained elapsed resolved effects'
);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.chat_turn_events WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.chat_turn_stream_state WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.chat_turn_input_artifacts WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.chat_turn_events WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000003')
	AND (SELECT count(*) = 1 FROM public.chat_turn_stream_state WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000003')
	AND (SELECT count(*) = 1 FROM public.chat_turn_input_artifacts WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000003'),
	'cleanup touched fresh-terminal or active-turn artifacts'
);

-- More eligible rows than the requested batch prove that one invocation is
-- bounded rather than merely returning the configured batch size.
INSERT INTO public.chat_turn_events (
	id, turn_run_id, session_id, user_id, stream_run_id, sequence_index,
	phase, event_type, payload, execution_generation, event_id
)
VALUES
	('e5000000-0000-4000-8000-000000000010', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'retention-old', 10, 'stream', 'text_delta', '{}'::jsonb, 1, 'e3000000-0000-4000-8000-000000000001:1:10'),
	('e5000000-0000-4000-8000-000000000011', 'e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'retention-old', 11, 'stream', 'text_delta', '{}'::jsonb, 1, 'e3000000-0000-4000-8000-000000000001:1:11');

TRUNCATE phase5_retention_result;
SET LOCAL ROLE service_role;
INSERT INTO phase5_retention_result
SELECT public.cleanup_agentic_chat_worker_artifacts(7, 30, 90, 1);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT summary->>'turn_events_deleted' = '1' FROM phase5_retention_result)
	AND (
		SELECT count(*) = 1
		FROM public.chat_turn_events
		WHERE turn_run_id = 'e3000000-0000-4000-8000-000000000001'
	),
	'cleanup did not enforce its per-table deletion batch bound'
);

TRUNCATE phase5_retention_result;
SET LOCAL ROLE service_role;
INSERT INTO phase5_retention_result
SELECT public.cleanup_agentic_chat_worker_artifacts(0, 0, 0, 0);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT summary->>'terminal_retention_days' = '7'
		AND summary->>'effect_retention_days' = '30'
		AND summary->>'uncertain_effect_retention_days' = '90'
		AND summary->>'batch_size' = '1'
	 FROM phase5_retention_result),
	'cleanup accepted a retention or batch value below its locked safety floor'
);

SELECT 'phase5_worker_retention_cleanup_ok' AS result;

ROLLBACK;
