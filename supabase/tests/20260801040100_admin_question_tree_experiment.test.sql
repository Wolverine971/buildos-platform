-- supabase/tests/20260801040100_admin_question_tree_experiment.test.sql
-- Disposable-database verification for the admin Question Tree experiment.
-- Prerequisite: apply 20260801040000 through 20260801040300 in order.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

INSERT INTO auth.users (
	id,
	instance_id,
	aud,
	role,
	email,
	encrypted_password,
	email_confirmed_at,
	created_at,
	updated_at
) VALUES (
	'fa000000-0000-4000-8000-000000000001',
	'00000000-0000-0000-0000-000000000000',
	'authenticated',
	'authenticated',
	'question-tree-test@build-os.com',
	'',
	now(),
	now(),
	now()
) ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
	v_created jsonb;
	v_run_id uuid;
	v_root_id uuid;
	v_first_proposal uuid;
	v_second_proposal uuid;
	v_completed boolean;
	v_rejected boolean := false;
	v_other_created jsonb;
	v_other_run_id uuid;
	v_cross_run_rejected boolean := false;
	v_claimed integer;
	v_retry jsonb;
BEGIN
	v_created := public.create_question_tree_run_with_job(
		'fa000000-0000-4000-8000-000000000001',
		'What makes a research tree useful?',
		'paid_floor_strict',
		1,
		'{}'::jsonb
	);
	v_run_id := (v_created->'run'->>'id')::uuid;
	v_root_id := (v_created->'root_node'->>'id')::uuid;

	PERFORM pg_temp.assert_true(v_run_id IS NOT NULL, 'atomic create did not return a run');
	PERFORM pg_temp.assert_true(
		(SELECT count(*) = 1 FROM public.queue_jobs WHERE metadata->>'run_id' = v_run_id::text),
		'atomic create did not enqueue exactly one worker job'
	);

	UPDATE public.question_tree_runs SET status = 'running' WHERE id = v_run_id;
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 1
			FROM public.question_tree_events
			WHERE run_id = v_run_id
				AND node_id = v_root_id
				AND event_type = 'node.started'
		),
		'seed agent start was not recorded'
	);

	INSERT INTO public.question_tree_proposals (
		run_id, source_node_id, rank, question, normalized_question,
		purpose, target_claim, why_it_matters, expected_information_gain, model_priority
	) VALUES (
		v_run_id, v_root_id, 0, 'What evidence supports the thesis?',
		'what evidence supports the thesis', 'strengthen', 'The thesis',
		'Support would increase confidence.', 'high', 0.9
	) RETURNING id INTO v_first_proposal;

	INSERT INTO public.question_tree_proposals (
		run_id, source_node_id, rank, question, normalized_question,
		purpose, target_claim, why_it_matters, expected_information_gain, model_priority
	) VALUES (
		v_run_id, v_root_id, 1, 'What evidence disproves the thesis?',
		'what evidence disproves the thesis', 'falsify', 'The thesis',
		'A counterexample would reduce confidence.', 'high', 0.9
	) RETURNING id INTO v_second_proposal;

	UPDATE public.question_tree_runs SET phase = 'explore' WHERE id = v_run_id;
	PERFORM public.admit_question_tree_proposals(v_run_id, ARRAY[v_first_proposal, v_second_proposal]);

	PERFORM pg_temp.assert_true(
		(SELECT nodes_created = 1 FROM public.question_tree_runs WHERE id = v_run_id),
		'node limit was not enforced atomically'
	);
	PERFORM pg_temp.assert_true(
		(SELECT status = 'budget_exhausted' FROM public.question_tree_proposals WHERE id = v_second_proposal),
		'proposal beyond the node limit was not retained as budget_exhausted'
	);

	SELECT count(*) INTO v_claimed
	FROM public.claim_question_tree_batch(v_run_id, 'question-tree-test-worker', 1);
	PERFORM pg_temp.assert_true(v_claimed = 1, 'worker did not claim the admitted child node');
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 1
			FROM public.question_tree_events e
			JOIN public.question_tree_nodes n ON n.id = e.node_id
			WHERE e.run_id = v_run_id
				AND n.node_kind = 'question'
				AND e.event_type = 'node.started'
				AND e.payload->>'worker_id' = 'question-tree-test-worker'
		),
		'claimed node did not emit its durable started event'
	);

	UPDATE public.question_tree_nodes
	SET status = 'completed', answer = 'The child answer', completed_at = now()
	WHERE run_id = v_run_id AND node_kind = 'question';
	UPDATE public.question_tree_runs
	SET status = 'synthesizing', phase = 'synthesize', nodes_completed = 1
	WHERE id = v_run_id;
	v_completed := public.complete_question_tree_run(
		v_run_id,
		'{"finalAnswer":"The final answer","finalThesis":"The final thesis","keyFindings":[],"remainingUncertainties":[],"strongestDisconfirmingEvidence":[],"recommendedNextSteps":[]}'::jsonb,
		'{"model_requested":"test-model","model_used":"test-model","provider_request_id":"test-request","prompt_tokens":10,"completion_tokens":5,"reasoning_tokens":0,"cost_usd":0.0001,"latency_ms":20}'::jsonb,
		'{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost_usd":0.0001,"latency_ms":20}'::jsonb
	);
	PERFORM pg_temp.assert_true(v_completed, 'atomic completion rejected a synthesizing run');
	PERFORM pg_temp.assert_true(
		(SELECT status = 'completed' AND phase = 'done' FROM public.question_tree_runs WHERE id = v_run_id),
		'atomic completion did not finish the run'
	);
	PERFORM pg_temp.assert_true(
		(SELECT answer = 'The final answer' FROM public.question_tree_nodes WHERE id = v_root_id),
		'atomic completion did not write the root synthesis'
	);

	UPDATE public.question_tree_nodes
	SET status = 'failed', error_code = 'provider_error', error_message = 'Provider returned error'
	WHERE run_id = v_run_id AND node_kind = 'question';
	UPDATE public.question_tree_runs
	SET status = 'completed_partial', phase = 'done', nodes_completed = 0, nodes_failed = 1
	WHERE id = v_run_id;
	v_retry := public.retry_question_tree_node(
		v_run_id,
		(SELECT id FROM public.question_tree_nodes WHERE run_id = v_run_id AND node_kind = 'question')
	);
	PERFORM pg_temp.assert_true(
		(v_retry->>'node_status') = 'queued',
		'single-node retry did not return a queued node'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'queued' AND error_message IS NULL
			FROM public.question_tree_nodes
			WHERE run_id = v_run_id AND node_kind = 'question'
		),
		'single-node retry did not clear the failed node'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'running' AND phase = 'explore' AND nodes_failed = 0 AND synthesis IS NULL
			FROM public.question_tree_runs
			WHERE id = v_run_id
		),
		'single-node retry did not resume exploration cleanly'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 1
			FROM public.question_tree_events
			WHERE run_id = v_run_id
				AND event_type = 'node.retry_requested'
		),
		'single-node retry did not emit its durable event'
	);
	PERFORM pg_temp.assert_true(
		(SELECT answer IS NULL FROM public.question_tree_nodes WHERE id = v_root_id),
		'single-node retry did not clear the stale root synthesis'
	);

	BEGIN
		INSERT INTO public.question_tree_nodes (
			run_id, parent_node_id, node_kind, node_number, depth, sibling_index,
			status, question, normalized_question
		) VALUES (
			v_run_id, v_root_id, 'question', 101, 1, 2,
			'queued', 'This node must not exist', 'this node must not exist'
		);
	EXCEPTION WHEN check_violation THEN
		v_rejected := true;
	END;
	PERFORM pg_temp.assert_true(v_rejected, 'database accepted descendant node 101');

	v_other_created := public.create_question_tree_run_with_job(
		'fa000000-0000-4000-8000-000000000001',
		'Can a node point to a parent from another run?',
		'paid_floor_strict',
		1,
		'{}'::jsonb
	);
	v_other_run_id := (v_other_created->'run'->>'id')::uuid;
	BEGIN
		INSERT INTO public.question_tree_nodes (
			run_id, parent_node_id, node_kind, node_number, depth, sibling_index,
			status, question, normalized_question
		) VALUES (
			v_other_run_id, v_root_id, 'question', 1, 1, 0,
			'queued', 'This parent belongs to the wrong run', 'this parent belongs to the wrong run'
		);
	EXCEPTION WHEN foreign_key_violation THEN
		v_cross_run_rejected := true;
	END;
	PERFORM pg_temp.assert_true(
		v_cross_run_rejected,
		'database accepted a parent node from another run'
	);
	DELETE FROM public.question_tree_runs WHERE id = v_other_run_id;
	PERFORM pg_temp.assert_true(
		(SELECT count(*) = 0 FROM public.question_tree_nodes WHERE run_id = v_other_run_id),
		'deleting a run did not cascade to its root node'
	);
END;
$$;

ROLLBACK;
