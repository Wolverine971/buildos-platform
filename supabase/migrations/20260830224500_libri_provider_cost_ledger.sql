-- libri-migration: true
-- Libri phase 3E.2: fenced provider-cost reservation and settlement ledger.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.provider_cost_reservations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL,
	run_id uuid NOT NULL,
	step_id uuid NOT NULL,
	execution_generation integer NOT NULL,
	lease_token uuid NOT NULL,
	reservation_key text NOT NULL,
	provider text NOT NULL,
	model text NOT NULL,
	status text NOT NULL DEFAULT 'reserved',
	reserved_microusd bigint NOT NULL,
	actual_cost_microusd bigint,
	prompt_tokens bigint,
	completion_tokens bigint,
	provider_request_id text,
	release_reason text,
	started_at timestamptz,
	settled_at timestamptz,
	released_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT provider_cost_reservations_step_fk
		FOREIGN KEY (library_id, run_id, step_id)
		REFERENCES libri.research_steps(library_id, run_id, id)
		ON DELETE CASCADE,
	CONSTRAINT provider_cost_reservations_attempt_unique
		UNIQUE (step_id, execution_generation, reservation_key),
	CONSTRAINT provider_cost_reservations_generation_positive CHECK (execution_generation > 0),
	CONSTRAINT provider_cost_reservations_key_valid CHECK (
		length(btrim(reservation_key)) BETWEEN 1 AND 128
	),
	CONSTRAINT provider_cost_reservations_provider_valid CHECK (
		length(btrim(provider)) BETWEEN 1 AND 64
	),
	CONSTRAINT provider_cost_reservations_model_valid CHECK (
		length(btrim(model)) BETWEEN 1 AND 120
	),
	CONSTRAINT provider_cost_reservations_status_valid CHECK (
		status IN ('reserved', 'started', 'settled', 'released')
	),
	CONSTRAINT provider_cost_reservations_amounts_valid CHECK (
		reserved_microusd > 0
		AND (actual_cost_microusd IS NULL OR actual_cost_microusd >= 0)
		AND (prompt_tokens IS NULL OR prompt_tokens >= 0)
		AND (completion_tokens IS NULL OR completion_tokens >= 0)
	),
	CONSTRAINT provider_cost_reservations_request_id_valid CHECK (
		provider_request_id IS NULL
		OR length(btrim(provider_request_id)) BETWEEN 1 AND 256
	),
	CONSTRAINT provider_cost_reservations_release_reason_valid CHECK (
		release_reason IS NULL
		OR length(btrim(release_reason)) BETWEEN 1 AND 256
	),
	CONSTRAINT provider_cost_reservations_state_shape CHECK (
		(
			status = 'reserved'
			AND started_at IS NULL
			AND settled_at IS NULL
			AND released_at IS NULL
			AND actual_cost_microusd IS NULL
			AND prompt_tokens IS NULL
			AND completion_tokens IS NULL
			AND provider_request_id IS NULL
			AND release_reason IS NULL
		)
		OR (
			status = 'started'
			AND started_at IS NOT NULL
			AND settled_at IS NULL
			AND released_at IS NULL
			AND actual_cost_microusd IS NULL
			AND prompt_tokens IS NULL
			AND completion_tokens IS NULL
			AND provider_request_id IS NULL
			AND release_reason IS NULL
		)
		OR (
			status = 'settled'
			AND started_at IS NOT NULL
			AND settled_at IS NOT NULL
			AND released_at IS NULL
			AND actual_cost_microusd IS NOT NULL
			AND prompt_tokens IS NOT NULL
			AND completion_tokens IS NOT NULL
			AND provider_request_id IS NOT NULL
			AND release_reason IS NULL
		)
		OR (
			status = 'released'
			AND started_at IS NULL
			AND settled_at IS NULL
			AND released_at IS NOT NULL
			AND actual_cost_microusd IS NULL
			AND prompt_tokens IS NULL
			AND completion_tokens IS NULL
			AND provider_request_id IS NULL
			AND release_reason IS NOT NULL
		)
	)
);

