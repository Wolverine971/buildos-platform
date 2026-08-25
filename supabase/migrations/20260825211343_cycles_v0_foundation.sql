-- Cycles v0 foundation
--
-- Cycles are the durable control plane for recurring agentic work. A mutable
-- definition owns triggers; an immutable run owns one admitted occurrence;
-- queue_jobs remains retry transport.

CREATE TABLE public.cycles (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	create_request_id text NOT NULL,
	create_request_fingerprint text NOT NULL CHECK (create_request_fingerprint ~ '^[0-9a-f]{64}$'),
	label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
	kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]*$'),
	target_type text NOT NULL CHECK (target_type IN ('user', 'project')),
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
	policy jsonb NOT NULL DEFAULT '{"overlap":"skip","misfire":"run_once","max_attempts":3}'::jsonb,
	attention_policy text NOT NULL DEFAULT 'exceptions'
		CHECK (attention_policy IN ('silent', 'exceptions', 'always')),
	state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused', 'deleted')),
	version integer NOT NULL DEFAULT 1 CHECK (version > 0),
	next_run_at timestamptz,
	last_run_at timestamptz,
	last_run_id uuid,
	last_error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz,
	CONSTRAINT cycles_request_id_nonempty CHECK (btrim(create_request_id) <> ''),
	CONSTRAINT cycles_request_id_unique UNIQUE (user_id, create_request_id),
	CONSTRAINT cycles_target_shape CHECK (
		(target_type = 'user' AND project_id IS NULL)
		OR (target_type = 'project' AND project_id IS NOT NULL)
	),
	CONSTRAINT cycles_policy_shape CHECK (
		jsonb_typeof(policy) = 'object'
		AND policy->>'overlap' IN ('skip', 'allow')
		AND policy->>'misfire' IN ('skip', 'run_once')
		AND jsonb_typeof(policy->'max_attempts') = 'number'
		AND policy->>'max_attempts' ~ '^[0-9]+$'
		AND (policy->>'max_attempts')::integer BETWEEN 1 AND 10
	),
	CONSTRAINT cycles_deleted_shape CHECK (
		(state = 'deleted' AND deleted_at IS NOT NULL)
		OR (state <> 'deleted' AND deleted_at IS NULL)
	)
);

CREATE TABLE public.cycle_triggers (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
	trigger_type text NOT NULL CHECK (trigger_type IN ('schedule', 'event', 'threshold', 'relative')),
	spec jsonb NOT NULL CHECK (
		jsonb_typeof(spec) = 'object'
		AND spec->>'type' = trigger_type
	),
	state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused', 'deleted')),
	version integer NOT NULL DEFAULT 1 CHECK (version > 0),
	next_run_at timestamptz,
	last_fired_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz,
	CONSTRAINT cycle_triggers_due_shape CHECK (
		next_run_at IS NULL
		OR (state = 'active' AND trigger_type IN ('schedule', 'relative'))
	),
	CONSTRAINT cycle_triggers_deleted_shape CHECK (
		(state = 'deleted' AND deleted_at IS NOT NULL)
		OR (state <> 'deleted' AND deleted_at IS NULL)
	)
);

