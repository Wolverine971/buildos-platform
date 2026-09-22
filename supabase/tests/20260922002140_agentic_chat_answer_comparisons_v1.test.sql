-- supabase/tests/20260922002140_agentic_chat_answer_comparisons_v1.test.sql
-- Executable contract for the "Compare answers" lab storage: atomic create, packet binding,
-- candidate lock after votes, vote-before-reveal, sealed votes, owner scoping, service role.
INSERT INTO public.users (id) VALUES
	('10000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000002');
SET ROLE service_role;
DO $$
DECLARE
	v_owner uuid := '10000000-0000-4000-8000-000000000001';
	v_other uuid := '10000000-0000-4000-8000-000000000002';
	v_c1 uuid := '40000000-0000-4000-8000-000000000001';
	v_c2 uuid := '40000000-0000-4000-8000-000000000002';
	v_k1 uuid := '50000000-0000-4000-8000-000000000001';
	v_k2 uuid := '50000000-0000-4000-8000-000000000002';
	v_k3 uuid := '50000000-0000-4000-8000-000000000003';
	v_packet jsonb := jsonb_build_object(
		'version', 'answer_comparison_source_packet_v1',
		'question', 'What is the most important blocker?',
		'projectId', '20000000-0000-4000-8000-000000000001',
		'contextHash', repeat('c', 64),
		'requestHash', repeat('r', 64));
	v_packet_hash text;
	v_rubric jsonb := jsonb_build_object('version', 'answer_comparison_rubric_v1', 'requiredFacts', jsonb_build_array('Names the permit'));
	v_receipts jsonb := jsonb_build_object('version', 'answer_comparison_receipts_v1', 'costMicroUsd', 4100, 'latencyMs', 22500, 'modelCalls', 3, 'models', jsonb_build_array('m/a'), 'settled', true);
	v_run_identity jsonb := jsonb_build_object('version', 'answer_comparison_candidate_identity_v1', 'kind', 'workflow_run', 'name', 'Launch reviewer v1',
		'turnRunId', '60000000-0000-4000-8000-000000000001', 'contextHash', repeat('c', 64));
	v_manual_identity jsonb := jsonb_build_object('version', 'answer_comparison_candidate_identity_v1', 'kind', 'manual', 'name', 'Baseline', 'note', null);
	v_candidates jsonb;
	v_receipt jsonb;
	v_assignment jsonb;
	v_count integer;
	v_failed boolean;
