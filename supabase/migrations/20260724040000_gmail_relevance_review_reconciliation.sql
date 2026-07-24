-- supabase/migrations/20260724040000_gmail_relevance_review_reconciliation.sql
-- Reconcile an early, unledgered Slice 4 production draft with the reviewed contract.
--
-- This migration is forward-only and data preserving. It narrows service-role access to reads,
-- permits parent cascades to delete adjudications, preserves immutable decision fields on updates,
-- expires pending samples when their source observation is removed, and aligns deterministic
-- sampling with the extension-independent 64-character hash used by the canonical Slice 4 schema.

BEGIN;

ALTER TABLE public.email_relevance_adjudications
	DROP CONSTRAINT IF EXISTS email_relevance_adjudications_corrected_project_id_fkey;

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

DROP TRIGGER IF EXISTS email_relevance_review_source_deleted
	ON public.email_relevance_message_observations;
CREATE TRIGGER email_relevance_review_source_deleted
	BEFORE DELETE ON public.email_relevance_message_observations
	FOR EACH ROW EXECUTE FUNCTION public.expire_email_relevance_review_source();

DROP TRIGGER IF EXISTS email_relevance_adjudications_immutable
	ON public.email_relevance_adjudications;
CREATE TRIGGER email_relevance_adjudications_immutable
	BEFORE UPDATE ON public.email_relevance_adjudications
	FOR EACH ROW EXECUTE FUNCTION public.reject_email_relevance_adjudication_mutation();

DROP POLICY IF EXISTS email_relevance_review_samples_service_role_all
	ON public.email_relevance_review_samples;
DROP POLICY IF EXISTS email_relevance_adjudications_service_role_all
	ON public.email_relevance_adjudications;
DROP POLICY IF EXISTS email_relevance_review_samples_service_role_select
	ON public.email_relevance_review_samples;
DROP POLICY IF EXISTS email_relevance_adjudications_service_role_select
	ON public.email_relevance_adjudications;

REVOKE ALL ON TABLE public.email_relevance_review_samples FROM service_role;
REVOKE ALL ON TABLE public.email_relevance_adjudications FROM service_role;
GRANT SELECT ON TABLE public.email_relevance_review_samples TO service_role;
GRANT SELECT ON TABLE public.email_relevance_adjudications TO service_role;

CREATE POLICY email_relevance_review_samples_service_role_select
	ON public.email_relevance_review_samples FOR SELECT TO service_role
	USING (true);
CREATE POLICY email_relevance_adjudications_service_role_select
	ON public.email_relevance_adjudications FOR SELECT TO service_role
	USING (true);

REVOKE ALL ON FUNCTION public.expire_email_relevance_review_source()
	FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.expire_email_relevance_review_source() IS
	'Expires pending content-free review samples when their ephemeral source observation is deleted.';

COMMIT;
