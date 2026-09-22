-- supabase/migrations/20260922002140_agentic_chat_answer_comparisons_v1.sql
-- "Compare answers" lab: frozen questions, blind candidates, sealed votes, receipts.
-- Owner-scoped, service-role only, no model calls. Reuses the workflow v1 canonical
-- JSON, sha256, and service-role assertion helpers.
CREATE TABLE public.agentic_chat_answer_comparisons (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
 question text NOT NULL CHECK (length(question) BETWEEN 1 AND 8000),
 set_kind text NOT NULL CHECK (set_kind IN ('exploratory', 'held_out')),
 source_packet jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(source_packet) = 'object'
   AND source_packet->>'version' = 'answer_comparison_source_packet_v1'
   AND source_packet->>'question' = question, false)),
 source_packet_sha256 text NOT NULL CHECK (source_packet_sha256 = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(source_packet))),
 rubric jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(rubric) = 'object'
   AND rubric->>'version' = 'answer_comparison_rubric_v1'
   AND jsonb_typeof(rubric->'requiredFacts') = 'array', false)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(source_packet)) <= 32000),
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(rubric)) <= 8000)
);
CREATE INDEX idx_answer_comparisons_owner ON public.agentic_chat_answer_comparisons(user_id, created_at DESC);

CREATE TABLE public.agentic_chat_answer_comparison_candidates (
 id uuid PRIMARY KEY,
 comparison_id uuid NOT NULL,
 user_id uuid NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
 identity jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(identity) = 'object'
   AND identity->>'version' = 'answer_comparison_candidate_identity_v1'
   AND identity->>'kind' IN ('workflow_run', 'manual')
   AND length(identity->>'name') BETWEEN 1 AND 120, false)),
 answer text NOT NULL CHECK (length(answer) BETWEEN 1 AND 60000),
 answer_sha256 text NOT NULL CHECK (answer_sha256 = public.agentic_chat_sha256_hex_v1(answer)),
 receipts jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(receipts) = 'object'
   AND receipts->>'version' = 'answer_comparison_receipts_v1', false)),
 -- Binds the candidate to the frozen packet it answered. Checked against the parent by trigger.
 source_packet_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (comparison_id, position),
 UNIQUE (id, comparison_id),
 FOREIGN KEY (comparison_id, user_id) REFERENCES public.agentic_chat_answer_comparisons(id, user_id) ON DELETE CASCADE,
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(identity)) <= 8000),
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(receipts)) <= 4000)
);
CREATE INDEX idx_answer_comparison_candidates_comparison ON public.agentic_chat_answer_comparison_candidates(comparison_id, position);
-- One workflow run is one candidate at most once per comparison.
CREATE UNIQUE INDEX uq_answer_comparison_candidate_run ON public.agentic_chat_answer_comparison_candidates(comparison_id, (identity->>'turnRunId'))
 WHERE identity->>'kind' = 'workflow_run';

CREATE TABLE public.agentic_chat_answer_comparison_votes (
 comparison_id uuid NOT NULL,
 reviewer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 -- {"A": candidate_id, "B": candidate_id, ...}: exactly what this reviewer saw when voting.
 label_assignment jsonb NOT NULL CHECK (jsonb_typeof(label_assignment) = 'object'),
 choice text NOT NULL CHECK (choice IN ('candidate', 'tie', 'neither')),
 preferred_candidate_id uuid,
 reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 4000),
 -- {"<candidate_id>": {"requiredFacts": 0|1|2, "unsupportedClaims": 0|1|2, "abstention": ...}}
 rubric_scores jsonb NOT NULL CHECK (jsonb_typeof(rubric_scores) = 'object'),
 voted_at timestamptz NOT NULL DEFAULT now(),
 revealed_at timestamptz,
 PRIMARY KEY (comparison_id, reviewer_user_id),
 FOREIGN KEY (comparison_id) REFERENCES public.agentic_chat_answer_comparisons(id) ON DELETE CASCADE,
 FOREIGN KEY (preferred_candidate_id, comparison_id) REFERENCES public.agentic_chat_answer_comparison_candidates(id, comparison_id) ON DELETE CASCADE,
 CHECK ((choice = 'candidate') = (preferred_candidate_id IS NOT NULL)),
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(rubric_scores)) <= 4000)
);

