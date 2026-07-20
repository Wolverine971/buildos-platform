-- supabase/migrations/20260719040000_agent_run_cost_reconciliation.sql
-- Lease-based reconciliation for stale Agent Run cost reservations.
--
-- Multiple scheduler replicas may claim work concurrently. Claims use
-- FOR UPDATE SKIP LOCKED plus a per-row lease token; uncertain provider
-- outcomes remain budget exposure until an authoritative settlement or
-- explicit operator review.

ALTER TABLE public.agent_run_cost_entries
	ADD COLUMN IF NOT EXISTS reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS reconciliation_locked_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS reconciliation_lock_expires_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS reconciliation_lock_token UUID,
	ADD COLUMN IF NOT EXISTS reconciliation_completed_token UUID,
	ADD COLUMN IF NOT EXISTS reconciliation_next_attempt_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS reconciliation_last_error TEXT,
	ADD COLUMN IF NOT EXISTS reconciliation_needs_operator_at TIMESTAMPTZ;

ALTER TABLE public.agent_run_cost_entries
	ADD CONSTRAINT agent_run_cost_entries_reconciliation_attempts_check
		CHECK (reconciliation_attempts >= 0),
	ADD CONSTRAINT agent_run_cost_entries_reconciliation_lease_check
		CHECK (
			(
				reconciliation_lock_token IS NULL
				AND reconciliation_locked_at IS NULL
				AND reconciliation_lock_expires_at IS NULL
			)
			OR (
				reconciliation_lock_token IS NOT NULL
				AND reconciliation_locked_at IS NOT NULL
				AND reconciliation_lock_expires_at IS NOT NULL
				AND reconciliation_lock_expires_at > reconciliation_locked_at
			)
		),
	ADD CONSTRAINT agent_run_cost_entries_reconciliation_error_length
		CHECK (
			reconciliation_last_error IS NULL
			OR char_length(reconciliation_last_error) <= 4000
		);

CREATE INDEX IF NOT EXISTS idx_agent_run_cost_entries_reconciliation_due
	ON public.agent_run_cost_entries(
		reconciliation_next_attempt_at,
		updated_at,
		reserved_at
	)
	WHERE status IN ('reserved', 'reconciliation_required')
		AND reconciliation_needs_operator_at IS NULL;

COMMENT ON COLUMN public.agent_run_cost_entries.reconciliation_lock_token IS
	'Short-lived ownership fence for one scheduled provider reconciliation attempt.';

COMMENT ON COLUMN public.agent_run_cost_entries.reconciliation_completed_token IS
	'Last successfully completed reconciliation lease token, retained for idempotent response-loss retries.';

COMMENT ON COLUMN public.agent_run_cost_entries.reconciliation_needs_operator_at IS
	'Set when automatic provider lookup is unavailable or retry bounds are exhausted; exposure remains counted.';