CREATE INDEX provider_cost_reservations_run_status_idx
	ON libri.provider_cost_reservations (run_id, status, created_at);
CREATE INDEX provider_cost_reservations_started_idx
	ON libri.provider_cost_reservations (started_at, id)
	WHERE status = 'started';
CREATE UNIQUE INDEX provider_cost_reservations_provider_request_unique_idx
	ON libri.provider_cost_reservations (provider, provider_request_id)
	WHERE provider_request_id IS NOT NULL;

ALTER TABLE libri.provider_cost_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.provider_cost_reservations FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_cost_reservations_libri_worker_select
	ON libri.provider_cost_reservations FOR SELECT TO libri_worker USING (true);
CREATE POLICY provider_cost_reservations_libri_worker_insert
	ON libri.provider_cost_reservations FOR INSERT TO libri_worker WITH CHECK (true);
CREATE POLICY provider_cost_reservations_libri_worker_update
	ON libri.provider_cost_reservations FOR UPDATE TO libri_worker
	USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION libri.enforce_provider_cost_reservation_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	locked_step record;
	locked_run record;
	held_microusd bigint;
	spent_microusd bigint;
	has_overrun boolean;
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.status <> 'reserved' THEN
			RAISE EXCEPTION 'provider cost reservations must begin reserved';
		END IF;
		NEW.reservation_key := btrim(NEW.reservation_key);
		NEW.provider := btrim(NEW.provider);
		NEW.model := btrim(NEW.model);

		SELECT step.library_id, step.run_id, step.status, step.execution_generation,
			step.lease_token, step.lease_expires_at
		INTO locked_step
		FROM libri.research_steps AS step
		WHERE step.id = NEW.step_id
		FOR UPDATE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'provider cost step is unavailable';
		END IF;

		SELECT run.status, run.cancel_requested_at, run.deadline_at,
			run.cost_budget_microusd
		INTO locked_run
		FROM libri.research_runs AS run
		WHERE run.id = locked_step.run_id
		FOR UPDATE;

		IF locked_step.library_id IS DISTINCT FROM NEW.library_id
			OR locked_step.run_id IS DISTINCT FROM NEW.run_id
			OR locked_step.status <> 'leased'
			OR locked_step.execution_generation IS DISTINCT FROM NEW.execution_generation
			OR locked_step.lease_token IS DISTINCT FROM NEW.lease_token
			OR locked_step.lease_expires_at <= clock_timestamp()
			OR locked_run.status <> 'running'
			OR locked_run.cancel_requested_at IS NOT NULL
			OR (locked_run.deadline_at IS NOT NULL AND locked_run.deadline_at <= clock_timestamp())
			OR locked_run.cost_budget_microusd IS NULL THEN
			RAISE EXCEPTION 'provider cost reservation is stale';
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
		WHERE reservation.run_id = NEW.run_id;

		IF has_overrun
			OR spent_microusd > locked_run.cost_budget_microusd
			OR NEW.reserved_microusd > greatest(
				locked_run.cost_budget_microusd - held_microusd - spent_microusd,
				0
			) THEN
			RAISE EXCEPTION 'provider cost budget is unavailable';
		END IF;
		RETURN NEW;
	END IF;

	IF ROW(
		NEW.id, NEW.library_id, NEW.run_id, NEW.step_id, NEW.execution_generation,
		NEW.lease_token, NEW.reservation_key, NEW.provider, NEW.model,
		NEW.reserved_microusd, NEW.created_at
	) IS DISTINCT FROM ROW(
		OLD.id, OLD.library_id, OLD.run_id, OLD.step_id, OLD.execution_generation,
		OLD.lease_token, OLD.reservation_key, OLD.provider, OLD.model,
		OLD.reserved_microusd, OLD.created_at
	) THEN
		RAISE EXCEPTION 'provider cost reservation identity is immutable';
	END IF;

	IF OLD.status = 'reserved' AND NEW.status = 'started' THEN
		SELECT step.status, step.execution_generation, step.lease_token,
			step.lease_expires_at
		INTO locked_step
		FROM libri.research_steps AS step
		WHERE step.id = OLD.step_id
		FOR UPDATE;
		SELECT run.status, run.cancel_requested_at, run.deadline_at,
			run.cost_budget_microusd
		INTO locked_run
		FROM libri.research_runs AS run
		WHERE run.id = OLD.run_id
		FOR UPDATE;
		IF locked_step.status <> 'leased'
			OR locked_step.execution_generation IS DISTINCT FROM OLD.execution_generation
			OR locked_step.lease_token IS DISTINCT FROM OLD.lease_token
			OR locked_step.lease_expires_at <= clock_timestamp()
			OR locked_run.status <> 'running'
			OR locked_run.cancel_requested_at IS NOT NULL
			OR (locked_run.deadline_at IS NOT NULL AND locked_run.deadline_at <= clock_timestamp())
			OR locked_run.cost_budget_microusd IS NULL THEN
			RAISE EXCEPTION 'provider cost authorization is stale';
		END IF;
		NEW.started_at := clock_timestamp();
		RETURN NEW;
	END IF;

	IF OLD.status = 'reserved' AND NEW.status = 'released' THEN
		NEW.release_reason := btrim(NEW.release_reason);
		NEW.released_at := clock_timestamp();
		RETURN NEW;
	END IF;

	IF OLD.status = 'started' AND NEW.status = 'settled' THEN
		PERFORM 1 FROM libri.research_runs AS run
		WHERE run.id = OLD.run_id FOR UPDATE;
		NEW.provider_request_id := btrim(NEW.provider_request_id);
		NEW.settled_at := clock_timestamp();
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'invalid provider cost state transition: % to %', OLD.status, NEW.status;
END;
$function$;

