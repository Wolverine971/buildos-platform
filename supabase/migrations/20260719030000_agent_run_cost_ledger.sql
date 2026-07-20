-- supabase/migrations/20260719030000_agent_run_cost_ledger.sql
-- Durable, fail-closed cost reservations for Agent Runs.
--
-- Provider calls must reserve through reserve_agent_run_cost before dispatch.
-- Settlement is an idempotent lifecycle transition. Direct writes are denied;
-- reconciliation tooling reads the ledger and resolves uncertain reservations
-- through settle_agent_run_cost.

CREATE TABLE IF NOT EXISTS public.agent_run_cost_entries (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	root_run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
	leaf_run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
	attempt_key TEXT NOT NULL,
	provider TEXT NOT NULL,
	operation TEXT NOT NULL,
	resource TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'reserved',
	reserved_units NUMERIC(20, 4),
	actual_units NUMERIC(20, 4),
	unit_type TEXT,
	reserved_cost_usd NUMERIC(14, 8) NOT NULL,
	actual_cost_usd NUMERIC(14, 8),
	provider_request_id TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	settled_at TIMESTAMPTZ,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT agent_run_cost_entries_attempt_key_length
		CHECK (char_length(attempt_key) BETWEEN 1 AND 200),
	CONSTRAINT agent_run_cost_entries_provider_length
		CHECK (char_length(provider) BETWEEN 1 AND 80),
	CONSTRAINT agent_run_cost_entries_operation_length
		CHECK (char_length(operation) BETWEEN 1 AND 160),
	CONSTRAINT agent_run_cost_entries_resource_length
		CHECK (char_length(resource) BETWEEN 1 AND 300),
	CONSTRAINT agent_run_cost_entries_status_check
		CHECK (status IN ('reserved', 'settled', 'released', 'reconciliation_required')),
	CONSTRAINT agent_run_cost_entries_reserved_units_check
		CHECK (
			reserved_units IS NULL
			OR (
				reserved_units::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
				AND reserved_units >= 0
			)
		),
	CONSTRAINT agent_run_cost_entries_actual_units_check
		CHECK (
			actual_units IS NULL
			OR (
				actual_units::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
				AND actual_units >= 0
			)
		),
	CONSTRAINT agent_run_cost_entries_reserved_cost_check
		CHECK (
			reserved_cost_usd::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
			AND reserved_cost_usd > 0
		),
	CONSTRAINT agent_run_cost_entries_actual_cost_check
		CHECK (
			actual_cost_usd IS NULL
			OR (
				actual_cost_usd::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
				AND actual_cost_usd >= 0
			)
		),
	CONSTRAINT agent_run_cost_entries_metadata_object
		CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT agent_run_cost_entries_attempt_unique
		UNIQUE (leaf_run_id, attempt_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_cost_entries_root_exposure
	ON public.agent_run_cost_entries(root_run_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_run_cost_entries_leaf_created
	ON public.agent_run_cost_entries(leaf_run_id, reserved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_cost_entries_provider_request
	ON public.agent_run_cost_entries(provider, provider_request_id)
	WHERE provider_request_id IS NOT NULL;

ALTER TABLE public.agent_run_cost_entries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.agent_run_cost_entries IS
	'Durable Agent Run paid-attempt ledger. Writes are restricted to reservation and settlement RPCs.';

COMMENT ON COLUMN public.agent_run_cost_entries.attempt_key IS
	'Caller-stable idempotency key for one logical provider attempt.';

COMMENT ON COLUMN public.agent_run_cost_entries.status IS
	'reserved before dispatch; settled/released terminal; reconciliation_required is conservative unresolved exposure.';

-- Defense in depth: even a mistakenly granted table write cannot bypass the
-- lifecycle functions. The SECURITY DEFINER functions set this transaction-
-- local marker immediately before their own INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.agent_run_cost_guard_direct_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
	IF current_setting('app.agent_run_cost_rpc', TRUE) IS DISTINCT FROM 'on' THEN
		RAISE EXCEPTION 'Agent Run cost entries must be changed through cost ledger RPCs';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_run_cost_guard_direct_write
	ON public.agent_run_cost_entries;
CREATE TRIGGER trg_agent_run_cost_guard_direct_write
	BEFORE INSERT OR UPDATE ON public.agent_run_cost_entries
	FOR EACH ROW
	EXECUTE FUNCTION public.agent_run_cost_guard_direct_write();

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

	-- Read once to determine the lock root, then lock root before leaf. Every
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
		SELECT *
		INTO v_leaf
		FROM public.agent_runs
		WHERE id = p_leaf_run_id
		FOR UPDATE;
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
		AND v_entry.actual_cost_usd IS NOT DISTINCT FROM v_actual_cost
		AND v_entry.actual_units IS NOT DISTINCT FROM p_actual_units
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
		actual_cost_usd = v_actual_cost,
		actual_units = p_actual_units,
		provider_request_id = COALESCE(
			NULLIF(btrim(p_provider_request_id), ''),
			provider_request_id
		),
		metadata = metadata || p_metadata || jsonb_build_object(
			'reservation_overrun',
			v_actual_cost IS NOT NULL
				AND v_actual_cost > reserved_cost_usd + 0.00000001
		),
		settled_at = v_settled_at,
		updated_at = NOW()
	WHERE id = v_entry.id
	RETURNING * INTO v_entry;

	RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', FALSE);
END;
$$;

REVOKE ALL ON TABLE public.agent_run_cost_entries FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
	ON TABLE public.agent_run_cost_entries FROM service_role;
GRANT SELECT ON TABLE public.agent_run_cost_entries TO service_role;

REVOKE ALL ON FUNCTION public.reserve_agent_run_cost(
	UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_agent_run_cost(
	UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.settle_agent_run_cost(
	UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_agent_run_cost(
	UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN
) TO service_role;
