-- supabase/migrations/20260724020000_gmail_relevance_review_evaluation.sql
-- Gmail relevance Phase A, Slice 4: content-free sampling and human adjudication.
--
-- Gmail metadata remains request-lifetime only in the web application. These tables persist
-- opaque source references, fixed evidence booleans, bounded decisions, and aggregate inputs;
-- they cannot store mailbox content or free-form reviewer text.

BEGIN;

CREATE TABLE public.email_relevance_review_samples (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	connection_scope_id uuid NOT NULL
		REFERENCES public.email_relevance_scan_connections(id) ON DELETE CASCADE,
	source_observation_id uuid NOT NULL,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	profile_version_id uuid NOT NULL
		REFERENCES public.email_project_profile_versions(id) ON DELETE RESTRICT,
	candidate_a_id uuid,
	candidate_b_id uuid,
	sampling_version text NOT NULL DEFAULT 'email-relevance-review-sampling-v1' CHECK (
		sampling_version = 'email-relevance-review-sampling-v1'
	),
	sampling_stratum text NOT NULL CHECK (sampling_stratum IN ('none', 'a_only', 'b_only', 'both')),
	sample_key_hash text NOT NULL CHECK (sample_key_hash ~ '^[a-f0-9]{64}$'),
	sample_order smallint NOT NULL CHECK (sample_order BETWEEN 1 AND 100),
	stratum_population_size integer NOT NULL CHECK (stratum_population_size > 0),
	stratum_sample_size integer NOT NULL CHECK (stratum_sample_size > 0),
	sampling_weight numeric(12,6) NOT NULL CHECK (sampling_weight >= 1),
	a_score smallint CHECK (a_score BETWEEN 0 AND 100),
	a_confidence numeric(5,4) CHECK (a_confidence BETWEEN 0 AND 1),
	a_confirmed_thread boolean NOT NULL DEFAULT false,
	a_explicit_rule boolean NOT NULL DEFAULT false,
	a_actor_overlap boolean NOT NULL DEFAULT false,
	a_domain_overlap boolean NOT NULL DEFAULT false,
	a_artifact_overlap boolean NOT NULL DEFAULT false,
	a_identifier_overlap boolean NOT NULL DEFAULT false,
	a_lexical_overlap boolean NOT NULL DEFAULT false,
	a_negative_evidence boolean NOT NULL DEFAULT false,
	b_score smallint CHECK (b_score BETWEEN 0 AND 100),
	b_confidence numeric(5,4) CHECK (b_confidence BETWEEN 0 AND 1),
	b_confirmed_thread boolean NOT NULL DEFAULT false,
	b_explicit_rule boolean NOT NULL DEFAULT false,
	b_actor_overlap boolean NOT NULL DEFAULT false,
	b_domain_overlap boolean NOT NULL DEFAULT false,
	b_artifact_overlap boolean NOT NULL DEFAULT false,
	b_identifier_overlap boolean NOT NULL DEFAULT false,
	b_lexical_overlap boolean NOT NULL DEFAULT false,
	b_negative_evidence boolean NOT NULL DEFAULT false,
	state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'reviewed', 'expired')),
	source_retention_expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	reviewed_at timestamptz,
	UNIQUE (run_id, source_observation_id, project_id),
	UNIQUE (run_id, connection_scope_id, sample_order),
	CHECK (
		(sampling_stratum = 'none' AND candidate_a_id IS NULL AND candidate_b_id IS NULL)
		OR (sampling_stratum = 'a_only' AND candidate_a_id IS NOT NULL AND candidate_b_id IS NULL)
		OR (sampling_stratum = 'b_only' AND candidate_a_id IS NULL AND candidate_b_id IS NOT NULL)
		OR (sampling_stratum = 'both' AND candidate_a_id IS NOT NULL AND candidate_b_id IS NOT NULL)
	),
	CHECK ((candidate_a_id IS NULL) = (a_score IS NULL AND a_confidence IS NULL)),
	CHECK ((candidate_b_id IS NULL) = (b_score IS NULL AND b_confidence IS NULL)),
	CHECK (
		(state = 'pending' AND reviewed_at IS NULL)
		OR (state = 'reviewed' AND reviewed_at IS NOT NULL)
		OR (state = 'expired' AND reviewed_at IS NULL)
	),
	CHECK (source_retention_expires_at > created_at)
);

