-- supabase/migrations/20260801040100_admin_question_tree_experiment.sql
-- Admin Question Tree experiment.
-- Model calls are executed by the worker; these tables hold the durable run,
-- its visible tree, all proposed questions, and a compact event log.

CREATE TABLE public.question_tree_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
	root_node_id uuid,
	root_question text NOT NULL CHECK (char_length(btrim(root_question)) BETWEEN 3 AND 4000),
	status text NOT NULL DEFAULT 'queued' CHECK (
		status IN ('queued', 'running', 'paused', 'quota_paused', 'synthesizing', 'completed', 'completed_partial', 'cancelled', 'failed')
	),
	phase text NOT NULL DEFAULT 'seed' CHECK (phase IN ('seed', 'explore', 'synthesize', 'done')),
	model_policy text NOT NULL DEFAULT 'paid_floor_strict' CHECK (model_policy IN ('paid_floor_strict', 'free_strict')),
	explorer_model_requested text NOT NULL,
	synthesis_model_requested text NOT NULL,
	prompt_version text NOT NULL DEFAULT 'question-tree-v1',
	node_limit smallint NOT NULL DEFAULT 100 CHECK (node_limit BETWEEN 1 AND 100),
	nodes_created smallint NOT NULL DEFAULT 0 CHECK (nodes_created BETWEEN 0 AND 100),
	nodes_completed smallint NOT NULL DEFAULT 0 CHECK (nodes_completed BETWEEN 0 AND 100),
	nodes_failed smallint NOT NULL DEFAULT 0 CHECK (nodes_failed BETWEEN 0 AND 100),
	deepest_depth smallint NOT NULL DEFAULT 0 CHECK (deepest_depth BETWEEN 0 AND 100),
	frontier_count smallint NOT NULL DEFAULT 0 CHECK (frontier_count BETWEEN 0 AND 500),
	advance_sequence integer NOT NULL DEFAULT 0 CHECK (advance_sequence >= 0),
	max_provider_requests smallint NOT NULL DEFAULT 125 CHECK (max_provider_requests BETWEEN 3 AND 250),
	provider_requests smallint NOT NULL DEFAULT 0 CHECK (provider_requests BETWEEN 0 AND 250),
	config jsonb NOT NULL DEFAULT '{}'::jsonb,
	usage jsonb NOT NULL DEFAULT jsonb_build_object(
		'prompt_tokens', 0,
		'completion_tokens', 0,
		'total_tokens', 0,
		'cost_usd', 0,
		'latency_ms', 0
	),
	synthesis jsonb,
	pause_reason text,
	next_retry_at timestamptz,
	next_batch_not_before timestamptz,
	started_at timestamptz,
	completed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.question_tree_nodes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.question_tree_runs(id) ON DELETE CASCADE,
	parent_node_id uuid,
	node_kind text NOT NULL CHECK (node_kind IN ('root', 'question')),
	node_number smallint NOT NULL CHECK (node_number BETWEEN 0 AND 100),
	depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 100),
	sibling_index smallint CHECK (sibling_index BETWEEN 0 AND 4),
	status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
	question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 3 AND 4000),
	normalized_question text NOT NULL,
	answer text,
	thesis text,
	epistemic_assessment jsonb,
	confidence numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
	stop_reason text,
	model_requested text,
	model_used text,
	provider_request_id text,
	attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
	prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
	completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
	reasoning_tokens integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
	cost_usd numeric(12, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
	latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
	lease_owner text,
	lease_expires_at timestamptz,
	error_code text,
	error_message text,
	started_at timestamptz,
	completed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	search_document tsvector GENERATED ALWAYS AS (
		to_tsvector('english', coalesce(question, '') || ' ' || coalesce(answer, '') || ' ' || coalesce(thesis, ''))
	) STORED,
	CONSTRAINT question_tree_nodes_root_shape CHECK (
		(node_kind = 'root' AND node_number = 0 AND depth = 0 AND parent_node_id IS NULL AND sibling_index IS NULL)
		OR
		(node_kind = 'question' AND node_number BETWEEN 1 AND 100 AND depth >= 1 AND parent_node_id IS NOT NULL AND sibling_index IS NOT NULL)
	),
	UNIQUE (run_id, id),
	UNIQUE (run_id, node_number),
	UNIQUE (run_id, normalized_question),
	UNIQUE (run_id, parent_node_id, sibling_index),
	FOREIGN KEY (run_id, parent_node_id)
		REFERENCES public.question_tree_nodes(run_id, id) ON DELETE CASCADE
);

