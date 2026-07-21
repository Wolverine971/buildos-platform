-- supabase/migrations/20260720010000_deep_research_hardening.sql
-- Hardening fixes from the 2026-07-20 deep-research audit
-- (apps/web/docs/technical/audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md):
--
-- 1. queue_deep_research_synthesis was missed by the 20260719050000 privilege
--    fence and is executable by anon/authenticated via Supabase's direct
--    function grants (verified live). Revoke it.
-- 2. The synthesis guard failed OPEN when orchestration_state has no stage key
--    (NULL three-valued logic), and jsonb_set(..., create_missing => FALSE)
--    silently never wrote the synthesis_queued checkpoint. Fail closed and
--    write the checkpoint.
-- 3. Ledger idempotency comparisons matched 8dp-rounded stored values against
--    unrounded parameters, so byte-identical retries raised conflicts. Round
--    parameters to column scale first.
-- 4. A later NULL-actual reconciliation_required settle could wipe recorded
--    overrun actuals, silently shrinking exposure. Preserve known actuals.
-- 5. reserve_agent_run_cost locked root then leaf while the child-settle wake
--    trigger locks child then root — a reproducible deadlock. The root lock
--    already serializes the tree; stop locking the leaf row.
-- 6. The wake trigger called the synthesis RPC (which locks the parent) for
--    EVERY parented run. Pre-check the parent template without locking.
-- 7. The capacity trigger took the per-user advisory lock before its
--    coordinator self-transition early-return, inverting lock order against
--    child inserts. Hoist the early-return.
-- 8. Ledger FKs cascaded run deletion into money-record deletion (and prod's
--    parent_run_id ON DELETE SET NULL could orphan children into fresh-budget
--    self-roots). Restrict deletion instead.

-- ---------------------------------------------------------------------------
-- (8) Money records must outlive runs.

ALTER TABLE public.agent_run_cost_entries
	DROP CONSTRAINT agent_run_cost_entries_root_run_id_fkey,
	DROP CONSTRAINT agent_run_cost_entries_leaf_run_id_fkey;

ALTER TABLE public.agent_run_cost_entries
	ADD CONSTRAINT agent_run_cost_entries_root_run_id_fkey
		FOREIGN KEY (root_run_id) REFERENCES public.agent_runs(id) ON DELETE RESTRICT,
	ADD CONSTRAINT agent_run_cost_entries_leaf_run_id_fkey
		FOREIGN KEY (leaf_run_id) REFERENCES public.agent_runs(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- (2) Fail-closed synthesis guard + written checkpoint. (1) is applied at the
-- bottom with the other grants.

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
		-- IS DISTINCT FROM: a missing stage key must fail closed, not open.
		OR (v_parent.orchestration_state->>'stage') IS DISTINCT FROM 'researching'
	THEN
		RETURN NULL;
	END IF;

	IF jsonb_typeof(v_parent.orchestration_state->'child_run_ids') IS DISTINCT FROM 'array'
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
		TRUE
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

-- ---------------------------------------------------------------------------
-- (6) Wake trigger: never call the parent-locking RPC for non-deep-research
-- trees. The template read takes no row lock, so the child-settle transaction
-- no longer acquires child-then-root order for ordinary agent trees.

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
		AND EXISTS (
			SELECT 1
			FROM public.agent_runs parent
			WHERE parent.id = NEW.parent_run_id
				AND parent.run_template = 'deep_research'
				AND parent.depth = 0
		)
	THEN
		PERFORM public.queue_deep_research_synthesis(NEW.parent_run_id);
	END IF;
	RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- (7) Capacity trigger: the coordinator self-transition early-return must not
-- wait on the advisory lock, or a root UPDATE (row lock held, advisory wanted)
-- deadlocks against a child INSERT (advisory held, parent row wanted).

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

	-- A coordinator remains active while its children run. Its synthesis
	-- continuation re-claims the same row with running -> running, and
	-- pause/resume is active -> active as well. Those are not new capacity
	-- reservations; return before the advisory lock.
	IF TG_OP = 'UPDATE'
		AND NEW.run_template = 'deep_research'
		AND NEW.depth = 0
		AND OLD.user_id = NEW.user_id
		AND OLD.run_template = 'deep_research'
		AND OLD.depth = 0
		AND OLD.status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready')
	THEN
		RETURN NEW;
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 0));

	IF NEW.run_template = 'deep_research' AND NEW.depth = 0 THEN
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

