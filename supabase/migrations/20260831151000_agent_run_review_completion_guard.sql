-- supabase/migrations/20260831151000_agent_run_review_completion_guard.sql
-- Fail closed at the durable boundary when a review-required write run claims
-- completion without a non-empty staged Change Set.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_agent_run_review_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_original_result jsonb := COALESCE(NEW.result, '{}'::jsonb);
	v_has_changes boolean;
BEGIN
	v_has_changes := CASE
		WHEN jsonb_typeof(NEW.change_set) IS DISTINCT FROM 'object' THEN false
		WHEN jsonb_typeof(NEW.change_set->'changes') IS DISTINCT FROM 'array' THEN false
		ELSE jsonb_array_length(NEW.change_set->'changes') > 0
	END;

	IF NEW.review_required
		AND NEW.scope_mode = 'read_write'
		AND NEW.status = 'completed'
		AND NOT v_has_changes
	THEN
		NEW.status := 'partial';
		NEW.error := COALESCE(NEW.error, 'review_run_no_proposed_changes');
		NEW.result := v_original_result || jsonb_build_object(
			'reported_answer', COALESCE(
				v_original_result->'reported_answer',
				v_original_result->'answer',
				'null'::jsonb
			),
			'summary',
				'No durable review proposal was created because the agent did not call any staged write operations.',
			'answer',
				'The run analyzed the request but did not stage a reviewable change set. Retry after ensuring every proposed entity change is expressed through its write operation.',
			'error', 'review_run_no_proposed_changes'
		);
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agent_run_review_completion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_agent_run_review_completion() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_agent_run_review_completion() TO service_role;

DROP TRIGGER IF EXISTS trg_agent_run_review_completion_guard ON public.agent_runs;
CREATE TRIGGER trg_agent_run_review_completion_guard
	BEFORE INSERT OR UPDATE OF status, review_required, scope_mode, change_set
	ON public.agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_agent_run_review_completion();

COMMENT ON FUNCTION public.enforce_agent_run_review_completion() IS
	'Converts invalid completed review-required write runs without staged changes into explicit partial failures.';
COMMENT ON TRIGGER trg_agent_run_review_completion_guard ON public.agent_runs IS
	'Prevents completed review runs from bypassing the durable Change Set contract.';

COMMIT;