ALTER TABLE public.agentic_chat_answer_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentic_chat_answer_comparison_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentic_chat_answer_comparison_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agentic_chat_answer_comparisons, public.agentic_chat_answer_comparison_candidates,
 public.agentic_chat_answer_comparison_votes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.agentic_chat_answer_comparisons TO service_role;
GRANT SELECT, INSERT ON public.agentic_chat_answer_comparison_candidates TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.agentic_chat_answer_comparison_votes TO service_role;

-- Candidates: bound to the frozen packet, at most 6, never after a vote exists, never updated.
CREATE FUNCTION public.guard_answer_comparison_candidate_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_comparison public.agentic_chat_answer_comparisons%ROWTYPE;
BEGIN
 IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'answer_comparison_candidate_immutable'; END IF;
 -- Row locks need UPDATE privilege, which service_role does not hold on comparisons.
 PERFORM pg_advisory_xact_lock(hashtextextended('answer-comparison:' || NEW.comparison_id::text, 0));
 SELECT * INTO v_comparison FROM public.agentic_chat_answer_comparisons
  WHERE id = NEW.comparison_id AND user_id = NEW.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'answer_comparison_not_found'; END IF;
 IF NEW.source_packet_sha256 <> v_comparison.source_packet_sha256 THEN
  RAISE EXCEPTION 'answer_comparison_candidate_packet_mismatch';
 END IF;
 IF NEW.identity->>'kind' = 'workflow_run'
  AND (NEW.identity->>'contextHash') IS DISTINCT FROM (v_comparison.source_packet->>'contextHash') THEN
  RAISE EXCEPTION 'answer_comparison_candidate_context_mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparison_votes v WHERE v.comparison_id = NEW.comparison_id) THEN
  RAISE EXCEPTION 'answer_comparison_locked_by_votes';
 END IF;
 IF (SELECT count(*) FROM public.agentic_chat_answer_comparison_candidates c WHERE c.comparison_id = NEW.comparison_id) >= 6 THEN
  RAISE EXCEPTION 'answer_comparison_candidate_limit';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_answer_comparison_candidate_v1 BEFORE INSERT OR UPDATE
 ON public.agentic_chat_answer_comparison_candidates FOR EACH ROW EXECUTE FUNCTION public.guard_answer_comparison_candidate_v1();

-- Votes: the reviewer must own the comparison; a sealed (revealed) vote never changes;
-- the only update after voting is to seal it, with the vote bytes unchanged.
CREATE FUNCTION public.guard_answer_comparison_vote_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparisons c
   WHERE c.id = NEW.comparison_id AND c.user_id = NEW.reviewer_user_id) THEN
  RAISE EXCEPTION 'answer_comparison_not_found';
 END IF;
 IF (SELECT count(*) FROM public.agentic_chat_answer_comparison_candidates c WHERE c.comparison_id = NEW.comparison_id) < 2 THEN
  RAISE EXCEPTION 'answer_comparison_needs_two_candidates';
 END IF;
 IF TG_OP = 'UPDATE' THEN
  IF OLD.revealed_at IS NOT NULL THEN RAISE EXCEPTION 'answer_comparison_vote_sealed'; END IF;
  IF NEW.revealed_at IS NOT NULL AND (
    NEW.label_assignment <> OLD.label_assignment OR NEW.choice <> OLD.choice
    OR NEW.preferred_candidate_id IS DISTINCT FROM OLD.preferred_candidate_id
    OR NEW.reason <> OLD.reason OR NEW.rubric_scores <> OLD.rubric_scores OR NEW.voted_at <> OLD.voted_at) THEN
   RAISE EXCEPTION 'answer_comparison_reveal_changes_vote';
  END IF;
 ELSIF NEW.revealed_at IS NOT NULL THEN
  RAISE EXCEPTION 'answer_comparison_reveal_before_vote';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_answer_comparison_vote_v1 BEFORE INSERT OR UPDATE
 ON public.agentic_chat_answer_comparison_votes FOR EACH ROW EXECUTE FUNCTION public.guard_answer_comparison_vote_v1();

