-- supabase/migrations/20260719020000_deep_research_orchestration.sql
-- Agent Runs: bounded durable orchestration state for deep research.
--
-- The first template is deliberately narrow: one depth-0 coordinator fans out
-- to at most two depth-1 read-only researchers, then resumes to synthesize.

ALTER TABLE public.agent_runs
	ADD COLUMN IF NOT EXISTS run_template TEXT NOT NULL DEFAULT 'agent';

ALTER TABLE public.agent_runs
	ADD COLUMN IF NOT EXISTS orchestration_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agent_runs
	DROP CONSTRAINT IF EXISTS agent_runs_template_check;

ALTER TABLE public.agent_runs
	ADD CONSTRAINT agent_runs_template_check
	CHECK (run_template IN ('agent', 'deep_research'));

ALTER TABLE public.agent_runs
	DROP CONSTRAINT IF EXISTS agent_runs_deep_research_root_shape;

ALTER TABLE public.agent_runs
	ADD CONSTRAINT agent_runs_deep_research_root_shape
	CHECK (
		run_template <> 'deep_research'
		OR (
			depth = 0
			AND parent_run_id IS NULL
			AND scope_mode = 'read_only'
			AND effort = 'deep'
			AND review_required = FALSE
			AND CASE
				WHEN jsonb_typeof(budgets) = 'object'
					AND jsonb_typeof(budgets->'max_cost_usd') = 'number'
					AND jsonb_typeof(budgets->'max_tool_calls') = 'number'
					AND jsonb_typeof(budgets->'max_tokens') = 'number'
					AND jsonb_typeof(budgets->'wall_clock_ms') = 'number'
				THEN
					(budgets->>'max_cost_usd')::NUMERIC BETWEEN 0.25 AND 1
					AND (budgets->>'max_tool_calls')::NUMERIC BETWEEN 4 AND 40
					AND (budgets->>'max_tool_calls')::NUMERIC
						= FLOOR((budgets->>'max_tool_calls')::NUMERIC)
					AND (budgets->>'max_tokens')::NUMERIC BETWEEN 12000 AND 100000
					AND (budgets->>'max_tokens')::NUMERIC
						= FLOOR((budgets->>'max_tokens')::NUMERIC)
					AND (budgets->>'wall_clock_ms')::NUMERIC BETWEEN 1 AND 1200000
					AND (budgets->>'wall_clock_ms')::NUMERIC
						= FLOOR((budgets->>'wall_clock_ms')::NUMERIC)
				ELSE FALSE
			END
		)
	);

COMMENT ON COLUMN public.agent_runs.run_template IS
	'Durable orchestration shape. agent is a single loop; deep_research is bounded plan/fan-out/synthesize.';

COMMENT ON COLUMN public.agent_runs.orchestration_state IS
	'Checkpointed state for durable multi-stage run templates.';

-- Defense in depth for research children. Application code constructs this
-- shape, while the parent row lock makes the two-child cap race-safe across
-- concurrent worker transactions.
CREATE OR REPLACE FUNCTION public.agent_run_validate_deep_research_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_parent public.agent_runs%ROWTYPE;
	v_existing_children INTEGER;