ALTER TABLE public.question_tree_runs
	ADD CONSTRAINT question_tree_runs_root_node_fk
	FOREIGN KEY (id, root_node_id)
	REFERENCES public.question_tree_nodes(run_id, id)
	DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.question_tree_proposals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.question_tree_runs(id) ON DELETE CASCADE,
	source_node_id uuid NOT NULL,
	rank smallint NOT NULL CHECK (rank BETWEEN 0 AND 4),
	question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 3 AND 4000),
	normalized_question text NOT NULL,
	purpose text NOT NULL CHECK (purpose IN ('strengthen', 'falsify', 'resolve_unknown', 'frame')),
	target_claim text,
	why_it_matters text NOT NULL DEFAULT '',
	expected_information_gain text NOT NULL CHECK (expected_information_gain IN ('low', 'medium', 'high')),
	model_priority numeric CHECK (model_priority IS NULL OR model_priority BETWEEN 0 AND 1),
	scheduler_score numeric,
	status text NOT NULL DEFAULT 'proposed' CHECK (
		status IN ('proposed', 'not_selected', 'spawned', 'duplicate', 'invalid', 'below_threshold', 'budget_exhausted', 'cancelled')
	),
	child_node_id uuid REFERENCES public.question_tree_nodes(id) ON DELETE SET NULL,
	duplicate_of_node_id uuid REFERENCES public.question_tree_nodes(id) ON DELETE SET NULL,
	validation_error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (source_node_id, rank),
	FOREIGN KEY (run_id, source_node_id)
		REFERENCES public.question_tree_nodes(run_id, id) ON DELETE CASCADE
);

CREATE TABLE public.question_tree_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.question_tree_runs(id) ON DELETE CASCADE,
	node_id uuid REFERENCES public.question_tree_nodes(id) ON DELETE CASCADE,
	seq bigint NOT NULL,
	event_type text NOT NULL,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (run_id, seq)
);

CREATE INDEX question_tree_runs_created_idx
	ON public.question_tree_runs(created_at DESC);
CREATE INDEX question_tree_nodes_parent_idx
	ON public.question_tree_nodes(run_id, parent_node_id, sibling_index);
CREATE INDEX question_tree_nodes_status_idx
	ON public.question_tree_nodes(run_id, status, node_number);
CREATE INDEX question_tree_nodes_depth_idx
	ON public.question_tree_nodes(run_id, depth, status);
CREATE INDEX question_tree_nodes_search_idx
	ON public.question_tree_nodes USING gin(search_document);
CREATE INDEX question_tree_proposals_frontier_idx
	ON public.question_tree_proposals(run_id, status, scheduler_score DESC NULLS LAST, created_at);
CREATE INDEX question_tree_events_run_idx
	ON public.question_tree_events(run_id, seq);

CREATE TRIGGER question_tree_runs_set_updated_at
	BEFORE UPDATE ON public.question_tree_runs
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER question_tree_nodes_set_updated_at
	BEFORE UPDATE ON public.question_tree_nodes
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER question_tree_proposals_set_updated_at
	BEFORE UPDATE ON public.question_tree_proposals
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.question_tree_normalize_question(p_question text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
	SELECT regexp_replace(
		regexp_replace(lower(btrim(p_question)), '[?!.]+$', ''),
		'[^a-z0-9]+',
		' ',
		'g'
	);
$$;

CREATE OR REPLACE FUNCTION public.question_tree_assign_event_seq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.run_id::text, 0));
	SELECT coalesce(max(seq), 0) + 1
	INTO NEW.seq
	FROM public.question_tree_events
	WHERE run_id = NEW.run_id;
	RETURN NEW;