-- Creates a comparison with its candidates atomically. Idempotent on p_id for the same owner.
CREATE FUNCTION public.create_answer_comparison_v1(
 p_user_id uuid, p_id uuid, p_title text, p_set_kind text, p_source_packet jsonb, p_source_packet_sha256 text,
 p_rubric jsonb, p_candidates jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_candidate jsonb; v_position integer := 0;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('answer_comparison');
 IF p_user_id IS NULL OR p_id IS NULL OR jsonb_typeof(p_candidates) <> 'array'
  OR jsonb_array_length(p_candidates) < 2 OR jsonb_array_length(p_candidates) > 6
  OR p_source_packet_sha256 IS DISTINCT FROM public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p_source_packet)) THEN
  RAISE EXCEPTION 'answer_comparison_invalid';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('answer-comparison:' || p_user_id::text, 0));
 IF EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparisons WHERE id = p_id AND user_id = p_user_id) THEN
  RETURN jsonb_build_object('outcome', 'exists', 'id', p_id);
 END IF;
 IF EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparisons WHERE id = p_id) THEN
  RETURN jsonb_build_object('outcome', 'not_found');
 END IF;
 IF (SELECT count(*) FROM public.agentic_chat_answer_comparisons WHERE user_id = p_user_id) >= 200 THEN
  RETURN jsonb_build_object('outcome', 'limit_reached');
 END IF;
 INSERT INTO public.agentic_chat_answer_comparisons(id, user_id, title, question, set_kind, source_packet, source_packet_sha256, rubric)
  VALUES (p_id, p_user_id, p_title, p_source_packet->>'question', p_set_kind, p_source_packet, p_source_packet_sha256, p_rubric);
 FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
  v_position := v_position + 1;
  INSERT INTO public.agentic_chat_answer_comparison_candidates(id, comparison_id, user_id, position, identity, answer, answer_sha256, receipts, source_packet_sha256)
   VALUES ((v_candidate->>'id')::uuid, p_id, p_user_id, v_position, v_candidate->'identity', v_candidate->>'answer',
     v_candidate->>'answerSha256', v_candidate->'receipts', p_source_packet_sha256);
 END LOOP;
 RETURN jsonb_build_object('outcome', 'created', 'id', p_id);
END;
$$;

CREATE FUNCTION public.add_answer_comparison_candidate_v1(
 p_user_id uuid, p_comparison_id uuid, p_candidate jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_comparison public.agentic_chat_answer_comparisons%ROWTYPE; v_position integer;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('answer_comparison');
 IF p_user_id IS NULL OR p_comparison_id IS NULL OR jsonb_typeof(p_candidate) <> 'object' THEN
  RAISE EXCEPTION 'answer_comparison_invalid';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('answer-comparison:' || p_comparison_id::text, 0));
 SELECT * INTO v_comparison FROM public.agentic_chat_answer_comparisons
  WHERE id = p_comparison_id AND user_id = p_user_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
 IF EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparison_votes v WHERE v.comparison_id = p_comparison_id) THEN
  RETURN jsonb_build_object('outcome', 'locked');
 END IF;
 SELECT COALESCE(max(position), 0) + 1 INTO v_position FROM public.agentic_chat_answer_comparison_candidates WHERE comparison_id = p_comparison_id;
 IF v_position > 6 THEN RETURN jsonb_build_object('outcome', 'limit_reached'); END IF;
 INSERT INTO public.agentic_chat_answer_comparison_candidates(id, comparison_id, user_id, position, identity, answer, answer_sha256, receipts, source_packet_sha256)
  VALUES ((p_candidate->>'id')::uuid, p_comparison_id, p_user_id, v_position, p_candidate->'identity', p_candidate->>'answer',
    p_candidate->>'answerSha256', p_candidate->'receipts', v_comparison.source_packet_sha256);
 RETURN jsonb_build_object('outcome', 'added', 'id', p_comparison_id);
END;
$$;

