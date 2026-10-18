-- supabase/tests/20261018180000_agentic_chat_terminal_reconcile_hint.check.sql
--
-- Rehearsal check for 20261018180000_agentic_chat_terminal_reconcile_hint.sql:
--   pnpm db:rehearse supabase/migrations/20261018180000_agentic_chat_terminal_reconcile_hint.sql \
--     --check supabase/tests/20261018180000_agentic_chat_terminal_reconcile_hint.check.sql
--
-- The rehearsal cluster has no realtime schema, so realtime.send is stubbed to
-- record its calls. The trigger is attached to a column-for-column copy of
-- chat_turn_runs (no constraints) to exercise each terminal path.

CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA rehearsal_hint;
CREATE TABLE rehearsal_hint.sent (payload jsonb, event text, topic text, private boolean);

CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
RETURNS void
LANGUAGE sql
AS $$ INSERT INTO rehearsal_hint.sent VALUES (payload, event, topic, private) $$;

CREATE TABLE rehearsal_hint.turns AS SELECT * FROM public.chat_turn_runs WITH NO DATA;

-- Same definition as the production trigger.
CREATE TRIGGER trg_rehearsal_terminal_reconcile_hint
AFTER UPDATE OF status ON rehearsal_hint.turns
FOR EACH ROW
WHEN (
	OLD.status IS DISTINCT FROM NEW.status
	AND NEW.status IN ('completed', 'failed', 'cancelled')
	AND NEW.execution_mode = 'worker_realtime'
)
EXECUTE FUNCTION public.agentic_chat_send_terminal_reconcile_hint_v1();

INSERT INTO rehearsal_hint.turns (
	id, user_id, session_id, status, execution_mode, execution_generation,
	last_event_sequence, worker_lease_generation, worker_lease_renewed_at,
	transport_contract_version
) VALUES
	-- 1 queued, then Stop or the stranded timeout: no worker ever held it.
	('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'queued', 'worker_realtime', 0, 0, NULL, NULL,
	 'agentic_chat_worker_v1'),
	-- 2 live worker finalizing its own turn (renewed 5 s ago): it broadcasts itself.
	('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'running', 'worker_realtime', 1, 7, 1,
	 clock_timestamp() - interval '5 seconds', 'agentic_chat_worker_v1'),
	-- 3 dead-turn recovery (lease expired).
	('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'running', 'worker_realtime', 1, 7, 1,
	 clock_timestamp() - interval '120 seconds', 'agentic_chat_worker_v1'),
	-- 4 Stop on a silent worker (lease stale, 50 s).
	('00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'running', 'worker_realtime', 1, 7, 1,
	 clock_timestamp() - interval '50 seconds', 'agentic_chat_worker_v1'),
	-- 5 lease belongs to an older generation, nothing renewed for this one.
	('00000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'running', 'worker_realtime', 2, 9, 1,
	 clock_timestamp() - interval '5 seconds', 'agentic_chat_worker_v1'),
	-- 6 not a worker turn.
	('00000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'queued', 'legacy_stream', 0, 0, NULL, NULL,
	 NULL),
	-- 7 queued turn claimed by a worker (not terminal): no hint.
	('00000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001',
	 '20000000-0000-4000-8000-000000000001', 'queued', 'worker_realtime', 0, 0, NULL, NULL,
	 'agentic_chat_worker_v1');

UPDATE rehearsal_hint.turns
SET status = 'cancelled', last_event_sequence = last_event_sequence + 1
WHERE id = '00000000-0000-4000-8000-000000000001';
UPDATE rehearsal_hint.turns
SET status = 'completed', last_event_sequence = last_event_sequence + 1
WHERE id = '00000000-0000-4000-8000-000000000002';
UPDATE rehearsal_hint.turns
SET status = 'failed', last_event_sequence = last_event_sequence + 1
WHERE id = '00000000-0000-4000-8000-000000000003';
UPDATE rehearsal_hint.turns
SET status = 'cancelled', last_event_sequence = last_event_sequence + 1
WHERE id = '00000000-0000-4000-8000-000000000004';
UPDATE rehearsal_hint.turns
SET status = 'failed', last_event_sequence = last_event_sequence + 1
WHERE id = '00000000-0000-4000-8000-000000000005';
UPDATE rehearsal_hint.turns
SET status = 'cancelled', last_event_sequence = last_event_sequence + 1
WHERE id = '00000000-0000-4000-8000-000000000006';
UPDATE rehearsal_hint.turns
SET status = 'running', execution_generation = 1
WHERE id = '00000000-0000-4000-8000-000000000007';

DO $check$
DECLARE
	v_ids text[];
	v_first jsonb;
	v_row rehearsal_hint.sent%ROWTYPE;
BEGIN
	SELECT array_agg(payload->>'turn_run_id' ORDER BY payload->>'turn_run_id')
	INTO v_ids
	FROM rehearsal_hint.sent;
	IF v_ids IS DISTINCT FROM ARRAY[
		'00000000-0000-4000-8000-000000000001',
		'00000000-0000-4000-8000-000000000003',
		'00000000-0000-4000-8000-000000000004',
		'00000000-0000-4000-8000-000000000005'
	] THEN
		RAISE EXCEPTION 'terminal hint went to the wrong turns: %', v_ids;
	END IF;

	SELECT * INTO v_row FROM rehearsal_hint.sent
	WHERE payload->>'turn_run_id' = '00000000-0000-4000-8000-000000000001';
	IF v_row.event <> 'agent-stream-reconcile'
		OR v_row.topic <> 'chat-user:10000000-0000-4000-8000-000000000001'
		OR v_row.private IS NOT TRUE
		OR v_row.payload <> jsonb_build_object(
			'contract_version', 'agentic_chat_worker_v1',
			'turn_run_id', '00000000-0000-4000-8000-000000000001',
			'session_id', '20000000-0000-4000-8000-000000000001',
			'execution_generation', 0,
			'durable_through_sequence', 1
		) THEN
		RAISE EXCEPTION 'terminal hint has the wrong shape: % % % %',
			v_row.event, v_row.topic, v_row.private, v_row.payload;
	END IF;
END;
$check$;

-- A failing send never blocks the terminal write.
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
AS $$ BEGIN RAISE EXCEPTION 'realtime unavailable'; END; $$;

INSERT INTO rehearsal_hint.turns (
	id, user_id, session_id, status, execution_mode, execution_generation,
	last_event_sequence, transport_contract_version
) VALUES (
	'00000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000001', 'queued', 'worker_realtime', 0, 0,
	'agentic_chat_worker_v1'
);
UPDATE rehearsal_hint.turns
SET status = 'cancelled', last_event_sequence = 1
WHERE id = '00000000-0000-4000-8000-000000000008';

DO $check$
BEGIN
	IF (SELECT status FROM rehearsal_hint.turns
		WHERE id = '00000000-0000-4000-8000-000000000008') <> 'cancelled' THEN
		RAISE EXCEPTION 'a failed hint send blocked the terminal write';
	END IF;
	RAISE NOTICE 'terminal reconcile hint: all paths behave';
END;
$check$;

DROP SCHEMA rehearsal_hint CASCADE;
DROP FUNCTION realtime.send(jsonb, text, text, boolean);