BEGIN
	IF NEW.parent_run_id IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT *
	INTO v_parent
	FROM public.agent_runs
	WHERE id = NEW.parent_run_id
	FOR UPDATE;

	IF NOT FOUND OR v_parent.run_template <> 'deep_research' THEN
		RETURN NEW;
	END IF;

	IF NEW.depth <> 1
		OR NEW.user_id <> v_parent.user_id
		OR NEW.context_type <> v_parent.context_type
		OR NEW.project_id IS DISTINCT FROM v_parent.project_id
		OR NEW.scope_mode <> 'read_only'
		OR NEW.effort <> 'standard'
		OR NEW.run_template <> 'agent'
		OR NEW.review_required
		OR NEW.parent_session_id IS NOT NULL
		OR NEW.parent_message_id IS NOT NULL
		OR NEW.allowed_ops IS NULL
		OR cardinality(NEW.allowed_ops) = 0
		OR NOT (
			NEW.allowed_ops
			<@ ARRAY['util.web.search', 'util.web.visit']::TEXT[]
		)
	THEN
		RAISE EXCEPTION 'Invalid deep-research child shape or permissions';
	END IF;

	IF jsonb_typeof(NEW.budgets) IS DISTINCT FROM 'object'
		OR jsonb_typeof(NEW.budgets->'max_cost_usd') IS DISTINCT FROM 'number'
		OR jsonb_typeof(NEW.budgets->'max_tool_calls') IS DISTINCT FROM 'number'
		OR jsonb_typeof(NEW.budgets->'max_tokens') IS DISTINCT FROM 'number'
		OR jsonb_typeof(NEW.budgets->'wall_clock_ms') IS DISTINCT FROM 'number'
	THEN
		RAISE EXCEPTION 'Invalid deep-research child budgets';
	END IF;

	IF (NEW.budgets->>'max_cost_usd')::NUMERIC <= 0
		OR (NEW.budgets->>'max_cost_usd')::NUMERIC
			> (v_parent.budgets->>'max_cost_usd')::NUMERIC / 2
		OR (NEW.budgets->>'max_tool_calls')::NUMERIC < 1
		OR (NEW.budgets->>'max_tool_calls')::NUMERIC
			<> FLOOR((NEW.budgets->>'max_tool_calls')::NUMERIC)
		OR (NEW.budgets->>'max_tool_calls')::NUMERIC
			> LEAST(5, FLOOR((v_parent.budgets->>'max_tool_calls')::NUMERIC / 2))
		OR (NEW.budgets->>'max_tokens')::NUMERIC < 1000
		OR (NEW.budgets->>'max_tokens')::NUMERIC
			<> FLOOR((NEW.budgets->>'max_tokens')::NUMERIC)
		OR (NEW.budgets->>'max_tokens')::NUMERIC
			> LEAST(
				20000,
				FLOOR(((v_parent.budgets->>'max_tokens')::NUMERIC - 10000) / 2)
			)
		OR (NEW.budgets->>'wall_clock_ms')::NUMERIC < 1
		OR (NEW.budgets->>'wall_clock_ms')::NUMERIC
			<> FLOOR((NEW.budgets->>'wall_clock_ms')::NUMERIC)
		OR (NEW.budgets->>'wall_clock_ms')::NUMERIC
			> LEAST(300000, (v_parent.budgets->>'wall_clock_ms')::NUMERIC)
	THEN
		RAISE EXCEPTION 'Deep-research child budgets exceed the parent envelope';
	END IF;

	IF TG_OP = 'INSERT' AND NEW.status <> 'queued' THEN
		RAISE EXCEPTION 'Deep-research children must be inserted as queued';
	END IF;

	SELECT COUNT(*)
	INTO v_existing_children
	FROM public.agent_runs
	WHERE parent_run_id = v_parent.id
		AND id <> NEW.id;

	IF v_existing_children >= 2 THEN
		RAISE EXCEPTION 'Deep-research coordinator already has two children';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_validate_deep_research_child ON public.agent_runs;
CREATE TRIGGER trg_agent_run_validate_deep_research_child
	BEFORE INSERT OR UPDATE OF
		parent_run_id,
		depth,
		user_id,
		context_type,
		project_id,
		scope_mode,
		effort,
		run_template,
		allowed_ops,
		review_required,
		parent_session_id,
		parent_message_id,
		budgets
	ON public.agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_validate_deep_research_child();

-- Reserve a user's three active Agent Run slots for one deep-research root and
-- its two children. The advisory transaction lock closes the race between a
-- normal dispatch and a deep-research dispatch for the same user.
CREATE OR REPLACE FUNCTION public.agent_run_enforce_deep_research_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_active_deep_root_id UUID;
	v_other_active_runs INTEGER;
BEGIN
	IF NEW.status NOT IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready') THEN
		RETURN NEW;
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 0));

	IF NEW.run_template = 'deep_research' AND NEW.depth = 0 THEN
		-- A coordinator remains active while its children run. Its synthesis
		-- continuation re-claims the same row with running -> running, and
		-- pause/resume is active -> active as well. Those are not new capacity
		-- reservations and must not count the coordinator's own children as
		-- conflicting work.
		IF TG_OP = 'UPDATE'
			AND OLD.user_id = NEW.user_id
			AND OLD.run_template = 'deep_research'
			AND OLD.depth = 0
			AND OLD.status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready')
		THEN
			RETURN NEW;
		END IF;

		SELECT COUNT(*)
		INTO v_other_active_runs
		FROM public.agent_runs
		WHERE user_id = NEW.user_id
			AND id <> NEW.id
			AND status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready');

		IF v_other_active_runs > 0 THEN
			RAISE EXCEPTION 'Deep research requires all three Agent Run slots';
		END IF;
		RETURN NEW;
	END IF;

	SELECT id
	INTO v_active_deep_root_id
	FROM public.agent_runs
	WHERE user_id = NEW.user_id
		AND id <> NEW.id
		AND run_template = 'deep_research'
		AND depth = 0
		AND status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready')
	ORDER BY created_at
	LIMIT 1;

	IF v_active_deep_root_id IS NOT NULL
		AND NEW.parent_run_id IS DISTINCT FROM v_active_deep_root_id
	THEN
		RAISE EXCEPTION 'Agent Run slots are reserved by active deep research';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_enforce_deep_research_capacity ON public.agent_runs;