-- Records or replaces the reviewer's vote while unsealed. The label assignment is what the
-- reviewer saw; the server recomputes it deterministically and passes it here.
CREATE FUNCTION public.record_answer_comparison_vote_v1(
 p_user_id uuid, p_comparison_id uuid, p_label_assignment jsonb, p_choice text,
 p_preferred_candidate_id uuid, p_reason text, p_rubric_scores jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_existing public.agentic_chat_answer_comparison_votes%ROWTYPE;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('answer_comparison');
 IF p_user_id IS NULL OR p_comparison_id IS NULL THEN RAISE EXCEPTION 'answer_comparison_invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparisons WHERE id = p_comparison_id AND user_id = p_user_id) THEN
  RETURN jsonb_build_object('outcome', 'not_found');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('answer-comparison:' || p_comparison_id::text, 0));
 SELECT * INTO v_existing FROM public.agentic_chat_answer_comparison_votes
  WHERE comparison_id = p_comparison_id AND reviewer_user_id = p_user_id FOR UPDATE;
 IF FOUND AND v_existing.revealed_at IS NOT NULL THEN RETURN jsonb_build_object('outcome', 'sealed'); END IF;
 IF FOUND THEN
  UPDATE public.agentic_chat_answer_comparison_votes SET label_assignment = p_label_assignment, choice = p_choice,
   preferred_candidate_id = p_preferred_candidate_id, reason = p_reason, rubric_scores = p_rubric_scores, voted_at = now()
   WHERE comparison_id = p_comparison_id AND reviewer_user_id = p_user_id;
 ELSE
  INSERT INTO public.agentic_chat_answer_comparison_votes(comparison_id, reviewer_user_id, label_assignment, choice, preferred_candidate_id, reason, rubric_scores)
   VALUES (p_comparison_id, p_user_id, p_label_assignment, p_choice, p_preferred_candidate_id, p_reason, p_rubric_scores);
 END IF;
 RETURN jsonb_build_object('outcome', 'voted', 'id', p_comparison_id);
END;
$$;

-- Seals the reviewer's vote. Identities and receipts are disclosed only after this.
CREATE FUNCTION public.reveal_answer_comparison_v1(p_user_id uuid, p_comparison_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_existing public.agentic_chat_answer_comparison_votes%ROWTYPE;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('answer_comparison');
 IF p_user_id IS NULL OR p_comparison_id IS NULL THEN RAISE EXCEPTION 'answer_comparison_invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.agentic_chat_answer_comparisons WHERE id = p_comparison_id AND user_id = p_user_id) THEN
  RETURN jsonb_build_object('outcome', 'not_found');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('answer-comparison:' || p_comparison_id::text, 0));
 SELECT * INTO v_existing FROM public.agentic_chat_answer_comparison_votes
  WHERE comparison_id = p_comparison_id AND reviewer_user_id = p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'vote_required'); END IF;
 IF v_existing.revealed_at IS NOT NULL THEN RETURN jsonb_build_object('outcome', 'revealed', 'id', p_comparison_id); END IF;
 UPDATE public.agentic_chat_answer_comparison_votes SET revealed_at = now()
  WHERE comparison_id = p_comparison_id AND reviewer_user_id = p_user_id;
 RETURN jsonb_build_object('outcome', 'revealed', 'id', p_comparison_id);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_answer_comparison_candidate_v1(), public.guard_answer_comparison_vote_v1(),
 public.create_answer_comparison_v1(uuid, uuid, text, text, jsonb, text, jsonb, jsonb),
 public.add_answer_comparison_candidate_v1(uuid, uuid, jsonb),
 public.record_answer_comparison_vote_v1(uuid, uuid, jsonb, text, uuid, text, jsonb),
 public.reveal_answer_comparison_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_answer_comparison_candidate_v1(), public.guard_answer_comparison_vote_v1(),
 public.create_answer_comparison_v1(uuid, uuid, text, text, jsonb, text, jsonb, jsonb),
 public.add_answer_comparison_candidate_v1(uuid, uuid, jsonb),
 public.record_answer_comparison_vote_v1(uuid, uuid, jsonb, text, uuid, text, jsonb),
 public.reveal_answer_comparison_v1(uuid, uuid) TO service_role;
