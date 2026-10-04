-- libri-migration: true
-- Libri-only paid-attempt fencing. No queue, provider, or feature activation.
-- Invoker functions preserve worker RLS and existing cost-budget/lease guards.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION libri.guard_provider_attempt()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
 run_kind text;
BEGIN
 IF TG_OP = 'INSERT' OR (OLD.status = 'reserved' AND NEW.status = 'started') THEN
  -- Serialize with lease recovery and the existing reservation guard. A new SQL
  -- statement after this lock sees any authorization committed before recovery.
  PERFORM 1 FROM libri.research_steps WHERE id = NEW.step_id FOR UPDATE;
  IF EXISTS (
   SELECT 1 FROM libri.provider_cost_reservations prior
   WHERE prior.step_id = NEW.step_id
    AND prior.execution_generation <> NEW.execution_generation
    AND prior.status IN ('started', 'settled')
  ) THEN
   RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'provider_attempt_reconciliation_required';
  END IF;
  SELECT kind INTO run_kind FROM libri.research_runs WHERE id = NEW.run_id;
  IF run_kind = 'task_batch' AND NOT libri.research_task_execution_allowed(NEW.step_id) THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'research_task_execution_revoked';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION libri.guard_provider_attempt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION libri.guard_provider_attempt() TO libri_worker, service_role;
CREATE TRIGGER guard_provider_attempt
 BEFORE INSERT OR UPDATE ON libri.provider_cost_reservations
 FOR EACH ROW EXECUTE FUNCTION libri.guard_provider_attempt();