CREATE TRIGGER trg_agent_run_enforce_deep_research_capacity
	BEFORE INSERT OR UPDATE OF
		status,
		user_id,
		parent_run_id,
		run_template,
		depth
	ON public.agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_enforce_deep_research_capacity();

-- Atomically claim a coordinator whose children have all settled and enqueue
-- its synthesis continuation. If queue insertion fails, the stage update rolls
-- back with the transaction, so a later reconciliation attempt can retry.
CREATE OR REPLACE FUNCTION public.queue_deep_research_synthesis(
	p_parent_run_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_parent public.agent_runs%ROWTYPE;
	v_job_id UUID;
BEGIN
	SELECT *
	INTO v_parent
	FROM public.agent_runs
	WHERE id = p_parent_run_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_parent.run_template <> 'deep_research'
		OR v_parent.depth <> 0
		OR v_parent.status <> 'running'
		OR v_parent.orchestration_state->>'stage' <> 'researching'
	THEN
		RETURN NULL;
	END IF;

	IF jsonb_typeof(v_parent.orchestration_state->'child_run_ids') <> 'array'
		OR jsonb_array_length(v_parent.orchestration_state->'child_run_ids') <> 2
		OR (
			SELECT COUNT(*)
			FROM public.agent_runs
			WHERE parent_run_id = v_parent.id
		) <> 2
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(
				v_parent.orchestration_state->'child_run_ids'
			) AS expected(child_id)
			WHERE NOT EXISTS (
				SELECT 1
				FROM public.agent_runs child
				WHERE child.parent_run_id = v_parent.id
					AND child.id::TEXT = expected.child_id
			)
		)
		OR EXISTS (
		SELECT 1
		FROM public.agent_runs
		WHERE parent_run_id = v_parent.id
			AND status NOT IN ('completed', 'partial', 'failed', 'cancelled')
	) THEN
		RETURN NULL;
	END IF;

	UPDATE public.agent_runs
	SET orchestration_state = jsonb_set(
		v_parent.orchestration_state,
		'{stage}',
		'"synthesis_queued"'::jsonb,
		FALSE
	)
	WHERE id = v_parent.id;

	v_job_id := public.add_queue_job(
		p_user_id => v_parent.user_id,
		p_job_type => 'agent_run',
		p_metadata => jsonb_build_object(
			'run_id', v_parent.id,
			'trigger', v_parent.trigger::TEXT,
			'context_type', v_parent.context_type,
			'project_id', v_parent.project_id,
			'parent_run_id', NULL,
			'depth', 0,
			'continuation_from', 'children',
			'scope_mode', 'read_only',
			'effort', 'deep',
			'run_template', 'deep_research',
			'allowed_ops', NULL,
			'review_required', FALSE,
			'budgets', v_parent.budgets
		),
		p_priority => 7,
		p_scheduled_for => NOW(),
		p_dedup_key => format('agent-run:%s:synthesis', v_parent.id)
	);

	RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_deep_research_synthesis(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_deep_research_synthesis(UUID) TO service_role;

-- Wake the coordinator in the same transaction that settles the final child.
-- This closes the crash window between a child status update and application-
-- level resume logic; the worker's explicit RPC remains a harmless backstop.
CREATE OR REPLACE FUNCTION public.agent_run_wake_deep_research_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF NEW.parent_run_id IS NOT NULL
		AND NEW.status IN ('completed', 'partial', 'failed', 'cancelled')
		AND NEW.status IS DISTINCT FROM OLD.status
	THEN
		PERFORM public.queue_deep_research_synthesis(NEW.parent_run_id);
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_wake_deep_research_parent ON public.agent_runs;
CREATE TRIGGER trg_agent_run_wake_deep_research_parent
	AFTER UPDATE OF status ON public.agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_wake_deep_research_parent();

-- A very fast or queue-failed child can settle while the coordinator is still
-- checkpointed as `dispatching`. Re-check when the coordinator enters
-- `researching` so that transition cannot strand an already-settled fan-out.
CREATE OR REPLACE FUNCTION public.agent_run_wake_deep_research_on_researching()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF NEW.run_template = 'deep_research'
		AND NEW.orchestration_state->>'stage' = 'researching'
		AND OLD.orchestration_state->>'stage' IS DISTINCT FROM 'researching'
	THEN
		PERFORM public.queue_deep_research_synthesis(NEW.id);
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_wake_deep_research_on_researching ON public.agent_runs;
CREATE TRIGGER trg_agent_run_wake_deep_research_on_researching
	AFTER UPDATE OF orchestration_state ON public.agent_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_wake_deep_research_on_researching();
