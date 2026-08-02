-- supabase/migrations/20260801040300_question_tree_resilience.sql
-- Question Tree resilience pass:
-- - lower provider concurrency and increase the explorer completion budget
-- - record the v2 concise/repairable prompt contract
-- - allow one failed question node to be retried atomically

ALTER TABLE public.question_tree_runs
	ALTER COLUMN prompt_version SET DEFAULT 'question-tree-v2';

UPDATE public.question_tree_runs
SET config = jsonb_set(
		jsonb_set(
			config,
			'{concurrency}',
			to_jsonb(CASE WHEN model_policy = 'free_strict' THEN 2 ELSE 4 END),
			true
		),
		'{explorer_max_tokens}',
		'1300'::jsonb,
		true
	),
	prompt_version = 'question-tree-v2'
WHERE status NOT IN ('completed', 'cancelled');

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
		prompt_version,
		node_limit,
		config
	) VALUES (
		p_created_by,
		btrim(p_root_question),
		p_model_policy,
		v_explorer_model,
		v_synthesis_model,
		'question-tree-v2',
		p_node_limit,
		jsonb_build_object(
			'concurrency', CASE WHEN p_model_policy = 'free_strict' THEN 2 ELSE 4 END,
			'root_max_questions', 5,
			'node_max_questions', 3,
			'min_scheduler_score', 0.48,
			'max_cost_usd', 0.02,
			'explorer_max_tokens', 1300,
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

CREATE OR REPLACE FUNCTION public.retry_question_tree_node(
	p_run_id uuid,
	p_node_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.question_tree_runs;
	v_node public.question_tree_nodes;
	v_job_id uuid;
	v_next_sequence integer;
	v_failed_count integer;
BEGIN
	SELECT * INTO v_run
	FROM public.question_tree_runs
	WHERE id = p_run_id
	FOR UPDATE;

	IF v_run.id IS NULL THEN
		RAISE EXCEPTION 'question_tree_run_not_found';
	END IF;

	SELECT * INTO v_node
	FROM public.question_tree_nodes
	WHERE id = p_node_id AND run_id = p_run_id
	FOR UPDATE;

	IF v_node.id IS NULL THEN
		RAISE EXCEPTION 'question_tree_node_not_found';
	END IF;
	IF v_node.node_kind <> 'question' THEN
		RAISE EXCEPTION 'question_tree_root_cannot_retry';
	END IF;
	IF v_node.status <> 'failed' THEN
		RAISE EXCEPTION 'question_tree_node_cannot_retry';
	END IF;
	IF v_node.attempt_count >= 10 THEN
		RAISE EXCEPTION 'question_tree_node_retry_limit_reached';
	END IF;
	IF v_run.status = 'cancelled' THEN
		RAISE EXCEPTION 'question_tree_run_cancelled';
	END IF;

	UPDATE public.question_tree_nodes
	SET status = 'queued',
		answer = NULL,
		thesis = NULL,
		epistemic_assessment = NULL,
		confidence = NULL,
		stop_reason = NULL,
		model_requested = NULL,
		model_used = NULL,
		provider_request_id = NULL,
		prompt_tokens = 0,
		completion_tokens = 0,
		reasoning_tokens = 0,
		cost_usd = 0,
		latency_ms = 0,
		lease_owner = NULL,
		lease_expires_at = NULL,
		error_code = NULL,
		error_message = NULL,
		started_at = NULL,
		completed_at = NULL
	WHERE id = p_node_id;

	SELECT count(*) INTO v_failed_count
	FROM public.question_tree_nodes
	WHERE run_id = p_run_id AND node_kind = 'question' AND status = 'failed';

	IF v_run.phase = 'done' THEN
		UPDATE public.question_tree_nodes
		SET answer = NULL,
			thesis = NULL,
			stop_reason = NULL,
			model_requested = NULL,
			model_used = NULL,
			provider_request_id = NULL,
			prompt_tokens = 0,
			completion_tokens = 0,
			reasoning_tokens = 0,
			cost_usd = 0,
			latency_ms = 0,
			completed_at = NULL
		WHERE id = v_run.root_node_id;
	END IF;

	v_next_sequence := v_run.advance_sequence + 1;
	UPDATE public.question_tree_runs
	SET status = 'running',
		phase = 'explore',
		nodes_failed = v_failed_count,
		advance_sequence = v_next_sequence,
		synthesis = NULL,
		pause_reason = NULL,
		next_retry_at = NULL,
		completed_at = NULL
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

	INSERT INTO public.question_tree_events (run_id, node_id, seq, event_type, payload)
	VALUES (
		p_run_id,
		p_node_id,
		0,
		'node.retry_requested',
		jsonb_build_object(
			'node_number', v_node.node_number,
			'question', v_node.question,
			'previous_error', v_node.error_message,
			'attempt_count', v_node.attempt_count
		)
	);

	RETURN jsonb_build_object(
		'status', 'running',
		'phase', 'explore',
		'node_id', p_node_id,
		'node_status', 'queued',
		'advance_sequence', v_next_sequence,
		'job_id', v_job_id
	);
END;
$$;

REVOKE ALL ON FUNCTION public.retry_question_tree_node(uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_question_tree_node(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.retry_question_tree_node(uuid, uuid)
	IS 'Atomically requeues one failed Question Tree node and resumes exploration.';
