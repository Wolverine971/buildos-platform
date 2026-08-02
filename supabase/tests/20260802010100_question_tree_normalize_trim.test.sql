-- supabase/tests/20260802010100_question_tree_normalize_trim.test.sql
-- Disposable-database verification for Question Tree normalization.

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
	'fa000000-0000-4000-8000-000000000002',
	'00000000-0000-0000-0000-000000000000',
	'authenticated',
	'authenticated',
	'question-tree-normalize-test@build-os.com',
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
	v_proposal_id uuid;
	v_admitted jsonb;
BEGIN
	PERFORM pg_temp.assert_true(
		public.question_tree_normalize_question('What evidence matters:') = 'what evidence matters',
		'normalization left trailing whitespace after punctuation replacement'
	);

	v_created := public.create_question_tree_run_with_job(
		'fa000000-0000-4000-8000-000000000002',
		'What evidence matters:',
		'paid_floor_strict',
		2,
		'{}'::jsonb
	);
	v_run_id := (v_created->'run'->>'id')::uuid;
	v_root_id := (v_created->'root_node'->>'id')::uuid;

	INSERT INTO public.question_tree_proposals (
		run_id,
		source_node_id,
		rank,
		question,
		normalized_question,
		purpose,
		target_claim,
		why_it_matters,
		expected_information_gain,
		model_priority
	) VALUES (
		v_run_id,
		v_root_id,
		0,
		'What evidence matters',
		'what evidence matters',
		'frame',
		'The root question',
		'This should be recognized as the root question.',
		'high',
		0.9
	) RETURNING id INTO v_proposal_id;

	UPDATE public.question_tree_runs
	SET status = 'running', phase = 'explore'
	WHERE id = v_run_id;

	v_admitted := public.admit_question_tree_proposals(v_run_id, ARRAY[v_proposal_id]);

	PERFORM pg_temp.assert_true(
		(v_admitted->>'admitted')::integer = 0,
		'root-equivalent proposal was admitted as a child node'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'duplicate' AND duplicate_of_node_id = v_root_id
			FROM public.question_tree_proposals
			WHERE id = v_proposal_id
		),
		'root-equivalent proposal was not marked duplicate of the root node'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 0
			FROM public.question_tree_nodes
			WHERE run_id = v_run_id
				AND node_kind = 'question'
		),
		'duplicate root-equivalent proposal spawned a question node'
	);
END;
$$;

ROLLBACK;
