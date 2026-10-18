-- supabase/migrations/20261018180000_agentic_chat_terminal_reconcile_hint.sql
--
-- Tell the browser at once when a chat turn ends without a live worker.
--
-- A live worker broadcasts its own terminal event after finalize commits
-- (stream-publisher.ts publishTerminal). Three paths end a turn with no worker
-- to broadcast, so an open tab only learned the outcome from its 2-5 s
-- re-check (agentic chat teardown 2026-10-18, finding "Recovery outcomes never
-- reach the browser live"):
--   * Stop pressed while the turn is still queued (request_agentic_chat_turn_cancel)
--   * the 10-minute never-claimed timeout (reap_stranded_queued_agentic_chat_turns)
--   * dead-turn recovery, including Stop on a turn whose worker went silent
--     (agentic_chat_finalize_dead_turn_v1)
-- All of them, like the worker, end in finalize_agentic_chat_turn, which writes
-- the terminal 'done' event and moves status in one statement. This trigger
-- sends the existing reconcile hint ('agent-stream-reconcile') on the private
-- channel chat-user:<user_id> for those turns, so the browser reads durable
-- truth right away. The hint carries only ids and sequence numbers.
--
-- A turn whose current generation still holds a fresh lease is being finalized
-- by its live worker, which broadcasts the terminal event itself; it gets no
-- hint, so normal replies never pay an extra reconcile read. Recovery may only
-- finalize a turn whose lease is stale or expired (agentic_chat_finalize_dead_
-- turn_v1), and a queued turn never had a worker, so the rule is exact on both
-- sides. In 14 days of production every completed worker turn finished at most
-- 15 s after its last renewal (stale is 45 s).
--
-- realtime.send writes realtime.messages inside this transaction, so the hint
-- goes out only if finalize commits. A failed send never blocks finalize: the
-- browser's re-check timer stays the fallback. The existing policy
-- agentic_chat_realtime_messages_select (20260802036000) already limits each
-- chat-user topic to its owner.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.agentic_chat_send_terminal_reconcile_hint_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_worker_live boolean;
BEGIN
	-- Same lease reading as recovery uses; a live worker reads 'held'.
	v_worker_live := OLD.status = 'running'
		AND NEW.worker_lease_generation IS NOT DISTINCT FROM NEW.execution_generation
		AND NEW.worker_lease_renewed_at IS NOT NULL
		AND public.agentic_chat_turn_lease_state_v1(
			'running',
			NEW.execution_generation,
			NEW.worker_lease_generation,
			NEW.worker_lease_renewed_at,
			NULL,
			clock_timestamp()
		) = 'held';
	IF v_worker_live THEN
		RETURN NULL;
	END IF;

	BEGIN
		PERFORM realtime.send(
			jsonb_build_object(
				'contract_version', COALESCE(NEW.transport_contract_version, 'agentic_chat_worker_v1'),
				'turn_run_id', NEW.id,
				'session_id', NEW.session_id,
				'execution_generation', NEW.execution_generation,
				'durable_through_sequence', NEW.last_event_sequence
			),
			'agent-stream-reconcile',
			'chat-user:' || NEW.user_id::text,
			true
		);
	EXCEPTION
		WHEN OTHERS THEN
			RAISE WARNING 'agentic_chat_terminal_reconcile_hint_failed turn=% sqlstate=% message=%',
				NEW.id, SQLSTATE, SQLERRM;
	END;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.agentic_chat_send_terminal_reconcile_hint_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agentic_chat_send_terminal_reconcile_hint_v1()
	FROM anon, authenticated;

COMMENT ON FUNCTION public.agentic_chat_send_terminal_reconcile_hint_v1() IS
	'Sends the agent-stream-reconcile hint to chat-user:<user_id> when a worker turn ends without a live worker (queued Stop, stranded timeout, dead-turn recovery).';

DROP TRIGGER IF EXISTS trg_chat_turn_runs_terminal_reconcile_hint ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_terminal_reconcile_hint
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (
	OLD.status IS DISTINCT FROM NEW.status
	AND NEW.status IN ('completed', 'failed', 'cancelled')
	AND NEW.execution_mode = 'worker_realtime'
)
EXECUTE FUNCTION public.agentic_chat_send_terminal_reconcile_hint_v1();

COMMENT ON TRIGGER trg_chat_turn_runs_terminal_reconcile_hint ON public.chat_turn_runs IS
	'A turn that ends with no live worker to broadcast it sends the browser a reconcile hint.';

COMMIT;