-- ---------------------------------------------------------------------------
-- (3) + (5) Reservation: round money parameters to column scale before the
-- idempotency comparison, and hold only the root lock. The root lock already
-- serializes every reservation in the tree; leaf budget columns are static
-- after dispatch, so a plain re-read after acquiring the root lock suffices
-- and removes the reserve(root->leaf) half of the deadlock pair.

CREATE OR REPLACE FUNCTION public.reserve_agent_run_cost(
	p_leaf_run_id UUID,
	p_attempt_key TEXT,
	p_provider TEXT,
	p_operation TEXT,
	p_resource TEXT,
	p_reserved_cost_usd NUMERIC,
	p_reserved_units NUMERIC DEFAULT NULL,
	p_unit_type TEXT DEFAULT NULL,
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_leaf public.agent_runs%ROWTYPE;
	v_root public.agent_runs%ROWTYPE;
	v_entry public.agent_run_cost_entries%ROWTYPE;
	v_root_id UUID;
	v_root_budget NUMERIC;
	v_leaf_budget NUMERIC;
	v_root_exposure NUMERIC;
	v_leaf_exposure NUMERIC;
BEGIN
	IF p_attempt_key IS NULL OR char_length(btrim(p_attempt_key)) NOT BETWEEN 1 AND 200
		OR p_provider IS NULL OR char_length(btrim(p_provider)) NOT BETWEEN 1 AND 80
		OR p_operation IS NULL OR char_length(btrim(p_operation)) NOT BETWEEN 1 AND 160
		OR p_resource IS NULL OR char_length(btrim(p_resource)) NOT BETWEEN 1 AND 300
		OR p_reserved_cost_usd IS NULL OR p_reserved_cost_usd <= 0
		OR p_reserved_cost_usd::TEXT IN ('NaN', 'Infinity', '-Infinity')
		OR (
			p_reserved_units IS NOT NULL
			AND (
				p_reserved_units < 0
				OR p_reserved_units::TEXT IN ('NaN', 'Infinity', '-Infinity')
			)
		)
		OR COALESCE(jsonb_typeof(p_metadata), 'null') <> 'object'
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_RESERVATION';
	END IF;

	-- Column scale is NUMERIC(14,8) / NUMERIC(20,4). Comparing unrounded
	-- parameters against rounded stored values made identical retries conflict.
	p_reserved_cost_usd := ROUND(p_reserved_cost_usd, 8);
	p_reserved_units := ROUND(p_reserved_units, 4);

	IF p_reserved_cost_usd <= 0 THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_RESERVATION';
	END IF;

	-- Read once to determine the lock root, then lock only the root. Every
	-- reservation in a research tree therefore serializes on the same row.
	SELECT *
	INTO v_leaf
	FROM public.agent_runs
	WHERE id = p_leaf_run_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_LEAF_NOT_FOUND';
	END IF;

	v_root_id := COALESCE(v_leaf.parent_run_id, v_leaf.id);

	SELECT *
	INTO v_root
	FROM public.agent_runs
	WHERE id = v_root_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_ROOT_NOT_FOUND';
	END IF;

	IF v_leaf.id <> v_root.id THEN
		-- Refresh leaf values now that the tree is serialized; no leaf lock.
		SELECT *
		INTO v_leaf
		FROM public.agent_runs
		WHERE id = p_leaf_run_id;
	END IF;

	IF v_leaf.user_id <> v_root.user_id
		OR (v_leaf.id <> v_root.id AND v_leaf.parent_run_id IS DISTINCT FROM v_root.id)
		OR v_leaf.status <> 'running'
		OR v_root.status <> 'running'
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_RUN_STATE';
	END IF;

	IF jsonb_typeof(v_root.budgets->'max_cost_usd') IS DISTINCT FROM 'number'
		OR jsonb_typeof(v_leaf.budgets->'max_cost_usd') IS DISTINCT FROM 'number'
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_BUDGET_REQUIRED';
	END IF;

	v_root_budget := (v_root.budgets->>'max_cost_usd')::NUMERIC;
	v_leaf_budget := (v_leaf.budgets->>'max_cost_usd')::NUMERIC;
	IF v_root_budget <= 0 OR v_leaf_budget <= 0 THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_BUDGET_REQUIRED';
	END IF;

	SELECT *
	INTO v_entry
	FROM public.agent_run_cost_entries
	WHERE leaf_run_id = p_leaf_run_id
		AND attempt_key = btrim(p_attempt_key);

	IF FOUND THEN
		IF v_entry.provider <> btrim(p_provider)
			OR v_entry.operation <> btrim(p_operation)
			OR v_entry.resource <> btrim(p_resource)
			OR v_entry.reserved_cost_usd <> p_reserved_cost_usd
			OR v_entry.reserved_units IS DISTINCT FROM p_reserved_units
			OR v_entry.unit_type IS DISTINCT FROM NULLIF(btrim(p_unit_type), '')
		THEN
			RAISE EXCEPTION 'AGENT_RUN_COST_IDEMPOTENCY_CONFLICT';
		END IF;
		RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', TRUE);
	END IF;

	SELECT COALESCE(
		SUM(
			CASE status
				WHEN 'settled' THEN COALESCE(actual_cost_usd, reserved_cost_usd)
				WHEN 'released' THEN 0
				WHEN 'reconciliation_required'
					THEN GREATEST(reserved_cost_usd, COALESCE(actual_cost_usd, reserved_cost_usd))
				ELSE reserved_cost_usd
			END
		),
		0
	)
	INTO v_root_exposure
	FROM public.agent_run_cost_entries
	WHERE root_run_id = v_root.id;

	SELECT COALESCE(
		SUM(
			CASE status
				WHEN 'settled' THEN COALESCE(actual_cost_usd, reserved_cost_usd)
				WHEN 'released' THEN 0
				WHEN 'reconciliation_required'
					THEN GREATEST(reserved_cost_usd, COALESCE(actual_cost_usd, reserved_cost_usd))
				ELSE reserved_cost_usd
			END
		),
		0
	)
	INTO v_leaf_exposure
	FROM public.agent_run_cost_entries
	WHERE leaf_run_id = v_leaf.id;

	IF v_root_exposure + p_reserved_cost_usd > v_root_budget + 0.00000001
		OR v_leaf_exposure + p_reserved_cost_usd > v_leaf_budget + 0.00000001
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_BUDGET_EXCEEDED';
	END IF;

	PERFORM set_config('app.agent_run_cost_rpc', 'on', TRUE);
	INSERT INTO public.agent_run_cost_entries (
		root_run_id,
		leaf_run_id,
		attempt_key,
		provider,
		operation,
		resource,
		reserved_units,
		unit_type,
		reserved_cost_usd,
		metadata
	) VALUES (
		v_root.id,
		v_leaf.id,
		btrim(p_attempt_key),
		btrim(p_provider),
		btrim(p_operation),
		btrim(p_resource),
		p_reserved_units,
		NULLIF(btrim(p_unit_type), ''),
		p_reserved_cost_usd,
		p_metadata
	)
	RETURNING * INTO v_entry;

	RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', FALSE);
END;
$$;

-- ---------------------------------------------------------------------------
-- (3) + (4) Settlement: round money parameters, and never let a NULL-actual
-- re-settle erase a recorded actual (exposure must not silently shrink).

CREATE OR REPLACE FUNCTION public.settle_agent_run_cost(
	p_leaf_run_id UUID,
	p_attempt_key TEXT,
	p_terminal_status TEXT,
	p_actual_cost_usd NUMERIC DEFAULT NULL,
	p_actual_units NUMERIC DEFAULT NULL,
	p_provider_request_id TEXT DEFAULT NULL,
	p_metadata JSONB DEFAULT '{}'::jsonb,
	p_allow_overrun BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_entry public.agent_run_cost_entries%ROWTYPE;
	v_root_id UUID;
	v_next_status TEXT;
	v_actual_cost NUMERIC;
	v_settled_at TIMESTAMPTZ;
BEGIN
	IF p_terminal_status IS NULL
		OR p_terminal_status NOT IN ('settled', 'released', 'reconciliation_required')
		OR (
			p_actual_cost_usd IS NOT NULL
			AND (
				p_actual_cost_usd < 0
				OR p_actual_cost_usd::TEXT IN ('NaN', 'Infinity', '-Infinity')
			)
		)
		OR (
			p_actual_units IS NOT NULL
			AND (
				p_actual_units < 0
				OR p_actual_units::TEXT IN ('NaN', 'Infinity', '-Infinity')
			)
		)
		OR char_length(COALESCE(p_provider_request_id, '')) > 300
		OR COALESCE(jsonb_typeof(p_metadata), 'null') <> 'object'
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_SETTLEMENT';
	END IF;

	p_actual_cost_usd := ROUND(p_actual_cost_usd, 8);
	p_actual_units := ROUND(p_actual_units, 4);

	-- Match reservation's root-first lock order so exposure cannot be summed
	-- while a sibling settlement is changing the same tree.
	SELECT root_run_id
	INTO v_root_id
	FROM public.agent_run_cost_entries
	WHERE leaf_run_id = p_leaf_run_id
		AND attempt_key = btrim(p_attempt_key);

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RESERVATION_NOT_FOUND';
	END IF;

	PERFORM 1
	FROM public.agent_runs
	WHERE id = v_root_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_ROOT_NOT_FOUND';
	END IF;

	SELECT *
	INTO v_entry
	FROM public.agent_run_cost_entries
	WHERE leaf_run_id = p_leaf_run_id
		AND attempt_key = btrim(p_attempt_key)
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RESERVATION_NOT_FOUND';
	END IF;

	IF v_entry.provider_request_id IS NOT NULL
		AND NULLIF(btrim(p_provider_request_id), '') IS NOT NULL
		AND v_entry.provider_request_id <> btrim(p_provider_request_id)
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_PROVIDER_REQUEST_CONFLICT';
	END IF;

	IF p_terminal_status = 'settled' AND p_actual_cost_usd IS NULL THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_ACTUAL_COST_REQUIRED';
	END IF;

	v_actual_cost := CASE
		WHEN p_terminal_status = 'released' THEN 0
		ELSE p_actual_cost_usd
	END;
	v_next_status := p_terminal_status;

	-- An observed overrun is recorded rather than rejected—the money may
	-- already have been spent—but remains visibly unresolved for operators.
	IF p_terminal_status = 'settled'
		AND v_actual_cost > v_entry.reserved_cost_usd + 0.00000001
		AND NOT COALESCE(p_allow_overrun, FALSE)
	THEN
		v_next_status := 'reconciliation_required';
	END IF;

	IF v_entry.status IN ('settled', 'released') THEN
		IF v_entry.status = v_next_status
			AND v_entry.actual_cost_usd IS NOT DISTINCT FROM v_actual_cost
			AND v_entry.actual_units IS NOT DISTINCT FROM p_actual_units
			AND v_entry.provider_request_id IS NOT DISTINCT FROM
				COALESCE(NULLIF(btrim(p_provider_request_id), ''), v_entry.provider_request_id)
		THEN
			RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', TRUE);
		END IF;
		RAISE EXCEPTION 'AGENT_RUN_COST_TERMINAL_CONFLICT';
	END IF;

	IF v_entry.status = 'reconciliation_required'
		AND v_next_status = 'reconciliation_required'
		AND (
			v_actual_cost IS NULL
			OR v_entry.actual_cost_usd IS NOT DISTINCT FROM v_actual_cost
		)
		AND (
			p_actual_units IS NULL
			OR v_entry.actual_units IS NOT DISTINCT FROM p_actual_units
		)
	THEN
		RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', TRUE);
	END IF;

	v_settled_at := CASE
		WHEN v_next_status IN ('settled', 'released') THEN NOW()
		ELSE v_entry.settled_at
	END;

	PERFORM set_config('app.agent_run_cost_rpc', 'on', TRUE);
	UPDATE public.agent_run_cost_entries
	SET
		status = v_next_status,
		-- Known actuals are never erased by a later uncertain settle.
		actual_cost_usd = COALESCE(v_actual_cost, actual_cost_usd),
		actual_units = COALESCE(p_actual_units, actual_units),
		provider_request_id = COALESCE(
			NULLIF(btrim(p_provider_request_id), ''),
			provider_request_id
		),
		metadata = metadata || p_metadata || jsonb_build_object(
			'reservation_overrun',
			COALESCE(v_actual_cost, actual_cost_usd) IS NOT NULL
				AND COALESCE(v_actual_cost, actual_cost_usd)
					> reserved_cost_usd + 0.00000001
		),
		settled_at = v_settled_at,
		updated_at = NOW()
	WHERE id = v_entry.id
	RETURNING * INTO v_entry;

	RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', FALSE);
END;
$$;

-- ---------------------------------------------------------------------------
-- (3) Reconciliation: same rounding at the boundary so lease-fenced replays
-- and settled-row comparisons see column-scale values.

CREATE OR REPLACE FUNCTION public.reconcile_agent_run_cost(
	p_entry_id UUID,
	p_lock_token UUID,
	p_actual_cost_usd NUMERIC,
	p_actual_units NUMERIC DEFAULT NULL,
	p_provider_request_id TEXT DEFAULT NULL,
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_entry public.agent_run_cost_entries%ROWTYPE;
	v_root_id UUID;
	v_settlement JSONB;
	v_idempotent BOOLEAN;
BEGIN
	IF p_entry_id IS NULL
		OR p_lock_token IS NULL
		OR p_actual_cost_usd IS NULL
		OR p_actual_cost_usd < 0
		OR p_actual_cost_usd::TEXT IN ('NaN', 'Infinity', '-Infinity')
		OR (
			p_actual_units IS NOT NULL
			AND (
				p_actual_units < 0
				OR p_actual_units::TEXT IN ('NaN', 'Infinity', '-Infinity')
			)
		)
		OR char_length(COALESCE(p_provider_request_id, '')) > 300
		OR COALESCE(jsonb_typeof(p_metadata), 'null') <> 'object'
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_RECONCILIATION';
	END IF;

	p_actual_cost_usd := ROUND(p_actual_cost_usd, 8);
	p_actual_units := ROUND(p_actual_units, 4);

	SELECT root_run_id
	INTO v_root_id
	FROM public.agent_run_cost_entries
	WHERE id = p_entry_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RESERVATION_NOT_FOUND';
	END IF;

	-- Preserve the ledger's root-before-entry lock order.
	PERFORM 1
	FROM public.agent_runs
	WHERE id = v_root_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_ROOT_NOT_FOUND';
	END IF;

	SELECT *
	INTO v_entry
	FROM public.agent_run_cost_entries
	WHERE id = p_entry_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RESERVATION_NOT_FOUND';
	END IF;

	IF v_entry.reconciliation_lock_token IS NULL THEN
		IF v_entry.status = 'settled'
			AND v_entry.reconciliation_completed_token IS NOT DISTINCT FROM p_lock_token
			AND v_entry.actual_cost_usd IS NOT DISTINCT FROM p_actual_cost_usd
			AND v_entry.actual_units IS NOT DISTINCT FROM
				COALESCE(p_actual_units, v_entry.actual_units)
			AND v_entry.provider_request_id IS NOT DISTINCT FROM
				COALESCE(NULLIF(btrim(p_provider_request_id), ''), v_entry.provider_request_id)
		THEN
			RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', TRUE);
		END IF;
		RAISE EXCEPTION 'AGENT_RUN_COST_RECONCILIATION_LEASE_CONFLICT';
	END IF;

	IF v_entry.reconciliation_lock_token IS DISTINCT FROM p_lock_token THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RECONCILIATION_LEASE_CONFLICT';
	END IF;

	IF v_entry.provider_request_id IS NOT NULL
		AND NULLIF(btrim(p_provider_request_id), '') IS NOT NULL
		AND v_entry.provider_request_id <> btrim(p_provider_request_id)
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_PROVIDER_REQUEST_CONFLICT';
	END IF;

	IF v_entry.status = 'released' THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_TERMINAL_CONFLICT';
	END IF;

	-- A normal response callback can settle while a stale-row lookup is in
	-- flight. The valid lease holder may correct that just-settled estimate
	-- from the authoritative provider record; ordinary settlement remains
	-- immutable through settle_agent_run_cost.
	IF v_entry.status = 'settled' THEN
		v_idempotent :=
			v_entry.actual_cost_usd IS NOT DISTINCT FROM p_actual_cost_usd
			AND v_entry.actual_units IS NOT DISTINCT FROM
				COALESCE(p_actual_units, v_entry.actual_units)
			AND v_entry.provider_request_id IS NOT DISTINCT FROM
				COALESCE(NULLIF(btrim(p_provider_request_id), ''), v_entry.provider_request_id);

		PERFORM set_config('app.agent_run_cost_rpc', 'on', TRUE);
		UPDATE public.agent_run_cost_entries
		SET
			actual_cost_usd = p_actual_cost_usd,
			actual_units = COALESCE(p_actual_units, actual_units),
			provider_request_id = COALESCE(
				NULLIF(btrim(p_provider_request_id), ''),
				provider_request_id
			),
			metadata = metadata || p_metadata || jsonb_build_object(
				'provider_reconciled',
				TRUE,
				'reservation_overrun',
				p_actual_cost_usd > reserved_cost_usd + 0.00000001
			),
			reconciliation_locked_at = NULL,
			reconciliation_lock_expires_at = NULL,
			reconciliation_lock_token = NULL,
			reconciliation_completed_token = p_lock_token,
			reconciliation_next_attempt_at = NULL,
			reconciliation_last_error = NULL,
			reconciliation_needs_operator_at = NULL,
			updated_at = NOW()
		WHERE id = p_entry_id
		RETURNING * INTO v_entry;

		RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', v_idempotent);
	END IF;

	SELECT public.settle_agent_run_cost(
		v_entry.leaf_run_id,
		v_entry.attempt_key,
		'settled',
		p_actual_cost_usd,
		p_actual_units,
		p_provider_request_id,
		p_metadata || jsonb_build_object('provider_reconciled', TRUE),
		TRUE
	)
	INTO v_settlement;

	PERFORM set_config('app.agent_run_cost_rpc', 'on', TRUE);
	UPDATE public.agent_run_cost_entries
	SET
		reconciliation_locked_at = NULL,
		reconciliation_lock_expires_at = NULL,
		reconciliation_lock_token = NULL,
		reconciliation_completed_token = p_lock_token,
		reconciliation_next_attempt_at = NULL,
		reconciliation_last_error = NULL,
		reconciliation_needs_operator_at = NULL,
		updated_at = NOW()
	WHERE id = p_entry_id
	RETURNING * INTO v_entry;

	RETURN to_jsonb(v_entry) || jsonb_build_object(
		'idempotent',
		COALESCE((v_settlement->>'idempotent')::BOOLEAN, FALSE)
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- (1) Close the missed privilege gap and re-assert the worker-only fence on
-- every function this migration re-created. CREATE OR REPLACE preserves ACLs,
-- but explicit is cheaper than a future audit.

REVOKE ALL ON FUNCTION public.queue_deep_research_synthesis(UUID)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_deep_research_synthesis(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_agent_run_cost(
	UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agent_run_cost(
	UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.settle_agent_run_cost(
	UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_agent_run_cost(
	UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN
) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_agent_run_cost(
	UUID, UUID, NUMERIC, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_agent_run_cost(
	UUID, UUID, NUMERIC, NUMERIC, TEXT, JSONB
) TO service_role;