CREATE TABLE public.cycle_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	cycle_id uuid NOT NULL REFERENCES public.cycles(id),
	cycle_version integer NOT NULL CHECK (cycle_version > 0),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE SET NULL,
	kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]*$'),
	trigger text NOT NULL CHECK (
		trigger IN ('schedule', 'event', 'threshold', 'relative', 'manual', 'catch_up')
	),
	trigger_id uuid REFERENCES public.cycle_triggers(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'queued'
		CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
	triggered_at timestamptz NOT NULL,
	scheduled_for timestamptz,
	occurrence_key text NOT NULL,
	idempotency_key text NOT NULL,
	definition_snapshot jsonb NOT NULL CHECK (jsonb_typeof(definition_snapshot) = 'object'),
	trigger_snapshot jsonb CHECK (trigger_snapshot IS NULL OR jsonb_typeof(trigger_snapshot) = 'object'),
	execution_input jsonb NOT NULL CHECK (jsonb_typeof(execution_input) = 'object'),
	delivery_intent jsonb NOT NULL CHECK (
		jsonb_typeof(delivery_intent) = 'object'
		AND delivery_intent->>'mode' IN ('evaluate', 'suppress')
		AND (
			delivery_intent->>'mode' = 'evaluate'
			OR btrim(COALESCE(delivery_intent->>'reason', '')) <> ''
		)
	),
	queue_job_record_id uuid REFERENCES public.queue_jobs(id) ON DELETE SET NULL,
	queue_job_id text,
	processing_token uuid,
	attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
	outcome jsonb,
	result jsonb,
	error_code text,
	error_message text,
	created_at timestamptz NOT NULL DEFAULT now(),
	queued_at timestamptz,
	started_at timestamptz,
	finished_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT cycle_runs_occurrence_nonempty CHECK (btrim(occurrence_key) <> ''),
	CONSTRAINT cycle_runs_idempotency_nonempty CHECK (btrim(idempotency_key) <> ''),
	CONSTRAINT cycle_runs_idempotency_unique UNIQUE (cycle_id, idempotency_key),
	CONSTRAINT cycle_runs_queue_job_unique UNIQUE (queue_job_record_id),
	CONSTRAINT cycle_runs_trigger_shape CHECK (
		(trigger IN ('manual', 'catch_up') AND trigger_id IS NULL)
		OR (trigger IN ('schedule', 'event', 'threshold', 'relative') AND trigger_id IS NOT NULL)
	),
	CONSTRAINT cycle_runs_outcome_shape CHECK (
		outcome IS NULL
		OR (
			jsonb_typeof(outcome) = 'object'
			AND outcome->>'status' IN ('no_change', 'artifact_created', 'attention_required', 'failed')
			AND outcome->>'attention_level' IN ('none', 'minor', 'decision', 'urgent')
			AND jsonb_typeof(outcome->'summary') = 'string'
			AND btrim(outcome->>'summary') <> ''
			AND jsonb_typeof(outcome->'artifact_refs') = 'array'
			AND (
				(outcome->>'status' = 'no_change' AND outcome->>'attention_level' = 'none')
				OR (
					outcome->>'status' = 'artifact_created'
					AND outcome->>'attention_level' IN ('none', 'minor')
				)
				OR (
					outcome->>'status' = 'attention_required'
					AND outcome->>'attention_level' IN ('decision', 'urgent')
				)
				OR outcome->>'status' = 'failed'
			)
		)
	)
);

ALTER TABLE public.cycles
	ADD CONSTRAINT cycles_last_run_id_fkey
	FOREIGN KEY (last_run_id) REFERENCES public.cycle_runs(id) ON DELETE SET NULL;