CREATE TRIGGER provider_cost_reservations_enforce_write
	BEFORE INSERT OR UPDATE ON libri.provider_cost_reservations
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_provider_cost_reservation_write();
CREATE TRIGGER provider_cost_reservations_set_updated_at
	BEFORE UPDATE ON libri.provider_cost_reservations
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

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

CREATE OR REPLACE FUNCTION libri.start_provider_cost(
	p_reservation_id uuid,
	p_execution_generation integer,
	p_lease_token uuid
)
RETURNS TABLE (authorized boolean, outcome text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	visible_reservation record;
	locked_reservation libri.provider_cost_reservations%ROWTYPE;
	lease_is_current boolean;
BEGIN
	SELECT reservation.run_id, reservation.step_id INTO visible_reservation
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id;
	IF NOT FOUND OR p_execution_generation IS NULL OR p_lease_token IS NULL THEN
		RETURN QUERY SELECT false, 'stale'::text;
		RETURN;
	END IF;

	SELECT EXISTS (
		SELECT 1
		FROM libri.research_steps AS step
		JOIN libri.research_runs AS run ON run.id = step.run_id
		WHERE step.id = visible_reservation.step_id
			AND run.id = visible_reservation.run_id
			AND step.status = 'leased'
			AND step.execution_generation = p_execution_generation
			AND step.lease_token = p_lease_token
			AND step.lease_expires_at > clock_timestamp()
			AND run.status = 'running'
			AND run.cancel_requested_at IS NULL
			AND (run.deadline_at IS NULL OR run.deadline_at > clock_timestamp())
			AND run.cost_budget_microusd IS NOT NULL
		FOR UPDATE OF step, run
	) INTO lease_is_current;

	SELECT reservation.* INTO locked_reservation
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id
	FOR UPDATE;
	IF NOT FOUND
		OR locked_reservation.execution_generation IS DISTINCT FROM p_execution_generation
		OR locked_reservation.lease_token IS DISTINCT FROM p_lease_token THEN
		RETURN QUERY SELECT false, 'stale'::text;
		RETURN;
	END IF;
	IF locked_reservation.status = 'started' THEN
		RETURN QUERY SELECT false, 'started'::text;
		RETURN;
	END IF;
	IF locked_reservation.status <> 'reserved' THEN
		RETURN QUERY SELECT false, locked_reservation.status;
		RETURN;
	END IF;
	IF NOT lease_is_current THEN
		RETURN QUERY SELECT false, 'stale'::text;
		RETURN;
	END IF;

	UPDATE libri.provider_cost_reservations AS reservation
	SET status = 'started', started_at = clock_timestamp()
	WHERE reservation.id = p_reservation_id;
	RETURN QUERY SELECT true, 'started'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION libri.settle_provider_cost(
	p_reservation_id uuid,
	p_execution_generation integer,
	p_lease_token uuid,
	p_actual_cost_microusd bigint,
	p_prompt_tokens bigint,
	p_completion_tokens bigint,
	p_provider_request_id text
)
RETURNS TABLE (
	accepted boolean,
	outcome text,
	over_budget boolean,
	total_spent_microusd bigint,
	remaining_microusd bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	visible_run_id uuid;
	locked_reservation libri.provider_cost_reservations%ROWTYPE;
	budget_microusd bigint;
	held_microusd bigint;
	spent_microusd bigint;
	has_overrun boolean;
BEGIN
	IF p_actual_cost_microusd IS NULL OR p_actual_cost_microusd < 0
		OR p_prompt_tokens IS NULL OR p_prompt_tokens < 0
		OR p_completion_tokens IS NULL OR p_completion_tokens < 0
		OR length(btrim(p_provider_request_id)) NOT BETWEEN 1 AND 256 THEN
		RAISE EXCEPTION 'invalid provider cost settlement input';
	END IF;

	SELECT reservation.run_id INTO visible_run_id
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id;
	IF NOT FOUND THEN
		RETURN QUERY SELECT false, 'stale'::text, false, 0::bigint, 0::bigint;
		RETURN;
	END IF;
	SELECT run.cost_budget_microusd INTO budget_microusd
	FROM libri.research_runs AS run WHERE run.id = visible_run_id FOR UPDATE;
	SELECT reservation.* INTO locked_reservation
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id FOR UPDATE;
	IF NOT FOUND
		OR locked_reservation.execution_generation IS DISTINCT FROM p_execution_generation
		OR locked_reservation.lease_token IS DISTINCT FROM p_lease_token THEN
		RETURN QUERY SELECT false, 'stale'::text, false, 0::bigint, 0::bigint;
		RETURN;
	END IF;

	IF locked_reservation.status = 'settled' THEN
		IF locked_reservation.actual_cost_microusd IS DISTINCT FROM p_actual_cost_microusd
			OR locked_reservation.prompt_tokens IS DISTINCT FROM p_prompt_tokens
			OR locked_reservation.completion_tokens IS DISTINCT FROM p_completion_tokens
			OR locked_reservation.provider_request_id IS DISTINCT FROM btrim(p_provider_request_id) THEN
			RAISE EXCEPTION 'provider cost settlement idempotency conflict';
		END IF;
	ELSIF locked_reservation.status = 'started' THEN
		UPDATE libri.provider_cost_reservations AS reservation
		SET status = 'settled', actual_cost_microusd = p_actual_cost_microusd,
			prompt_tokens = p_prompt_tokens, completion_tokens = p_completion_tokens,
			provider_request_id = btrim(p_provider_request_id),
			settled_at = clock_timestamp()
		WHERE reservation.id = p_reservation_id;
	ELSE
		RETURN QUERY SELECT false, locked_reservation.status, false, 0::bigint, 0::bigint;
		RETURN;
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
	WHERE reservation.run_id = locked_reservation.run_id;
	RETURN QUERY SELECT true, 'settled'::text,
		has_overrun OR spent_microusd > budget_microusd,
		spent_microusd,
		greatest(budget_microusd - held_microusd - spent_microusd, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION libri.release_provider_cost(
	p_reservation_id uuid,
	p_execution_generation integer,
	p_lease_token uuid,
	p_reason text
)
RETURNS TABLE (accepted boolean, outcome text, remaining_microusd bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	visible_run_id uuid;
	locked_reservation libri.provider_cost_reservations%ROWTYPE;
	budget_microusd bigint;
	held_microusd bigint;
	spent_microusd bigint;
BEGIN
	IF length(btrim(p_reason)) NOT BETWEEN 1 AND 256 THEN
		RAISE EXCEPTION 'invalid provider cost release reason';
	END IF;
	SELECT reservation.run_id INTO visible_run_id
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id;
	IF NOT FOUND THEN
		RETURN QUERY SELECT false, 'stale'::text, 0::bigint;
		RETURN;
	END IF;
	SELECT run.cost_budget_microusd INTO budget_microusd
	FROM libri.research_runs AS run WHERE run.id = visible_run_id FOR UPDATE;
	SELECT reservation.* INTO locked_reservation
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id FOR UPDATE;
	IF NOT FOUND
		OR locked_reservation.execution_generation IS DISTINCT FROM p_execution_generation
		OR locked_reservation.lease_token IS DISTINCT FROM p_lease_token THEN
		RETURN QUERY SELECT false, 'stale'::text, 0::bigint;
		RETURN;
	END IF;

	IF locked_reservation.status = 'released' THEN
		IF locked_reservation.release_reason IS DISTINCT FROM btrim(p_reason) THEN
			RAISE EXCEPTION 'provider cost release idempotency conflict';
		END IF;
	ELSIF locked_reservation.status = 'reserved' THEN
		UPDATE libri.provider_cost_reservations AS reservation
		SET status = 'released', release_reason = btrim(p_reason),
			released_at = clock_timestamp()
		WHERE reservation.id = p_reservation_id;
	ELSE
		RETURN QUERY SELECT false, locked_reservation.status, 0::bigint;
		RETURN;
	END IF;

	SELECT
		COALESCE(sum(reservation.reserved_microusd) FILTER (
			WHERE reservation.status IN ('reserved', 'started')
		), 0),
		COALESCE(sum(reservation.actual_cost_microusd) FILTER (
			WHERE reservation.status = 'settled'
		), 0)
	INTO held_microusd, spent_microusd
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.run_id = locked_reservation.run_id;
	RETURN QUERY SELECT true, 'released'::text,
		greatest(budget_microusd - held_microusd - spent_microusd, 0);
END;
$function$;

REVOKE ALL ON TABLE libri.provider_cost_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE libri.provider_cost_reservations TO service_role;
GRANT SELECT ON TABLE libri.provider_cost_reservations TO libri_worker;
GRANT INSERT (
	library_id, run_id, step_id, execution_generation, lease_token,
	reservation_key, provider, model, reserved_microusd
) ON TABLE libri.provider_cost_reservations TO libri_worker;
GRANT UPDATE (
	status, actual_cost_microusd, prompt_tokens, completion_tokens,
	provider_request_id, release_reason, started_at, settled_at, released_at, updated_at
) ON TABLE libri.provider_cost_reservations TO libri_worker;

REVOKE ALL ON FUNCTION libri.enforce_provider_cost_reservation_write()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.reserve_provider_cost
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.start_provider_cost
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.settle_provider_cost
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.release_provider_cost
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION libri.enforce_provider_cost_reservation_write()
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.reserve_provider_cost
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.start_provider_cost
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.settle_provider_cost
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.release_provider_cost
	TO libri_worker, service_role;