CREATE OR REPLACE FUNCTION libri.reserve_provider_cost(
	p_step_id uuid,
	p_execution_generation integer,
	p_lease_token uuid,
	p_reservation_key text,
	p_provider text,
	p_model text,
	p_reserved_microusd bigint
)
RETURNS TABLE (
	reservation_id uuid,
	outcome text,
	created boolean,
	reservation_amount_microusd bigint,
	remaining_microusd bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	existing_reservation libri.provider_cost_reservations%ROWTYPE;
	locked_step record;
	locked_run record;
	held_microusd bigint;
	spent_microusd bigint;
	has_overrun boolean;
	available_microusd bigint;
	new_reservation_id uuid;
	reservation_found boolean := false;
BEGIN
	IF p_execution_generation IS NULL OR p_execution_generation <= 0
		OR p_lease_token IS NULL
		OR p_reserved_microusd IS NULL OR p_reserved_microusd <= 0
		OR length(btrim(p_reservation_key)) NOT BETWEEN 1 AND 128
		OR length(btrim(p_provider)) NOT BETWEEN 1 AND 64
		OR length(btrim(p_model)) NOT BETWEEN 1 AND 120 THEN
		RAISE EXCEPTION 'invalid provider cost reservation input';
	END IF;

	SELECT reservation.* INTO existing_reservation
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.step_id = p_step_id
		AND reservation.execution_generation = p_execution_generation
		AND reservation.reservation_key = btrim(p_reservation_key)
	FOR UPDATE;
	IF FOUND THEN
		IF existing_reservation.lease_token IS DISTINCT FROM p_lease_token
			OR existing_reservation.provider IS DISTINCT FROM btrim(p_provider)
			OR existing_reservation.model IS DISTINCT FROM btrim(p_model)
			OR existing_reservation.reserved_microusd IS DISTINCT FROM p_reserved_microusd THEN
			RAISE EXCEPTION 'provider cost reservation idempotency conflict';
		END IF;
		SELECT greatest(
			run.cost_budget_microusd
				- COALESCE(sum(reservation.reserved_microusd) FILTER (
					WHERE reservation.status IN ('reserved', 'started')
				), 0)
				- COALESCE(sum(reservation.actual_cost_microusd) FILTER (
					WHERE reservation.status = 'settled'
				), 0),
			0
		) INTO available_microusd
		FROM libri.research_runs AS run
		LEFT JOIN libri.provider_cost_reservations AS reservation
			ON reservation.run_id = run.id
		WHERE run.id = existing_reservation.run_id
		GROUP BY run.cost_budget_microusd;
		RETURN QUERY SELECT existing_reservation.id, existing_reservation.status, false,
			existing_reservation.reserved_microusd, COALESCE(available_microusd, 0);
		RETURN;
	END IF;

	SELECT step.library_id, step.run_id, step.status, step.execution_generation,
		step.lease_token, step.lease_expires_at
	INTO locked_step
	FROM libri.research_steps AS step
	WHERE step.id = p_step_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN QUERY SELECT NULL::uuid, 'stale'::text, false, p_reserved_microusd, 0::bigint;
		RETURN;
	END IF;

	SELECT run.status, run.cancel_requested_at, run.deadline_at,
		run.cost_budget_microusd
	INTO locked_run
	FROM libri.research_runs AS run
	WHERE run.id = locked_step.run_id
	FOR UPDATE;
	IF locked_step.status <> 'leased'
		OR locked_step.execution_generation IS DISTINCT FROM p_execution_generation
		OR locked_step.lease_token IS DISTINCT FROM p_lease_token
		OR locked_step.lease_expires_at <= clock_timestamp()
		OR locked_run.status <> 'running'
		OR locked_run.cancel_requested_at IS NOT NULL
		OR (locked_run.deadline_at IS NOT NULL AND locked_run.deadline_at <= clock_timestamp())
		OR locked_run.cost_budget_microusd IS NULL THEN
		RETURN QUERY SELECT NULL::uuid, 'stale'::text, false, p_reserved_microusd, 0::bigint;
		RETURN;
	END IF;

	SELECT reservation.* INTO existing_reservation
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.step_id = p_step_id
		AND reservation.execution_generation = p_execution_generation
		AND reservation.reservation_key = btrim(p_reservation_key)
	FOR UPDATE;
	reservation_found := FOUND;
	-- A prior generation may have crossed the paid boundary without returning a
	-- result. A new key or model must not turn that uncertainty into another bill.
	IF EXISTS (
		SELECT 1 FROM libri.provider_cost_reservations prior
		WHERE prior.step_id = p_step_id
			AND prior.execution_generation <> p_execution_generation
			AND prior.status IN ('started', 'settled')
	) THEN
		RETURN QUERY SELECT NULL::uuid, 'reconciliation_required'::text, false,
			p_reserved_microusd, 0::bigint;
		RETURN;
	END IF;
	IF (SELECT kind = 'task_batch' FROM libri.research_runs WHERE id = locked_step.run_id)
		AND NOT libri.research_task_execution_allowed(p_step_id) THEN
		RETURN QUERY SELECT NULL::uuid, 'stale'::text, false, p_reserved_microusd, 0::bigint;
		RETURN;
	END IF;
	IF reservation_found AND (
		existing_reservation.lease_token IS DISTINCT FROM p_lease_token
		OR existing_reservation.provider IS DISTINCT FROM btrim(p_provider)
		OR existing_reservation.model IS DISTINCT FROM btrim(p_model)
		OR existing_reservation.reserved_microusd IS DISTINCT FROM p_reserved_microusd
	) THEN
		RAISE EXCEPTION 'provider cost reservation idempotency conflict';
	END IF;

	SELECT
		COALESCE(sum(reservation.reserved_microusd) FILTER (
			WHERE reservation.status IN ('reserved', 'started')
		), 0),
		COALESCE(sum(reservation.actual_cost_microusd) FILTER (
			WHERE reservation.status = 'settled'
		), 0),
		COALESCE(bool_or(
			reservation.status = 'settled'
			AND reservation.actual_cost_microusd > reservation.reserved_microusd
		), false)
	INTO held_microusd, spent_microusd, has_overrun
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.run_id = locked_step.run_id;
	available_microusd := greatest(
		locked_run.cost_budget_microusd - held_microusd - spent_microusd, 0
	);

	IF reservation_found THEN
		RETURN QUERY SELECT existing_reservation.id, existing_reservation.status, false,
			existing_reservation.reserved_microusd, available_microusd;
		RETURN;
	END IF;
	IF has_overrun OR spent_microusd > locked_run.cost_budget_microusd THEN
		RETURN QUERY SELECT NULL::uuid, 'reconciliation_required'::text, false,
			p_reserved_microusd, 0::bigint;
		RETURN;
	END IF;
	IF p_reserved_microusd > available_microusd THEN
		RETURN QUERY SELECT NULL::uuid, 'budget_unavailable'::text, false,
			p_reserved_microusd, available_microusd;
		RETURN;
	END IF;

	INSERT INTO libri.provider_cost_reservations (
		library_id, run_id, step_id, execution_generation, lease_token,
		reservation_key, provider, model, reserved_microusd
	) VALUES (
		locked_step.library_id, locked_step.run_id, p_step_id, p_execution_generation,
		p_lease_token, btrim(p_reservation_key), btrim(p_provider), btrim(p_model),
		p_reserved_microusd
	) RETURNING id INTO new_reservation_id;

	RETURN QUERY SELECT new_reservation_id, 'reserved'::text, true,
		p_reserved_microusd, available_microusd - p_reserved_microusd;
END;
$function$;