BEGIN
	v_packet_hash := public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(v_packet));
	v_candidates := jsonb_build_array(
		jsonb_build_object('id', v_k1, 'identity', v_run_identity, 'answer', 'As the Launch reviewer: the permit.',
			'answerSha256', public.agentic_chat_sha256_hex_v1('As the Launch reviewer: the permit.'), 'receipts', v_receipts),
		jsonb_build_object('id', v_k2, 'identity', v_manual_identity, 'answer', 'The permit.',
			'answerSha256', public.agentic_chat_sha256_hex_v1('The permit.'), 'receipts',
			jsonb_build_object('version', 'answer_comparison_receipts_v1', 'costMicroUsd', null, 'latencyMs', null, 'modelCalls', null, 'models', jsonb_build_array(), 'settled', null)));

	-- Atomic create, idempotent on the client id for the same owner.
	v_receipt := public.create_answer_comparison_v1(v_owner, v_c1, 'Permit blocker', 'exploratory', v_packet, v_packet_hash, v_rubric, v_candidates);
	IF v_receipt->>'outcome' <> 'created' THEN RAISE EXCEPTION 'create expected created, got %', v_receipt; END IF;
	v_receipt := public.create_answer_comparison_v1(v_owner, v_c1, 'Permit blocker', 'exploratory', v_packet, v_packet_hash, v_rubric, v_candidates);
	IF v_receipt->>'outcome' <> 'exists' THEN RAISE EXCEPTION 'repeat create expected exists, got %', v_receipt; END IF;
	v_receipt := public.create_answer_comparison_v1(v_other, v_c1, 'Permit blocker', 'exploratory', v_packet, v_packet_hash, v_rubric, v_candidates);
	IF v_receipt->>'outcome' <> 'not_found' THEN RAISE EXCEPTION 'foreign id reuse expected not_found, got %', v_receipt; END IF;
	SELECT count(*) INTO v_count FROM public.agentic_chat_answer_comparison_candidates WHERE comparison_id = v_c1;
	IF v_count <> 2 THEN RAISE EXCEPTION 'expected 2 candidates, got %', v_count; END IF;

	-- The packet hash and the answer hash are checked by the database, not trusted from the caller.
	v_failed := false;
	BEGIN
		PERFORM public.create_answer_comparison_v1(v_owner, v_c2, 'Bad hash', 'exploratory', v_packet, repeat('0', 64), v_rubric, v_candidates);
	EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM = 'answer_comparison_invalid'; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'wrong packet hash must be rejected'; END IF;
	v_failed := false;
	BEGIN
		PERFORM public.add_answer_comparison_candidate_v1(v_owner, v_c1, jsonb_build_object('id', v_k3, 'identity', v_manual_identity,
			'answer', 'Tampered', 'answerSha256', repeat('0', 64), 'receipts', v_receipts));
	EXCEPTION WHEN check_violation THEN v_failed := true; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'wrong answer hash must be rejected'; END IF;

	-- A pilot-run candidate must answer from the packet's accepted context.
	v_failed := false;
	BEGIN
		PERFORM public.add_answer_comparison_candidate_v1(v_owner, v_c1, jsonb_build_object('id', v_k3,
			'identity', v_run_identity || jsonb_build_object('turnRunId', '60000000-0000-4000-8000-000000000002', 'contextHash', repeat('d', 64)),
			'answer', 'Other context', 'answerSha256', public.agentic_chat_sha256_hex_v1('Other context'), 'receipts', v_receipts));
	EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM = 'answer_comparison_candidate_context_mismatch'; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'context mismatch must be rejected'; END IF;
	-- A direct insert cannot bind a candidate to a different packet either.
	v_failed := false;
	BEGIN
		INSERT INTO public.agentic_chat_answer_comparison_candidates(id, comparison_id, user_id, position, identity, answer, answer_sha256, receipts, source_packet_sha256)
		VALUES (v_k3, v_c1, v_owner, 3, v_manual_identity, 'x', public.agentic_chat_sha256_hex_v1('x'), v_receipts, repeat('e', 64));
	EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM = 'answer_comparison_candidate_packet_mismatch'; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'packet mismatch must be rejected'; END IF;

	-- Reveal needs a vote; another owner cannot vote; a vote records the labels the reviewer saw.
	v_receipt := public.reveal_answer_comparison_v1(v_owner, v_c1);
	IF v_receipt->>'outcome' <> 'vote_required' THEN RAISE EXCEPTION 'reveal before vote expected vote_required, got %', v_receipt; END IF;
	v_assignment := jsonb_build_object('A', v_k2, 'B', v_k1);
	v_receipt := public.record_answer_comparison_vote_v1(v_other, v_c1, v_assignment, 'tie', NULL, 'Same.', '{}'::jsonb);
	IF v_receipt->>'outcome' <> 'not_found' THEN RAISE EXCEPTION 'foreign vote expected not_found, got %', v_receipt; END IF;
	v_receipt := public.record_answer_comparison_vote_v1(v_owner, v_c1, v_assignment, 'tie', NULL, 'Same.', '{}'::jsonb);
	IF v_receipt->>'outcome' <> 'voted' THEN RAISE EXCEPTION 'vote expected voted, got %', v_receipt; END IF;
	-- Unsealed votes can change.
	v_receipt := public.record_answer_comparison_vote_v1(v_owner, v_c1, v_assignment, 'candidate', v_k1, 'B names the permit.',
		jsonb_build_object(v_k1::text, jsonb_build_object('requiredFacts', 2, 'unsupportedClaims', 0, 'abstention', 'not_applicable')));
	IF v_receipt->>'outcome' <> 'voted' THEN RAISE EXCEPTION 're-vote expected voted, got %', v_receipt; END IF;
	-- Candidates lock once a vote exists.
	v_receipt := public.add_answer_comparison_candidate_v1(v_owner, v_c1, jsonb_build_object('id', v_k3, 'identity', v_manual_identity,
		'answer', 'Late', 'answerSha256', public.agentic_chat_sha256_hex_v1('Late'), 'receipts', v_receipts));
	IF v_receipt->>'outcome' <> 'locked' THEN RAISE EXCEPTION 'candidate after vote expected locked, got %', v_receipt; END IF;
	-- A preferred candidate must belong to the comparison.
	v_failed := false;
	BEGIN
		PERFORM public.record_answer_comparison_vote_v1(v_owner, v_c1, v_assignment, 'candidate', v_k3, 'Ghost.', '{}'::jsonb);
	EXCEPTION WHEN foreign_key_violation THEN v_failed := true; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'foreign candidate preference must be rejected'; END IF;

	-- Reveal seals the vote: nothing about it can change afterwards.
	v_receipt := public.reveal_answer_comparison_v1(v_owner, v_c1);
	IF v_receipt->>'outcome' <> 'revealed' THEN RAISE EXCEPTION 'reveal expected revealed, got %', v_receipt; END IF;
	v_receipt := public.reveal_answer_comparison_v1(v_owner, v_c1);
	IF v_receipt->>'outcome' <> 'revealed' THEN RAISE EXCEPTION 'repeat reveal expected revealed, got %', v_receipt; END IF;
	v_receipt := public.record_answer_comparison_vote_v1(v_owner, v_c1, v_assignment, 'tie', NULL, 'Changed my mind.', '{}'::jsonb);
	IF v_receipt->>'outcome' <> 'sealed' THEN RAISE EXCEPTION 'vote after reveal expected sealed, got %', v_receipt; END IF;
	v_failed := false;
	BEGIN
		UPDATE public.agentic_chat_answer_comparison_votes SET reason = 'Edited' WHERE comparison_id = v_c1 AND reviewer_user_id = v_owner;
	EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM = 'answer_comparison_vote_sealed'; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'sealed vote must be immutable'; END IF;
	SELECT count(*) INTO v_count FROM public.agentic_chat_answer_comparison_votes
	WHERE comparison_id = v_c1 AND reviewer_user_id = v_owner AND revealed_at IS NOT NULL AND choice = 'candidate' AND preferred_candidate_id = v_k1;
	IF v_count <> 1 THEN RAISE EXCEPTION 'sealed vote row missing'; END IF;

	-- A vote cannot be inserted already revealed, and needs two candidates.
	v_failed := false;
	BEGIN
		INSERT INTO public.agentic_chat_answer_comparisons(id, user_id, title, question, set_kind, source_packet, source_packet_sha256, rubric)
		VALUES (v_c2, v_owner, 'Single', v_packet->>'question', 'held_out', v_packet, v_packet_hash, v_rubric);
		INSERT INTO public.agentic_chat_answer_comparison_candidates(id, comparison_id, user_id, position, identity, answer, answer_sha256, receipts, source_packet_sha256)
		VALUES (v_k3, v_c2, v_owner, 1, v_manual_identity, 'Only one.', public.agentic_chat_sha256_hex_v1('Only one.'), v_receipts, v_packet_hash);
		PERFORM public.record_answer_comparison_vote_v1(v_owner, v_c2, jsonb_build_object('A', v_k3), 'neither', NULL, 'Nothing to compare.', '{}'::jsonb);
	EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM = 'answer_comparison_needs_two_candidates'; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'vote on one candidate must be rejected'; END IF;
	v_failed := false;
	BEGIN
		INSERT INTO public.agentic_chat_answer_comparison_votes(comparison_id, reviewer_user_id, label_assignment, choice, preferred_candidate_id, reason, rubric_scores, revealed_at)
		VALUES (v_c1, v_other, v_assignment, 'tie', NULL, 'Pre-sealed.', '{}'::jsonb, now());
	EXCEPTION WHEN OTHERS THEN v_failed := SQLERRM IN ('answer_comparison_reveal_before_vote', 'answer_comparison_not_found'); END;
	IF NOT v_failed THEN RAISE EXCEPTION 'pre-sealed vote must be rejected'; END IF;

	-- Non-service roles cannot call the write RPCs at all.
	v_failed := false;
	BEGIN
		EXECUTE 'SET LOCAL ROLE authenticated';
		PERFORM public.reveal_answer_comparison_v1(v_owner, v_c1);
	EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
	IF NOT v_failed THEN RAISE EXCEPTION 'authenticated role must not call comparison RPCs'; END IF;
END;
$$;
RESET ROLE;
SELECT 'answer_comparisons_v1_ok' AS result;