END;
$$;

CREATE TRIGGER question_tree_events_assign_seq
	BEFORE INSERT ON public.question_tree_events
	FOR EACH ROW EXECUTE FUNCTION public.question_tree_assign_event_seq();

CREATE OR REPLACE FUNCTION public.create_question_tree_run_with_job(
	p_created_by uuid,
	p_root_question text,
	p_model_policy text DEFAULT 'paid_floor_strict',
	p_node_limit integer DEFAULT 100,
	p_config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.question_tree_runs;
	v_root public.question_tree_nodes;
	v_job_id uuid;
	v_explorer_model text;
	v_synthesis_model text;
BEGIN
	IF p_created_by IS NULL OR char_length(btrim(coalesce(p_root_question, ''))) NOT BETWEEN 3 AND 4000 THEN
		RAISE EXCEPTION 'invalid_question_tree_input';
	END IF;
	IF p_model_policy NOT IN ('paid_floor_strict', 'free_strict') THEN
		RAISE EXCEPTION 'invalid_question_tree_model_policy';
	END IF;
	IF p_node_limit NOT BETWEEN 1 AND 100 THEN
		RAISE EXCEPTION 'invalid_question_tree_node_limit';
	END IF;

	v_explorer_model := CASE
		WHEN p_model_policy = 'free_strict' THEN 'inclusionai/ling-3.0-flash:free'
		ELSE 'inclusionai/ling-2.6-flash'
	END;
	v_synthesis_model := v_explorer_model;

	INSERT INTO public.question_tree_runs (
		created_by,
		root_question,
		model_policy,
		explorer_model_requested,
		synthesis_model_requested,
		node_limit,
		config
	) VALUES (
		p_created_by,
		btrim(p_root_question),
		p_model_policy,
		v_explorer_model,
		v_synthesis_model,
		p_node_limit,
		jsonb_build_object(
			'concurrency', 10,
			'root_max_questions', 5,
			'node_max_questions', 3,
			'min_scheduler_score', 0.48,
			'max_cost_usd', 0.02,
			'explorer_max_tokens', 900,
			'synthesis_max_tokens', 1800
		) || coalesce(p_config, '{}'::jsonb)
	)
	RETURNING * INTO v_run;

	INSERT INTO public.question_tree_nodes (
		run_id,
		node_kind,
		node_number,
		depth,
		status,
		question,
		normalized_question
	) VALUES (
		v_run.id,
		'root',
		0,
		0,
		'completed',
		v_run.root_question,
		public.question_tree_normalize_question(v_run.root_question)
	)
	RETURNING * INTO v_root;

	UPDATE public.question_tree_runs
	SET root_node_id = v_root.id
	WHERE id = v_run.id;

	INSERT INTO public.question_tree_events (run_id, node_id, seq, event_type, payload)
	VALUES (
		v_run.id,
		v_root.id,
		0,
		'run.created',
		jsonb_build_object('question', v_run.root_question, 'node_limit', v_run.node_limit)
	);

	v_job_id := public.add_queue_job(
		p_user_id := p_created_by,
		p_job_type := 'admin_question_tree',
		p_metadata := jsonb_build_object('run_id', v_run.id, 'advance_sequence', 0),
		p_priority := 7,
		p_scheduled_for := now(),
		p_dedup_key := 'question-tree:' || v_run.id::text || ':advance:0'
	);

	RETURN jsonb_build_object(
		'run', (SELECT to_jsonb(r) FROM public.question_tree_runs r WHERE r.id = v_run.id),
		'root_node', to_jsonb(v_root),
		'job_id', v_job_id
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_question_tree_advance(
	p_run_id uuid,
	p_expected_sequence integer,
	p_scheduled_for timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.question_tree_runs;
	v_next_sequence integer;
	v_job_id uuid;
BEGIN
	SELECT * INTO v_run
	FROM public.question_tree_runs
	WHERE id = p_run_id
	FOR UPDATE;

	IF v_run.id IS NULL THEN
		RAISE EXCEPTION 'question_tree_run_not_found';
	END IF;
	IF v_run.status IN ('completed', 'completed_partial', 'cancelled', 'failed', 'paused', 'quota_paused') THEN
		RETURN jsonb_build_object('enqueued', false, 'reason', v_run.status, 'advance_sequence', v_run.advance_sequence);
	END IF;
	IF v_run.advance_sequence <> p_expected_sequence THEN
		RETURN jsonb_build_object('enqueued', false, 'reason', 'stale_sequence', 'advance_sequence', v_run.advance_sequence);
	END IF;

	v_next_sequence := v_run.advance_sequence + 1;
	UPDATE public.question_tree_runs
	SET advance_sequence = v_next_sequence
	WHERE id = p_run_id;

	v_job_id := public.add_queue_job(
		p_user_id := v_run.created_by,
		p_job_type := 'admin_question_tree',
		p_metadata := jsonb_build_object('run_id', p_run_id, 'advance_sequence', v_next_sequence),
		p_priority := 7,
		p_scheduled_for := p_scheduled_for,
		p_dedup_key := 'question-tree:' || p_run_id::text || ':advance:' || v_next_sequence::text
	);

	RETURN jsonb_build_object('enqueued', true, 'job_id', v_job_id, 'advance_sequence', v_next_sequence);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_question_tree_batch(
	p_run_id uuid,
	p_worker_id text,
	p_limit integer DEFAULT 10
)
RETURNS SETOF public.question_tree_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF p_limit NOT BETWEEN 1 AND 10 THEN
		RAISE EXCEPTION 'invalid_question_tree_batch_limit';
	END IF;

	RETURN QUERY
	WITH candidates AS (
		SELECT n.id
		FROM public.question_tree_nodes n
		JOIN public.question_tree_runs r ON r.id = n.run_id
		WHERE n.run_id = p_run_id
			AND r.status IN ('queued', 'running')
			AND r.phase = 'explore'
			AND (
				n.status = 'queued'
				OR (n.status = 'running' AND n.lease_expires_at < now())
			)
		ORDER BY n.node_number
		FOR UPDATE OF n SKIP LOCKED
		LIMIT p_limit
	), updated AS (
		UPDATE public.question_tree_nodes n
		SET status = 'running',
			lease_owner = p_worker_id,
			lease_expires_at = now() + interval '5 minutes',
			attempt_count = n.attempt_count + 1,
			started_at = coalesce(n.started_at, now()),
			error_code = NULL,
			error_message = NULL
		FROM candidates c
		WHERE n.id = c.id
		RETURNING n.*
	)
	SELECT * FROM updated ORDER BY node_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.admit_question_tree_proposals(
	p_run_id uuid,
	p_proposal_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.question_tree_runs;
	v_proposal public.question_tree_proposals;
	v_source public.question_tree_nodes;
	v_child public.question_tree_nodes;
	v_nodes_created integer;
	v_admitted integer := 0;
	v_proposal_id uuid;
BEGIN
	SELECT * INTO v_run
	FROM public.question_tree_runs
	WHERE id = p_run_id
	FOR UPDATE;

	IF v_run.id IS NULL THEN
		RAISE EXCEPTION 'question_tree_run_not_found';
	END IF;
	IF v_run.status NOT IN ('queued', 'running') OR v_run.phase <> 'explore' THEN
		RETURN jsonb_build_object('admitted', 0, 'reason', 'run_not_exploring');
	END IF;

	v_nodes_created := v_run.nodes_created;

	FOREACH v_proposal_id IN ARRAY coalesce(p_proposal_ids, ARRAY[]::uuid[])
	LOOP
		SELECT * INTO v_proposal
		FROM public.question_tree_proposals
		WHERE id = v_proposal_id
			AND run_id = p_run_id
			AND status IN ('proposed', 'not_selected')
		FOR UPDATE;

		IF v_proposal.id IS NULL THEN
			CONTINUE;
		END IF;

		IF v_nodes_created >= v_run.node_limit THEN
			UPDATE public.question_tree_proposals
			SET status = 'budget_exhausted'
			WHERE id = v_proposal.id;
			CONTINUE;
		END IF;

		SELECT * INTO v_source
		FROM public.question_tree_nodes
		WHERE id = v_proposal.source_node_id AND run_id = p_run_id;

		BEGIN
			v_nodes_created := v_nodes_created + 1;
			INSERT INTO public.question_tree_nodes (
				run_id,
				parent_node_id,
				node_kind,
				node_number,
				depth,
				sibling_index,
				status,
				question,
				normalized_question,
				model_requested
			) VALUES (
				p_run_id,
				v_source.id,
				'question',
				v_nodes_created,
				v_source.depth + 1,
				v_proposal.rank,
				'queued',
				v_proposal.question,
				v_proposal.normalized_question,
				v_run.explorer_model_requested
			)
			RETURNING * INTO v_child;

			UPDATE public.question_tree_proposals
			SET status = 'spawned', child_node_id = v_child.id
			WHERE id = v_proposal.id;

			INSERT INTO public.question_tree_events (run_id, node_id, seq, event_type, payload)
			VALUES (
				p_run_id,
				v_child.id,
				0,
				'proposal.spawned',
				jsonb_build_object('proposal_id', v_proposal.id, 'node_number', v_child.node_number, 'parent_node_id', v_source.id)
			);

			v_admitted := v_admitted + 1;
		EXCEPTION WHEN unique_violation THEN
			v_nodes_created := v_nodes_created - 1;
			UPDATE public.question_tree_proposals p
			SET status = 'duplicate',
				duplicate_of_node_id = (
					SELECT n.id
					FROM public.question_tree_nodes n
					WHERE n.run_id = p_run_id
						AND n.normalized_question = p.normalized_question
					LIMIT 1
				)
			WHERE p.id = v_proposal.id;
		END;
	END LOOP;

	UPDATE public.question_tree_runs
	SET nodes_created = v_nodes_created,
		deepest_depth = greatest(
			deepest_depth,
			coalesce((SELECT max(depth) FROM public.question_tree_nodes WHERE run_id = p_run_id), 0)
		),
		frontier_count = (
			SELECT count(*)
			FROM public.question_tree_proposals
			WHERE run_id = p_run_id AND status IN ('proposed', 'not_selected')
		),
		status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
		started_at = coalesce(started_at, now())
	WHERE id = p_run_id;

	RETURN jsonb_build_object('admitted', v_admitted, 'nodes_created', v_nodes_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.control_question_tree_run(
	p_run_id uuid,
	p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.question_tree_runs;
	v_job_id uuid;
	v_next_sequence integer;
BEGIN
	SELECT * INTO v_run
	FROM public.question_tree_runs
	WHERE id = p_run_id
	FOR UPDATE;

	IF v_run.id IS NULL THEN
		RAISE EXCEPTION 'question_tree_run_not_found';
	END IF;

	IF p_action = 'pause' THEN
		IF v_run.status NOT IN ('queued', 'running', 'quota_paused', 'synthesizing') THEN
			RAISE EXCEPTION 'question_tree_run_cannot_pause';
		END IF;
		UPDATE public.question_tree_runs
		SET status = 'paused', pause_reason = 'Paused by admin'
		WHERE id = p_run_id;
	ELSIF p_action = 'cancel' THEN
		IF v_run.status IN ('completed', 'completed_partial', 'cancelled') THEN
			RETURN jsonb_build_object('status', v_run.status, 'advance_sequence', v_run.advance_sequence);
		END IF;
		UPDATE public.question_tree_runs
		SET status = 'cancelled', phase = 'done', pause_reason = 'Cancelled by admin', completed_at = now()
		WHERE id = p_run_id;
		UPDATE public.question_tree_nodes
		SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL
		WHERE run_id = p_run_id AND status IN ('queued', 'running');
		UPDATE public.question_tree_proposals
		SET status = 'cancelled'
		WHERE run_id = p_run_id AND status IN ('proposed', 'not_selected');
		UPDATE public.queue_jobs
		SET status = 'cancelled', completed_at = now(), error_message = 'Question Tree run cancelled'
		WHERE job_type = 'admin_question_tree'::public.queue_type
			AND metadata->>'run_id' = p_run_id::text
			AND status IN ('pending', 'retrying');
	ELSIF p_action IN ('resume', 'retry') THEN
		IF p_action = 'resume' AND v_run.status NOT IN ('paused', 'quota_paused') THEN
			RAISE EXCEPTION 'question_tree_run_cannot_resume';
		END IF;
		IF p_action = 'retry' AND v_run.status NOT IN ('failed', 'completed_partial') THEN
			RAISE EXCEPTION 'question_tree_run_cannot_retry';
		END IF;

		IF p_action = 'retry' OR (p_action = 'resume' AND v_run.status = 'quota_paused') THEN
			UPDATE public.question_tree_nodes
			SET status = 'queued', error_code = NULL, error_message = NULL, lease_owner = NULL, lease_expires_at = NULL
			WHERE run_id = p_run_id AND node_kind = 'question' AND status = 'failed';
			UPDATE public.question_tree_runs
			SET nodes_failed = 0
			WHERE id = p_run_id;
		END IF;

		IF p_action = 'retry' THEN
			UPDATE public.question_tree_runs
			SET phase = CASE
					WHEN nodes_created = 0 AND frontier_count = 0 THEN 'seed'
					WHEN phase = 'done' THEN 'explore'
					ELSE phase
				END,
				nodes_failed = 0
			WHERE id = p_run_id;
		END IF;

		v_next_sequence := v_run.advance_sequence + 1;
		UPDATE public.question_tree_runs
		SET status = 'running', pause_reason = NULL, next_retry_at = NULL, advance_sequence = v_next_sequence, completed_at = NULL
		WHERE id = p_run_id;

		v_job_id := public.add_queue_job(
			p_user_id := v_run.created_by,
			p_job_type := 'admin_question_tree',
			p_metadata := jsonb_build_object('run_id', p_run_id, 'advance_sequence', v_next_sequence),
			p_priority := 7,
			p_scheduled_for := CASE
				WHEN v_run.model_policy = 'free_strict' AND v_run.next_batch_not_before > now()
					THEN v_run.next_batch_not_before
				ELSE now()
			END,
			p_dedup_key := 'question-tree:' || p_run_id::text || ':advance:' || v_next_sequence::text
		);
	ELSE
		RAISE EXCEPTION 'invalid_question_tree_control_action';
	END IF;

	INSERT INTO public.question_tree_events (run_id, seq, event_type, payload)
	VALUES (p_run_id, 0, 'run.' || p_action, jsonb_build_object('action', p_action));

	RETURN (
		SELECT jsonb_build_object('status', status, 'phase', phase, 'advance_sequence', advance_sequence, 'job_id', v_job_id)
		FROM public.question_tree_runs
		WHERE id = p_run_id
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_question_tree_run(
	p_run_id uuid,
	p_synthesis jsonb,
	p_telemetry jsonb,
	p_usage jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.question_tree_runs;
	v_final_status text;
BEGIN
	SELECT * INTO v_run
	FROM public.question_tree_runs
	WHERE id = p_run_id
	FOR UPDATE;

	IF v_run.id IS NULL THEN
		RAISE EXCEPTION 'question_tree_run_not_found';
	END IF;
	IF v_run.status <> 'synthesizing' OR v_run.phase <> 'synthesize' THEN
		RETURN false;
	END IF;

	v_final_status := CASE WHEN v_run.nodes_failed > 0 THEN 'completed_partial' ELSE 'completed' END;

	UPDATE public.question_tree_nodes
	SET answer = p_synthesis->>'finalAnswer',
		thesis = p_synthesis->>'finalThesis',
		stop_reason = 'Final synthesis completed.',
		model_requested = p_telemetry->>'model_requested',
		model_used = p_telemetry->>'model_used',
		provider_request_id = p_telemetry->>'provider_request_id',
		prompt_tokens = coalesce((p_telemetry->>'prompt_tokens')::integer, 0),
		completion_tokens = coalesce((p_telemetry->>'completion_tokens')::integer, 0),
		reasoning_tokens = coalesce((p_telemetry->>'reasoning_tokens')::integer, 0),
		cost_usd = coalesce((p_telemetry->>'cost_usd')::numeric, 0),
		latency_ms = coalesce((p_telemetry->>'latency_ms')::integer, 0),
		completed_at = now()
	WHERE id = v_run.root_node_id;

	UPDATE public.question_tree_runs
	SET status = v_final_status,
		phase = 'done',
		synthesis = p_synthesis,
		provider_requests = provider_requests + 1,
		usage = p_usage,
		completed_at = now(),
		pause_reason = NULL
	WHERE id = p_run_id;

	INSERT INTO public.question_tree_events (run_id, node_id, seq, event_type, payload)
	VALUES (
		p_run_id,
		v_run.root_node_id,
		0,
		'run.completed',
		jsonb_build_object('status', v_final_status, 'cost_usd', p_usage->'cost_usd')
	);

	RETURN true;
END;
$$;

ALTER TABLE public.question_tree_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_tree_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_tree_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_tree_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY question_tree_runs_admin_select
	ON public.question_tree_runs FOR SELECT TO authenticated
	USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY question_tree_nodes_admin_select
	ON public.question_tree_nodes FOR SELECT TO authenticated
	USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY question_tree_proposals_admin_select
	ON public.question_tree_proposals FOR SELECT TO authenticated
	USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY question_tree_events_admin_select
	ON public.question_tree_events FOR SELECT TO authenticated
	USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

CREATE POLICY question_tree_runs_service_role
	ON public.question_tree_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY question_tree_nodes_service_role
	ON public.question_tree_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY question_tree_proposals_service_role
	ON public.question_tree_proposals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY question_tree_events_service_role
	ON public.question_tree_events FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.question_tree_runs TO authenticated;
GRANT SELECT ON public.question_tree_nodes TO authenticated;
GRANT SELECT ON public.question_tree_proposals TO authenticated;
GRANT SELECT ON public.question_tree_events TO authenticated;
GRANT ALL ON public.question_tree_runs TO service_role;
GRANT ALL ON public.question_tree_nodes TO service_role;
GRANT ALL ON public.question_tree_proposals TO service_role;
GRANT ALL ON public.question_tree_events TO service_role;

REVOKE ALL ON FUNCTION public.create_question_tree_run_with_job(uuid, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_question_tree_advance(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_question_tree_batch(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admit_question_tree_proposals(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.control_question_tree_run(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_question_tree_run(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_question_tree_run_with_job(uuid, text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_question_tree_advance(uuid, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_question_tree_batch(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admit_question_tree_proposals(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.control_question_tree_run(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_question_tree_run(uuid, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON TABLE public.question_tree_runs IS 'Admin-only model question-tree experiments.';
COMMENT ON TABLE public.question_tree_proposals IS 'Every model-proposed follow-up, including questions the scheduler does not spawn.';