CREATE OR REPLACE FUNCTION public.claim_agent_run_cost_reconciliation(
	p_stale_before TIMESTAMPTZ,
	p_limit INTEGER DEFAULT 20,
	p_lease_seconds INTEGER DEFAULT 120,
	p_max_attempts INTEGER DEFAULT 8
)
RETURNS SETOF public.agent_run_cost_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF p_stale_before IS NULL
		OR p_stale_before > NOW()
		OR p_limit NOT BETWEEN 1 AND 100
		OR p_lease_seconds NOT BETWEEN 30 AND 900
		OR p_max_attempts NOT BETWEEN 1 AND 100
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_RECONCILIATION_CLAIM';
	END IF;

	PERFORM set_config('app.agent_run_cost_rpc', 'on', TRUE);

	RETURN QUERY
	WITH candidates AS (
		SELECT entry.id
		FROM public.agent_run_cost_entries AS entry
		WHERE entry.status IN ('reserved', 'reconciliation_required')
			AND entry.reconciliation_needs_operator_at IS NULL
			AND COALESCE(entry.reconciliation_next_attempt_at, '-infinity'::TIMESTAMPTZ)
				<= NOW()
			AND COALESCE(entry.reconciliation_lock_expires_at, '-infinity'::TIMESTAMPTZ)
				<= NOW()
			AND (
				CASE entry.status
					WHEN 'reserved' THEN entry.reserved_at
					ELSE entry.updated_at
				END
			) <= p_stale_before
		ORDER BY
			CASE entry.status WHEN 'reconciliation_required' THEN 0 ELSE 1 END,
			COALESCE(entry.reconciliation_next_attempt_at, entry.updated_at, entry.reserved_at),
			entry.id
		FOR UPDATE SKIP LOCKED
		LIMIT p_limit
	)
	UPDATE public.agent_run_cost_entries AS entry
	SET
		reconciliation_attempts = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts
				THEN entry.reconciliation_attempts + 1
			ELSE entry.reconciliation_attempts
		END,
		reconciliation_locked_at = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts THEN NOW()
			ELSE NULL
		END,
		reconciliation_lock_expires_at = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts
				THEN NOW() + make_interval(secs => p_lease_seconds)
			ELSE NULL
		END,
		reconciliation_lock_token = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts THEN gen_random_uuid()
			ELSE NULL
		END,
		reconciliation_next_attempt_at = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts
				THEN entry.reconciliation_next_attempt_at
			ELSE NULL
		END,
		reconciliation_last_error = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts
				THEN entry.reconciliation_last_error
			ELSE 'Final automatic reconciliation lease expired before completion.'
		END,
		reconciliation_needs_operator_at = CASE
			WHEN entry.reconciliation_attempts < p_max_attempts
				THEN entry.reconciliation_needs_operator_at
			ELSE NOW()
		END,
		updated_at = NOW()
	FROM candidates
	WHERE entry.id = candidates.id
	RETURNING entry.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_agent_run_cost_reconciliation(
	p_entry_id UUID,
	p_lock_token UUID,
	p_error TEXT,
	p_retryable BOOLEAN,
	p_retry_after TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_entry public.agent_run_cost_entries%ROWTYPE;
BEGIN
	IF p_entry_id IS NULL
		OR p_lock_token IS NULL
		OR p_error IS NULL
		OR char_length(btrim(p_error)) NOT BETWEEN 1 AND 4000
		OR p_retryable IS NULL
		OR (p_retryable AND (p_retry_after IS NULL OR p_retry_after <= NOW()))
		OR (NOT p_retryable AND p_retry_after IS NOT NULL)
	THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_INVALID_RECONCILIATION_RELEASE';
	END IF;

	SELECT *
	INTO v_entry
	FROM public.agent_run_cost_entries
	WHERE id = p_entry_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RESERVATION_NOT_FOUND';
	END IF;

	IF v_entry.status IN ('settled', 'released') THEN
		RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', TRUE);
	END IF;

	IF v_entry.reconciliation_lock_token IS DISTINCT FROM p_lock_token THEN
		RAISE EXCEPTION 'AGENT_RUN_COST_RECONCILIATION_LEASE_CONFLICT';
	END IF;

	PERFORM set_config('app.agent_run_cost_rpc', 'on', TRUE);
	UPDATE public.agent_run_cost_entries
	SET
		reconciliation_locked_at = NULL,
		reconciliation_lock_expires_at = NULL,
		reconciliation_lock_token = NULL,
		reconciliation_next_attempt_at = CASE WHEN p_retryable THEN p_retry_after ELSE NULL END,
		reconciliation_last_error = btrim(p_error),
		reconciliation_needs_operator_at = CASE
			WHEN p_retryable THEN NULL
			ELSE NOW()
		END,
		updated_at = NOW()
	WHERE id = p_entry_id
	RETURNING * INTO v_entry;

	RETURN to_jsonb(v_entry) || jsonb_build_object('idempotent', FALSE);
END;
$$;

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

REVOKE ALL ON FUNCTION public.claim_agent_run_cost_reconciliation(
	TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_agent_run_cost_reconciliation(
	TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION public.release_agent_run_cost_reconciliation(
	UUID, UUID, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_agent_run_cost_reconciliation(
	UUID, UUID, TEXT, BOOLEAN, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_agent_run_cost(
	UUID, UUID, NUMERIC, NUMERIC, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_agent_run_cost(
	UUID, UUID, NUMERIC, NUMERIC, TEXT, JSONB
) TO service_role;
