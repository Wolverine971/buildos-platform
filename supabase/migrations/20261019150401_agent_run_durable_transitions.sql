-- supabase/migrations/20261019150401_agent_run_durable_transitions.sql
-- Worker checkpoints, control acknowledgement and chat delivery share one commit.
-- Existing proposal rows, change-set approval, and cost-ledger tables are unchanged.
-- Apply before deploying the worker that calls checkpoint_agent_run_execution.
-- Rehearse with: pnpm db:rehearse <this file> --check
--   supabase/tests/agent_run_durable_transitions.check.sql --role-probe
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.checkpoint_agent_run_execution(
  p_run_id uuid,
  p_execution_generation integer,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_signal_ids uuid[] DEFAULT '{}'::uuid[],
  p_completion_content text DEFAULT NULL,
  p_execution jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_status public.agent_run_status;
  v_key text;
BEGIN
  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.execution_generation IS DISTINCT FROM p_execution_generation
     OR v_run.status <> 'running' OR v_run.commit_started_at IS NOT NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k
       WHERE k NOT IN ('status','result','metrics','change_set','completed_at')) THEN
    RAISE EXCEPTION 'Invalid Agent Run checkpoint patch';
  END IF;
  v_status := COALESCE((p_patch->>'status')::public.agent_run_status, v_run.status);
  IF v_status NOT IN ('running','paused','completed','partial','failed','cancelled','needs_input','proposal_ready') THEN
    RAISE EXCEPTION 'Invalid Agent Run checkpoint status';
  END IF;
  IF p_completion_content IS NOT NULL AND v_status IN ('running','paused') THEN
    RAISE EXCEPTION 'Completion requires a settled Agent Run outcome';
  END IF;

  -- Acknowledged steering is replayable even if the process dies immediately.
  INSERT INTO public.agent_run_events (run_id, event_type, payload)
    SELECT p_run_id, 'run.steer', payload FROM public.agent_run_signals
    WHERE run_id = p_run_id AND id = ANY(p_signal_ids)
      AND consumed_at IS NULL AND kind = 'steer';

  UPDATE public.agent_runs SET
    status = v_status,
    result = CASE WHEN p_patch ? 'result' THEN p_patch->'result' ELSE result END,
    metrics = CASE WHEN p_patch ? 'metrics' THEN p_patch->'metrics' ELSE metrics END,
    change_set = CASE WHEN p_patch ? 'change_set' THEN NULLIF(p_patch->'change_set','null'::jsonb) ELSE change_set END,
    completed_at = CASE WHEN p_patch ? 'completed_at' THEN (p_patch->>'completed_at')::timestamptz ELSE completed_at END
  WHERE id = p_run_id;

  IF p_execution IS NOT NULL THEN
    INSERT INTO public.agent_tool_executions (
      agent_run_id, user_id, tool_name, gateway_op, tool_category, arguments,
      result, success, error_message, mutation_mode, proposed_change_id,
      entity_kind, entity_id, execution_time_ms
    ) VALUES (
      p_run_id, v_run.user_id, p_execution->>'op', p_execution->>'op',
      p_execution->>'tool_category', p_execution->'arguments',
      p_execution->'result', (p_execution->>'success')::boolean,
      p_execution->>'error_message', p_execution->>'mutation_mode',
      (p_execution->>'proposed_change_id')::uuid, p_execution->>'entity_kind',
      (p_execution->>'entity_id')::uuid, (p_execution->>'execution_time_ms')::integer
    );
  END IF;

  IF p_completion_content IS NOT NULL AND v_run.parent_session_id IS NOT NULL THEN
    v_key := 'agent-run:' || p_run_id || ':completion:' || p_execution_generation;
    INSERT INTO public.chat_messages (session_id, user_id, role, content, message_type, metadata)
    VALUES (v_run.parent_session_id, v_run.user_id, 'assistant', p_completion_content,
      'assistant_message', jsonb_build_object(
        'agent_run_id', p_run_id, 'source', 'agent_run', 'run_status', v_status,
        'parent_message_id', v_run.parent_message_id, 'idempotency_key', v_key,
        'execution_generation', p_execution_generation));
  END IF;

  UPDATE public.agent_run_signals SET consumed_at = clock_timestamp()
    WHERE run_id = p_run_id AND id = ANY(p_signal_ids) AND consumed_at IS NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_agent_run_execution(uuid, integer, jsonb, uuid[], text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_agent_run_execution(uuid, integer, jsonb, uuid[], text, jsonb)
  TO service_role;

-- Historical research rows remain readable; nothing can wake a retired tree.
DROP TRIGGER IF EXISTS trg_agent_run_wake_deep_research_parent ON public.agent_runs;
DROP TRIGGER IF EXISTS trg_agent_run_wake_deep_research_on_researching ON public.agent_runs;
DROP FUNCTION IF EXISTS public.agent_run_wake_deep_research_parent();
DROP FUNCTION IF EXISTS public.agent_run_wake_deep_research_on_researching();
DROP FUNCTION IF EXISTS public.queue_deep_research_synthesis(uuid);
DROP TRIGGER IF EXISTS trg_agent_run_validate_deep_research_child ON public.agent_runs;
DROP TRIGGER IF EXISTS trg_agent_run_enforce_deep_research_capacity ON public.agent_runs;
DROP FUNCTION IF EXISTS public.agent_run_validate_deep_research_child();
DROP FUNCTION IF EXISTS public.agent_run_enforce_deep_research_capacity();

-- The retired trigger also owned ordinary admission. Keep that invariant:
-- dispatch's friendly pre-check alone cannot stop two concurrent requests.
CREATE OR REPLACE FUNCTION public.agent_run_enforce_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.depth <> 0
     OR NEW.status NOT IN ('queued','running','paused','needs_input','proposal_ready') THEN
    RETURN NEW;
  END IF;
  -- An active worker or approval changes state without reserving another slot.
  IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id AND OLD.depth = 0
     AND OLD.status IN ('queued','running','paused','needs_input','proposal_ready') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  IF (SELECT count(*) FROM public.agent_runs
      WHERE user_id = NEW.user_id AND id <> NEW.id AND depth = 0
        AND status IN ('queued','running','paused','needs_input','proposal_ready')) >= 3 THEN
    RAISE EXCEPTION 'agent_run_limit_exceeded: user already has 3 active agent runs';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_run_enforce_capacity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_run_enforce_capacity() TO service_role;
CREATE TRIGGER trg_agent_run_enforce_capacity BEFORE INSERT OR UPDATE OF status, user_id, depth ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.agent_run_enforce_capacity();

CREATE OR REPLACE FUNCTION public.agent_run_reject_retired_research()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.run_template = 'deep_research'
     OR NEW.orchestration_state->>'role' = 'deep_research_child'
     OR EXISTS (SELECT 1 FROM public.agent_runs WHERE id = NEW.parent_run_id AND run_template = 'deep_research') THEN
    RAISE EXCEPTION 'deep_research_retired';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_run_reject_retired_research() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_run_reject_retired_research() TO service_role;
CREATE TRIGGER trg_agent_run_reject_retired_research BEFORE INSERT ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.agent_run_reject_retired_research();
COMMIT;