ALTER TABLE public.notification_events
	ADD COLUMN IF NOT EXISTS cycle_run_id uuid
	REFERENCES public.cycle_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX cycles_one_live_kind_target_idx
	ON public.cycles (user_id, kind, target_type, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
	WHERE deleted_at IS NULL;

CREATE INDEX cycles_user_updated_idx
	ON public.cycles (user_id, updated_at DESC)
	WHERE deleted_at IS NULL;

CREATE INDEX cycles_active_due_idx
	ON public.cycles (next_run_at, id)
	WHERE state = 'active' AND next_run_at IS NOT NULL;

CREATE INDEX cycle_triggers_active_due_idx
	ON public.cycle_triggers (next_run_at, id)
	WHERE state = 'active' AND next_run_at IS NOT NULL;

CREATE INDEX cycle_triggers_cycle_idx
	ON public.cycle_triggers (cycle_id, created_at)
	WHERE deleted_at IS NULL;

CREATE INDEX cycle_runs_user_history_idx
	ON public.cycle_runs (user_id, created_at DESC);

CREATE INDEX cycle_runs_cycle_history_idx
	ON public.cycle_runs (cycle_id, created_at DESC);

CREATE INDEX cycle_runs_project_history_idx
	ON public.cycle_runs (project_id, created_at DESC)
	WHERE project_id IS NOT NULL;

CREATE INDEX cycle_runs_active_idx
	ON public.cycle_runs (cycle_id, status)
	WHERE status IN ('queued', 'running');

CREATE INDEX notification_events_cycle_run_idx
	ON public.notification_events (cycle_run_id)
	WHERE cycle_run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_cycle_run_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF ROW(
		NEW.cycle_id,
		NEW.cycle_version,
		NEW.user_id,
		NEW.project_id,
		NEW.kind,
		NEW.trigger,
		NEW.trigger_id,
		NEW.triggered_at,
		NEW.scheduled_for,
		NEW.occurrence_key,
		NEW.idempotency_key,
		NEW.definition_snapshot,
		NEW.trigger_snapshot,
		NEW.execution_input,
		NEW.delivery_intent
	) IS DISTINCT FROM ROW(
		OLD.cycle_id,
		OLD.cycle_version,
		OLD.user_id,
		OLD.project_id,
		OLD.kind,
		OLD.trigger,
		OLD.trigger_id,
		OLD.triggered_at,
		OLD.scheduled_for,
		OLD.occurrence_key,
		OLD.idempotency_key,
		OLD.definition_snapshot,
		OLD.trigger_snapshot,
		OLD.execution_input,
		OLD.delivery_intent
	) THEN
		RAISE EXCEPTION 'cycle_run_identity_is_immutable' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$function$;

CREATE TRIGGER cycle_runs_identity_immutable
	BEFORE UPDATE ON public.cycle_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.prevent_cycle_run_identity_mutation();

CREATE OR REPLACE FUNCTION public.admit_cycle_run(
	p_cycle_id uuid,
	p_trigger text,
	p_occurrence_key text,
	p_execution_input jsonb,
	p_delivery_intent jsonb,
	p_trigger_id uuid DEFAULT NULL,
	p_triggered_at timestamptz DEFAULT now(),
	p_scheduled_for timestamptz DEFAULT NULL,
	p_next_trigger_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle public.cycles%ROWTYPE;
	v_trigger public.cycle_triggers%ROWTYPE;
	v_run public.cycle_runs%ROWTYPE;
	v_queue_job_record_id uuid;
	v_queue_job_id text;
	v_idempotency_key text;
	v_max_attempts integer;
	v_overlap text;
	v_actor_id uuid;
BEGIN
	IF btrim(COALESCE(p_occurrence_key, '')) = '' THEN
		RAISE EXCEPTION 'cycle_occurrence_key_required' USING ERRCODE = '22023';
	END IF;
	IF jsonb_typeof(p_execution_input) <> 'object' THEN
		RAISE EXCEPTION 'cycle_execution_input_must_be_object' USING ERRCODE = '22023';
	END IF;
	IF jsonb_typeof(p_delivery_intent) <> 'object'
		OR COALESCE(p_delivery_intent->>'mode', '') NOT IN ('evaluate', 'suppress')
		OR (
			p_delivery_intent->>'mode' = 'suppress'
			AND btrim(COALESCE(p_delivery_intent->>'reason', '')) = ''
		) THEN
		RAISE EXCEPTION 'cycle_delivery_intent_invalid' USING ERRCODE = '22023';
	END IF;

	v_idempotency_key := p_cycle_id::text || ':' || btrim(p_occurrence_key);

	SELECT * INTO v_run
	FROM public.cycle_runs
	WHERE cycle_id = p_cycle_id
		AND idempotency_key = v_idempotency_key;

	IF FOUND THEN
		IF v_run.trigger IS DISTINCT FROM p_trigger
			OR v_run.trigger_id IS DISTINCT FROM p_trigger_id
			OR v_run.scheduled_for IS DISTINCT FROM p_scheduled_for
			OR v_run.execution_input IS DISTINCT FROM p_execution_input
			OR v_run.delivery_intent IS DISTINCT FROM p_delivery_intent THEN
			RAISE EXCEPTION 'cycle_occurrence_conflict' USING ERRCODE = '22023';
		END IF;
		RETURN jsonb_build_object(
			'disposition', 'already_admitted',
			'cycle_run_id', v_run.id,
			'queue_job_record_id', v_run.queue_job_record_id,
			'queue_job_id', v_run.queue_job_id
		);
	END IF;

	SELECT * INTO v_cycle
	FROM public.cycles
	WHERE id = p_cycle_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
	END IF;
	-- Re-check after taking the Cycle lock. A competing coordinator may have
	-- admitted this occurrence while this transaction was waiting.
	SELECT * INTO v_run
	FROM public.cycle_runs
	WHERE cycle_id = p_cycle_id
		AND idempotency_key = v_idempotency_key;

	IF FOUND THEN
		IF v_run.trigger IS DISTINCT FROM p_trigger
			OR v_run.trigger_id IS DISTINCT FROM p_trigger_id
			OR v_run.scheduled_for IS DISTINCT FROM p_scheduled_for
			OR v_run.execution_input IS DISTINCT FROM p_execution_input
			OR v_run.delivery_intent IS DISTINCT FROM p_delivery_intent THEN
			RAISE EXCEPTION 'cycle_occurrence_conflict' USING ERRCODE = '22023';
		END IF;
		RETURN jsonb_build_object(
			'disposition', 'already_admitted',
			'cycle_run_id', v_run.id,
			'queue_job_record_id', v_run.queue_job_record_id,
			'queue_job_id', v_run.queue_job_id
		);
	END IF;
	IF v_cycle.state <> 'active' THEN
		RAISE EXCEPTION 'cycle_not_active' USING ERRCODE = '55000';
	END IF;
	IF v_cycle.project_id IS NOT NULL THEN
		v_actor_id := public.ensure_actor_for_user(v_cycle.user_id);
		IF NOT public.actor_has_project_member_access(v_actor_id, v_cycle.project_id, 'write') THEN
			RAISE EXCEPTION 'cycle_project_access_denied' USING ERRCODE = '42501';
		END IF;
	END IF;

	IF p_trigger NOT IN ('schedule', 'event', 'threshold', 'relative', 'manual', 'catch_up') THEN
		RAISE EXCEPTION 'cycle_trigger_invalid' USING ERRCODE = '22023';
	END IF;

	IF p_trigger IN ('manual', 'catch_up') THEN
		IF p_trigger_id IS NOT NULL THEN
			RAISE EXCEPTION 'manual_cycle_run_cannot_have_trigger_id' USING ERRCODE = '22023';
		END IF;
	ELSE
		SELECT * INTO v_trigger
		FROM public.cycle_triggers
		WHERE id = p_trigger_id
			AND cycle_id = p_cycle_id
			AND state = 'active'
		FOR UPDATE;

		IF NOT FOUND OR v_trigger.trigger_type <> p_trigger THEN
			RAISE EXCEPTION 'cycle_trigger_not_found_or_mismatched' USING ERRCODE = '22023';
		END IF;
	END IF;

	IF v_cycle.kind = 'daily_brief' AND (
		COALESCE(p_execution_input->>'brief_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
		OR btrim(COALESCE(p_execution_input->>'timezone', '')) = ''
		OR COALESCE(p_execution_input->>'mode', '') NOT IN ('scheduled', 'catch_up', 'manual', 'regenerate')
		OR COALESCE(jsonb_typeof(p_execution_input->'force_regenerate'), '') <> 'boolean'
	) THEN
		RAISE EXCEPTION 'daily_brief_cycle_input_invalid' USING ERRCODE = '22023';
	END IF;

	v_max_attempts := (v_cycle.policy->>'max_attempts')::integer;
	v_overlap := v_cycle.policy->>'overlap';

	IF v_overlap = 'skip' AND EXISTS (
		SELECT 1
		FROM public.cycle_runs active_run
		WHERE active_run.cycle_id = p_cycle_id
			AND active_run.status IN ('queued', 'running')
	) THEN
		INSERT INTO public.cycle_runs (
			cycle_id, cycle_version, user_id, project_id, kind,
			trigger, trigger_id, status, triggered_at, scheduled_for,
			occurrence_key, idempotency_key, definition_snapshot,
			trigger_snapshot, execution_input, delivery_intent,
			outcome, queued_at, finished_at
		) VALUES (
			v_cycle.id, v_cycle.version, v_cycle.user_id, v_cycle.project_id, v_cycle.kind,
			p_trigger, p_trigger_id, 'skipped', p_triggered_at, p_scheduled_for,
			btrim(p_occurrence_key), v_idempotency_key,
			jsonb_build_object(
				'kind', v_cycle.kind,
				'version', v_cycle.version,
				'target', jsonb_build_object('type', v_cycle.target_type, 'project_id', v_cycle.project_id),
				'config', v_cycle.config,
				'policy', v_cycle.policy,
				'attention_policy', v_cycle.attention_policy
			),
			CASE WHEN p_trigger_id IS NULL THEN NULL ELSE v_trigger.spec END,
			p_execution_input,
			p_delivery_intent,
			jsonb_build_object(
				'status', 'no_change',
				'attention_level', 'none',
				'summary', 'Skipped because a previous run is still active.',
				'artifact_refs', jsonb_build_array()
			),
			now(), now()
		)
		RETURNING * INTO v_run;
	ELSE
		INSERT INTO public.cycle_runs (
			cycle_id, cycle_version, user_id, project_id, kind,
			trigger, trigger_id, status, triggered_at, scheduled_for,
			occurrence_key, idempotency_key, definition_snapshot,
			trigger_snapshot, execution_input, delivery_intent, queued_at
		) VALUES (
			v_cycle.id, v_cycle.version, v_cycle.user_id, v_cycle.project_id, v_cycle.kind,
			p_trigger, p_trigger_id, 'queued', p_triggered_at, p_scheduled_for,
			btrim(p_occurrence_key), v_idempotency_key,
			jsonb_build_object(
				'kind', v_cycle.kind,
				'version', v_cycle.version,
				'target', jsonb_build_object('type', v_cycle.target_type, 'project_id', v_cycle.project_id),
				'config', v_cycle.config,
				'policy', v_cycle.policy,
				'attention_policy', v_cycle.attention_policy
			),
			CASE WHEN p_trigger_id IS NULL THEN NULL ELSE v_trigger.spec END,
			p_execution_input,
			p_delivery_intent,
			now()
		)
		RETURNING * INTO v_run;

		v_queue_job_record_id := public.add_queue_job(
			v_cycle.user_id,
			'run_cycle',
			jsonb_build_object(
				'cycle_id', v_cycle.id,
				'cycle_run_id', v_run.id,
				'kind', v_cycle.kind
			),
			10,
			now(),
			'cycle-run:' || v_run.id::text
		);

		UPDATE public.queue_jobs
		SET max_attempts = v_max_attempts
		WHERE id = v_queue_job_record_id
		RETURNING queue_job_id INTO v_queue_job_id;

		UPDATE public.cycle_runs
		SET queue_job_record_id = v_queue_job_record_id,
			queue_job_id = v_queue_job_id,
			updated_at = now()
		WHERE id = v_run.id
		RETURNING * INTO v_run;
	END IF;

	IF p_trigger_id IS NOT NULL THEN
		UPDATE public.cycle_triggers
		SET last_fired_at = p_triggered_at,
			next_run_at = p_next_trigger_at,
			version = version + 1,
			updated_at = now()
		WHERE id = p_trigger_id;
	END IF;

	UPDATE public.cycles cycle_row
	SET next_run_at = (
			SELECT min(trigger_row.next_run_at)
			FROM public.cycle_triggers trigger_row
			WHERE trigger_row.cycle_id = cycle_row.id
				AND trigger_row.state = 'active'
				AND trigger_row.next_run_at IS NOT NULL
		),
		updated_at = now()
	WHERE cycle_row.id = p_cycle_id;

	RETURN jsonb_build_object(
		'disposition', CASE WHEN v_run.status = 'skipped' THEN 'skipped_overlap' ELSE 'admitted' END,
		'cycle_run_id', v_run.id,
		'queue_job_record_id', v_run.queue_job_record_id,
		'queue_job_id', v_run.queue_job_id
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_cycle_run(
	p_cycle_run_id uuid,
	p_queue_job_record_id uuid,
	p_processing_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_run public.cycle_runs%ROWTYPE;
	v_queue public.queue_jobs%ROWTYPE;
BEGIN
	SELECT * INTO v_queue
	FROM public.queue_jobs
	WHERE id = p_queue_job_record_id
		AND job_type = 'run_cycle'::public.queue_type
		AND status = 'processing'::public.queue_status
		AND processing_token = p_processing_token
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_queue_claim_not_owned' USING ERRCODE = '55000';
	END IF;

	SELECT * INTO v_run
	FROM public.cycle_runs
	WHERE id = p_cycle_run_id
		AND queue_job_record_id = p_queue_job_record_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'cycle_run_not_found_for_queue_job' USING ERRCODE = 'P0002';
	END IF;

	IF v_run.status IN ('completed', 'failed', 'cancelled', 'skipped') THEN
		RETURN jsonb_build_object(
			'disposition', 'already_terminal',
			'run', to_jsonb(v_run)
		);
	END IF;

	UPDATE public.cycle_runs
	SET status = 'running',
		processing_token = p_processing_token,
		attempt_count = CASE
			WHEN processing_token = p_processing_token THEN attempt_count
			ELSE attempt_count + 1
		END,
		started_at = COALESCE(started_at, now()),
		error_code = NULL,
		error_message = NULL,
		updated_at = now()
	WHERE id = p_cycle_run_id
	RETURNING * INTO v_run;

	RETURN jsonb_build_object('disposition', 'claimed', 'run', to_jsonb(v_run));
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_cycle_run(
	p_cycle_run_id uuid,
	p_processing_token uuid,
	p_outcome jsonb,
	p_result jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle_id uuid;
BEGIN
	IF jsonb_typeof(p_outcome) <> 'object'
		OR p_outcome->>'status' NOT IN ('no_change', 'artifact_created', 'attention_required')
		OR p_outcome->>'attention_level' NOT IN ('none', 'minor', 'decision', 'urgent')
		OR jsonb_typeof(p_outcome->'summary') <> 'string'
		OR btrim(COALESCE(p_outcome->>'summary', '')) = ''
		OR jsonb_typeof(p_outcome->'artifact_refs') <> 'array'
		OR NOT (
			(p_outcome->>'status' = 'no_change' AND p_outcome->>'attention_level' = 'none')
			OR (
				p_outcome->>'status' = 'artifact_created'
				AND p_outcome->>'attention_level' IN ('none', 'minor')
			)
			OR (
				p_outcome->>'status' = 'attention_required'
				AND p_outcome->>'attention_level' IN ('decision', 'urgent')
			)
		) THEN
		RAISE EXCEPTION 'cycle_run_outcome_invalid' USING ERRCODE = '22023';
	END IF;

	UPDATE public.cycle_runs
	SET status = 'completed',
		outcome = p_outcome,
		result = p_result,
		processing_token = NULL,
		finished_at = now(),
		updated_at = now()
	WHERE id = p_cycle_run_id
		AND status = 'running'
		AND processing_token = p_processing_token
	RETURNING cycle_id INTO v_cycle_id;

	IF v_cycle_id IS NULL THEN
		IF EXISTS (
			SELECT 1 FROM public.cycle_runs
			WHERE id = p_cycle_run_id AND status = 'completed'
		) THEN
			RETURN true;
		END IF;
		RETURN false;
	END IF;

	UPDATE public.cycles
	SET last_run_at = now(),
		last_run_id = p_cycle_run_id,
		last_error = NULL,
		updated_at = now()
	WHERE id = v_cycle_id;

	RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_cycle_run(
	p_cycle_run_id uuid,
	p_processing_token uuid,
	p_error_code text,
	p_error_message text,
	p_terminal boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cycle_id uuid;
BEGIN
	UPDATE public.cycle_runs
	SET status = CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END,
		outcome = CASE WHEN p_terminal THEN jsonb_build_object(
			'status', 'failed',
			'attention_level', 'none',
			'summary', left(COALESCE(p_error_message, 'Cycle run failed.'), 500),
			'artifact_refs', jsonb_build_array()
		) ELSE NULL END,
		error_code = p_error_code,
		error_message = left(COALESCE(p_error_message, 'Unknown cycle error'), 4000),
		processing_token = NULL,
		finished_at = CASE WHEN p_terminal THEN now() ELSE NULL END,
		updated_at = now()
	WHERE id = p_cycle_run_id
		AND status = 'running'
		AND processing_token = p_processing_token
	RETURNING cycle_id INTO v_cycle_id;

	IF v_cycle_id IS NULL THEN
		RETURN false;
	END IF;

	UPDATE public.cycles
	SET last_error = left(COALESCE(p_error_message, 'Unknown cycle error'), 4000),
		updated_at = now()
	WHERE id = v_cycle_id;

	RETURN true;
END;
$function$;

ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cycles, public.cycle_triggers, public.cycle_runs
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cycles, public.cycle_triggers, public.cycle_runs
	TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cycles, public.cycle_triggers, public.cycle_runs
	TO service_role;

CREATE POLICY cycles_select_own
	ON public.cycles
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

CREATE POLICY cycle_triggers_select_own
	ON public.cycle_triggers
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.cycles cycle_row
			WHERE cycle_row.id = cycle_triggers.cycle_id
				AND cycle_row.user_id = (SELECT auth.uid())
		)
	);

CREATE POLICY cycle_runs_select_own
	ON public.cycle_runs
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION public.prevent_cycle_run_identity_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admit_cycle_run(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_cycle_run(uuid, uuid, uuid)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_cycle_run(uuid, uuid, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_cycle_run(uuid, uuid, text, text, boolean)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admit_cycle_run(uuid, text, text, jsonb, jsonb, uuid, timestamptz, timestamptz, timestamptz)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_cycle_run(uuid, uuid, uuid)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_cycle_run(uuid, uuid, jsonb, jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_cycle_run(uuid, uuid, text, text, boolean)
	TO service_role;

COMMENT ON TABLE public.cycles IS
	'Durable user intent for recurring agentic work. Queue rows are transport, not definitions.';
COMMENT ON TABLE public.cycle_runs IS
	'Immutable admitted Cycle occurrences. Queue retries execute the same run.';
COMMENT ON COLUMN public.notification_events.cycle_run_id IS
	'Optional recurring-work origin. Notifications do not control whether the Cycle executes.';