CREATE INDEX email_relevance_review_samples_queue_idx
	ON public.email_relevance_review_samples (user_id, run_id, state, connection_scope_id, sample_order);
CREATE INDEX email_relevance_review_samples_source_retention_idx
	ON public.email_relevance_review_samples (source_retention_expires_at)
	WHERE state = 'pending';

CREATE TABLE public.email_relevance_adjudications (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	sample_id uuid NOT NULL UNIQUE
		REFERENCES public.email_relevance_review_samples(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	reviewer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
	decision text NOT NULL CHECK (decision IN (
		'correct_project',
		'wrong_project',
		'relevant_missing_project',
		'not_project_relevant',
		'ambiguous'
	)),
	correction_reason text CHECK (correction_reason IS NULL OR correction_reason IN (
		'wrong_actor',
		'wrong_domain',
		'wrong_artifact',
		'wrong_identifier',
		'lexical_false_positive',
		'negative_signal_missed',
		'missing_profile_signal',
		'cross_project_ambiguity',
		'insufficient_metadata'
	)),
	-- Validated against the run's captured project set by the adjudication RPC. This remains an
	-- opaque historical reference instead of an FK so later project deletion cannot rewrite an
	-- immutable human decision or block account/project cleanup.
	corrected_project_id uuid,
	rule_proposal text CHECK (rule_proposal IS NULL OR rule_proposal IN (
		'always_sender', 'always_domain', 'always_thread',
		'never_sender', 'never_domain', 'never_thread'
	)),
	variant_blinded boolean NOT NULL DEFAULT true CHECK (variant_blinded = true),
	review_contract_version text NOT NULL DEFAULT 'email-relevance-review-contract-v1' CHECK (
		review_contract_version = 'email-relevance-review-contract-v1'
	),
	idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
	decision_hash text NOT NULL CHECK (decision_hash ~ '^[a-f0-9]{64}$'),
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK (
		(decision = 'correct_project' AND correction_reason IS NULL AND corrected_project_id IS NULL)
		OR (
			decision = 'wrong_project'
			AND correction_reason IS NOT NULL
			AND corrected_project_id IS NOT NULL
		)
		OR (
			decision = 'relevant_missing_project'
			AND correction_reason IS NOT NULL
			AND corrected_project_id IS NOT NULL
		)
		OR (
			decision = 'not_project_relevant'
			AND correction_reason IS NOT NULL
			AND corrected_project_id IS NULL
		)
		OR (
			decision = 'ambiguous'
			AND correction_reason IN ('cross_project_ambiguity', 'insufficient_metadata')
			AND corrected_project_id IS NULL
		)
	)
);

CREATE INDEX email_relevance_adjudications_run_idx
	ON public.email_relevance_adjudications (user_id, run_id, created_at);

CREATE OR REPLACE FUNCTION public.prepare_email_relevance_review_sample(
	p_user_id uuid,
	p_run_id uuid,
	p_target_per_scope integer DEFAULT 100
)
RETURNS TABLE(total_samples integer, scope_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	run_record public.email_relevance_scan_runs%ROWTYPE;
BEGIN
	IF p_target_per_scope <> 100 THEN
		RAISE EXCEPTION 'email_relevance_review_invalid_sample_target'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO run_record
	FROM public.email_relevance_scan_runs
	WHERE id = p_run_id AND user_id = p_user_id;
	IF NOT FOUND OR run_record.state <> 'completed' THEN
		RAISE EXCEPTION 'email_relevance_review_run_unavailable'
			USING ERRCODE = 'no_data_found';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.email_relevance_scan_connections scope
		LEFT JOIN LATERAL (
			SELECT count(*) AS pair_count
			FROM public.email_relevance_message_observations observation
			CROSS JOIN public.email_relevance_scan_projects project
			WHERE observation.connection_scope_id = scope.id
				AND observation.user_id = p_user_id
				AND observation.run_id = p_run_id
				AND observation.processing_state = 'processed'
				AND observation.retention_expires_at > now()
				AND project.run_id = p_run_id
				AND project.invalidated_at IS NULL
		) available ON true
		WHERE scope.run_id = p_run_id
			AND available.pair_count < p_target_per_scope
	) THEN
		RAISE EXCEPTION 'email_relevance_review_insufficient_source_rows'
			USING ERRCODE = 'check_violation';
	END IF;

	WITH candidate_rollup AS (
		SELECT
			candidate.observation_id,
			candidate.project_id,
			(array_agg(candidate.id ORDER BY candidate.id) FILTER (WHERE candidate.variant = 'a'))[1]
				AS candidate_a_id,
			(array_agg(candidate.id ORDER BY candidate.id) FILTER (WHERE candidate.variant = 'b'))[1]
				AS candidate_b_id,
			max(candidate.score) FILTER (WHERE candidate.variant = 'a') AS a_score,
			max(candidate.confidence) FILTER (WHERE candidate.variant = 'a') AS a_confidence,
			coalesce(bool_or(candidate.confirmed_thread) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_confirmed_thread,
			coalesce(bool_or(candidate.explicit_rule) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_explicit_rule,
			coalesce(bool_or(candidate.actor_overlap) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_actor_overlap,
			coalesce(bool_or(candidate.domain_overlap) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_domain_overlap,
			coalesce(bool_or(candidate.artifact_overlap) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_artifact_overlap,
			coalesce(bool_or(candidate.identifier_overlap) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_identifier_overlap,
			coalesce(bool_or(candidate.lexical_overlap) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_lexical_overlap,
			coalesce(bool_or(candidate.negative_evidence) FILTER (WHERE candidate.variant = 'a'), false)
				AS a_negative_evidence,
			max(candidate.score) FILTER (WHERE candidate.variant = 'b') AS b_score,
			max(candidate.confidence) FILTER (WHERE candidate.variant = 'b') AS b_confidence,
			coalesce(bool_or(candidate.confirmed_thread) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_confirmed_thread,
			coalesce(bool_or(candidate.explicit_rule) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_explicit_rule,
			coalesce(bool_or(candidate.actor_overlap) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_actor_overlap,
			coalesce(bool_or(candidate.domain_overlap) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_domain_overlap,
			coalesce(bool_or(candidate.artifact_overlap) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_artifact_overlap,
			coalesce(bool_or(candidate.identifier_overlap) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_identifier_overlap,
			coalesce(bool_or(candidate.lexical_overlap) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_lexical_overlap,
			coalesce(bool_or(candidate.negative_evidence) FILTER (WHERE candidate.variant = 'b'), false)
				AS b_negative_evidence
		FROM public.email_relevance_project_candidates candidate
		JOIN public.email_relevance_message_observations observation
			ON observation.id = candidate.observation_id
		WHERE candidate.user_id = p_user_id
			AND observation.run_id = p_run_id
			AND candidate.candidate_state = 'suggested'
			AND candidate.retention_expires_at > now()
		GROUP BY candidate.observation_id, candidate.project_id
	), pairs AS (
		SELECT
			observation.id AS source_observation_id,
			observation.connection_scope_id,
			observation.retention_expires_at AS source_retention_expires_at,
			project.project_id,
			profile_version.id AS profile_version_id,
			rollup.candidate_a_id,
			rollup.candidate_b_id,
			rollup.a_score,
			rollup.a_confidence,
			rollup.a_confirmed_thread,
			rollup.a_explicit_rule,
			rollup.a_actor_overlap,
			rollup.a_domain_overlap,
			rollup.a_artifact_overlap,
			rollup.a_identifier_overlap,
			rollup.a_lexical_overlap,
			rollup.a_negative_evidence,
			rollup.b_score,
			rollup.b_confidence,
			rollup.b_confirmed_thread,
			rollup.b_explicit_rule,
			rollup.b_actor_overlap,
			rollup.b_domain_overlap,
			rollup.b_artifact_overlap,
			rollup.b_identifier_overlap,
			rollup.b_lexical_overlap,
			rollup.b_negative_evidence,
			CASE
				WHEN rollup.candidate_a_id IS NOT NULL AND rollup.candidate_b_id IS NOT NULL THEN 'both'
				WHEN rollup.candidate_a_id IS NOT NULL THEN 'a_only'
				WHEN rollup.candidate_b_id IS NOT NULL THEN 'b_only'
				ELSE 'none'
			END AS sampling_stratum,
			md5(
				'0:email-relevance-review-sampling-v1:' || p_run_id::text || ':' ||
				observation.connection_scope_id::text || ':' || observation.id::text || ':' ||
				project.project_id::text
			) || md5(
				'1:email-relevance-review-sampling-v1:' || p_run_id::text || ':' ||
				observation.connection_scope_id::text || ':' || observation.id::text || ':' ||
				project.project_id::text
			) AS sample_key_hash
		FROM public.email_relevance_message_observations observation
		CROSS JOIN public.email_relevance_scan_projects project
		JOIN public.email_project_profile_versions profile_version
			ON profile_version.profile_id = project.profile_id
			AND profile_version.profile_version = project.profile_version
		LEFT JOIN candidate_rollup rollup
			ON rollup.observation_id = observation.id
			AND rollup.project_id = project.project_id
		WHERE observation.user_id = p_user_id
			AND observation.run_id = p_run_id
			AND observation.processing_state = 'processed'
			AND observation.retention_expires_at > now()
			AND project.run_id = p_run_id
			AND project.invalidated_at IS NULL
	), ranked AS (
		SELECT pairs.*,
			count(*) OVER (PARTITION BY connection_scope_id, sampling_stratum)
				AS stratum_population_size,
			row_number() OVER (
				PARTITION BY connection_scope_id, sampling_stratum
				ORDER BY sample_key_hash
			) AS stratum_rank
		FROM pairs
	), initial_selection AS (
		SELECT * FROM ranked WHERE stratum_rank <= 25
	), initial_counts AS (
		SELECT connection_scope_id, count(*) AS selected_count
		FROM initial_selection
		GROUP BY connection_scope_id
	), fill_ranked AS (
		SELECT ranked.*,
			row_number() OVER (
				PARTITION BY ranked.connection_scope_id
				ORDER BY ranked.sample_key_hash
			) AS fill_rank
		FROM ranked
		WHERE NOT EXISTS (
			SELECT 1 FROM initial_selection initial
			WHERE initial.source_observation_id = ranked.source_observation_id
				AND initial.project_id = ranked.project_id
		)
	), selected AS (
		SELECT initial_selection.*, 0::bigint AS fill_rank FROM initial_selection
		UNION ALL
		SELECT fill_ranked.*
		FROM fill_ranked
		JOIN initial_counts USING (connection_scope_id)
		WHERE fill_rank <= p_target_per_scope - initial_counts.selected_count
	), selected_with_counts AS (
		SELECT selected.*,
			count(*) OVER (PARTITION BY connection_scope_id, sampling_stratum)
				AS stratum_sample_size,
			row_number() OVER (
				PARTITION BY connection_scope_id
				ORDER BY sample_key_hash
			) AS sample_order
		FROM selected
	)
	INSERT INTO public.email_relevance_review_samples (
		user_id, run_id, connection_scope_id, source_observation_id, project_id,
		profile_version_id, candidate_a_id, candidate_b_id, sampling_stratum,
		sample_key_hash, sample_order, stratum_population_size, stratum_sample_size,
		sampling_weight,
		a_score, a_confidence, a_confirmed_thread, a_explicit_rule, a_actor_overlap,
		a_domain_overlap, a_artifact_overlap, a_identifier_overlap, a_lexical_overlap,
		a_negative_evidence,
		b_score, b_confidence, b_confirmed_thread, b_explicit_rule, b_actor_overlap,
		b_domain_overlap, b_artifact_overlap, b_identifier_overlap, b_lexical_overlap,
		b_negative_evidence, source_retention_expires_at
	)
	SELECT
		p_user_id, p_run_id, connection_scope_id, source_observation_id, project_id,
		profile_version_id, candidate_a_id, candidate_b_id, sampling_stratum,
		sample_key_hash, sample_order, stratum_population_size, stratum_sample_size,
		stratum_population_size::numeric / stratum_sample_size::numeric,
		a_score, a_confidence, coalesce(a_confirmed_thread, false), coalesce(a_explicit_rule, false),
		coalesce(a_actor_overlap, false), coalesce(a_domain_overlap, false),
		coalesce(a_artifact_overlap, false), coalesce(a_identifier_overlap, false),
		coalesce(a_lexical_overlap, false), coalesce(a_negative_evidence, false),
		b_score, b_confidence, coalesce(b_confirmed_thread, false), coalesce(b_explicit_rule, false),
		coalesce(b_actor_overlap, false), coalesce(b_domain_overlap, false),
		coalesce(b_artifact_overlap, false), coalesce(b_identifier_overlap, false),
		coalesce(b_lexical_overlap, false), coalesce(b_negative_evidence, false),
		source_retention_expires_at
	FROM selected_with_counts
	ON CONFLICT (run_id, source_observation_id, project_id) DO NOTHING;

	IF EXISTS (
		SELECT 1
		FROM public.email_relevance_scan_connections scope
		LEFT JOIN public.email_relevance_review_samples sample
			ON sample.connection_scope_id = scope.id AND sample.run_id = p_run_id
		WHERE scope.run_id = p_run_id
		GROUP BY scope.id
		HAVING count(sample.id) <> p_target_per_scope
	) THEN
		RAISE EXCEPTION 'email_relevance_review_sample_incomplete'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN QUERY
	SELECT count(*)::integer, count(DISTINCT sample.connection_scope_id)::integer
	FROM public.email_relevance_review_samples sample
	WHERE sample.run_id = p_run_id AND sample.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_email_relevance_adjudication(
	p_user_id uuid,
	p_run_id uuid,
	p_sample_id uuid,
	p_reviewer_user_id uuid,
	p_decision text,
	p_correction_reason text,
	p_corrected_project_id uuid,
	p_rule_proposal text,
	p_idempotency_key_hash text,
	p_decision_hash text
)
RETURNS TABLE(adjudication_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	sample_record public.email_relevance_review_samples%ROWTYPE;
	existing_record public.email_relevance_adjudications%ROWTYPE;
	inserted_id uuid;
BEGIN
	IF p_reviewer_user_id <> p_user_id
		OR p_idempotency_key_hash !~ '^[a-f0-9]{64}$'
		OR p_decision_hash !~ '^[a-f0-9]{64}$'
	THEN
		RAISE EXCEPTION 'email_relevance_review_invalid_adjudication'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO sample_record
	FROM public.email_relevance_review_samples
	WHERE id = p_sample_id AND user_id = p_user_id AND run_id = p_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_review_sample_unavailable'
			USING ERRCODE = 'no_data_found';
	END IF;

	SELECT * INTO existing_record
	FROM public.email_relevance_adjudications
	WHERE sample_id = p_sample_id;
	IF FOUND THEN
		IF existing_record.idempotency_key_hash = p_idempotency_key_hash
			AND existing_record.decision_hash = p_decision_hash
		THEN
			RETURN QUERY SELECT existing_record.id, true;
			RETURN;
		END IF;
		RAISE EXCEPTION 'email_relevance_review_idempotency_conflict'
			USING ERRCODE = 'unique_violation';
	END IF;

	IF sample_record.state <> 'pending' OR sample_record.source_retention_expires_at <= now() THEN
		RAISE EXCEPTION 'email_relevance_review_sample_unavailable'
			USING ERRCODE = 'no_data_found';
	END IF;

	IF p_corrected_project_id IS NOT NULL AND (
		p_corrected_project_id = sample_record.project_id
		OR NOT EXISTS (
			SELECT 1 FROM public.email_relevance_scan_projects selected
			WHERE selected.run_id = p_run_id
				AND selected.project_id = p_corrected_project_id
				AND selected.invalidated_at IS NULL
		)
	) THEN
		RAISE EXCEPTION 'email_relevance_review_corrected_project_unavailable'
			USING ERRCODE = 'foreign_key_violation';
	END IF;

	INSERT INTO public.email_relevance_adjudications (
		sample_id, user_id, run_id, reviewer_user_id, decision, correction_reason,
		corrected_project_id, rule_proposal, idempotency_key_hash, decision_hash
	) VALUES (
		p_sample_id, p_user_id, p_run_id, p_reviewer_user_id, p_decision,
		p_correction_reason, p_corrected_project_id, p_rule_proposal,
		p_idempotency_key_hash, p_decision_hash
	)
	RETURNING id INTO inserted_id;

	UPDATE public.email_relevance_review_samples
	SET state = 'reviewed', reviewed_at = now()
	WHERE id = p_sample_id;

	RETURN QUERY SELECT inserted_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_email_relevance_review_samples(
	p_user_id uuid,
	p_run_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	updated_count integer;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM public.email_relevance_scan_runs
		WHERE id = p_run_id AND user_id = p_user_id
	) THEN
		RAISE EXCEPTION 'email_relevance_review_run_unavailable'
			USING ERRCODE = 'no_data_found';
	END IF;
	UPDATE public.email_relevance_review_samples
	SET state = 'expired'
	WHERE user_id = p_user_id
		AND run_id = p_run_id
		AND state = 'pending'
		AND source_retention_expires_at <= now();
	GET DIAGNOSTICS updated_count = ROW_COUNT;
	RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_email_relevance_adjudication_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	RAISE EXCEPTION 'email_relevance_adjudication_immutable'
		USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_email_relevance_review_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	UPDATE public.email_relevance_review_samples
	SET state = 'expired'
	WHERE source_observation_id = OLD.id
		AND state = 'pending'
		AND EXISTS (
			SELECT 1 FROM public.users owner
			WHERE owner.id = email_relevance_review_samples.user_id
		);
	RETURN OLD;
END;
$$;

CREATE TRIGGER email_relevance_review_source_deleted
	BEFORE DELETE ON public.email_relevance_message_observations
	FOR EACH ROW EXECUTE FUNCTION public.expire_email_relevance_review_source();

CREATE TRIGGER email_relevance_adjudications_immutable
	BEFORE UPDATE ON public.email_relevance_adjudications
	FOR EACH ROW EXECUTE FUNCTION public.reject_email_relevance_adjudication_mutation();

ALTER TABLE public.email_relevance_review_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_relevance_adjudications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_relevance_review_samples FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_relevance_adjudications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.email_relevance_review_samples TO service_role;
GRANT SELECT ON TABLE public.email_relevance_adjudications TO service_role;

CREATE POLICY email_relevance_review_samples_service_role_select
	ON public.email_relevance_review_samples FOR SELECT TO service_role
	USING (true);
CREATE POLICY email_relevance_adjudications_service_role_select
	ON public.email_relevance_adjudications FOR SELECT TO service_role
	USING (true);

REVOKE ALL ON FUNCTION public.prepare_email_relevance_review_sample(uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_email_relevance_adjudication(
	uuid, uuid, uuid, uuid, text, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_email_relevance_review_samples(uuid, uuid)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_email_relevance_adjudication_mutation()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_email_relevance_review_source()
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_email_relevance_review_sample(uuid, uuid, integer)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.record_email_relevance_adjudication(
	uuid, uuid, uuid, uuid, text, text, uuid, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_email_relevance_review_samples(uuid, uuid)
	TO service_role;

COMMENT ON TABLE public.email_relevance_review_samples IS
	'Content-free deterministic, account-balanced, variant-blinded Phase A review sample.';
COMMENT ON TABLE public.email_relevance_adjudications IS
	'Immutable bounded human decisions; mailbox content and free-form reasoning are prohibited.';

COMMIT;
