-- supabase/migrations/20260902040000_agentic_chat_read_planning_observability.sql
-- Durable, content-free read-planning attribution for Agentic Chat tool calls.
-- The observation payload stores only bounded enums, indexes, and SHA-256
-- identities; prompt text, tool arguments, and returned content remain excluded.

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc AS procedures
	WHERE procedures.oid =
		'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;

	IF position('''execution_class''' IN v_body) > 0 THEN
		RAISE NOTICE 'agentic_chat_read_planning_observability payload extension already applied';
		RETURN;
	END IF;

	v_next := replace(
		v_body,
		$old$		'tool_name', 'provider_tool_call_id', 'sequence_index', 'status',
		'duration_ms', 'error_code'$old$,
		$new$		'tool_name', 'provider_tool_call_id', 'sequence_index', 'status',
		'duration_ms', 'error_code', 'logical_provider_round', 'tool_batch_index',
		'graph_plan_sha256', 'graph_layer_index', 'graph_layer_width', 'read_epoch',
		'execution_class', 'exact_read_key', 'resource_key', 'memo_served', 'replayed'$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_read_planning_observability_allowlist_unexpected_body';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	IF p_payload ? 'duration_ms' AND ($old$,
		$new$	IF p_payload ? 'tool_batch_index' AND (
		jsonb_typeof(p_payload->'tool_batch_index') <> 'number'
		OR COALESCE((p_payload->>'tool_batch_index') !~ '^[1-9][0-9]*$', true)
		OR (p_payload->>'tool_batch_index')::numeric > 1000
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_tool_batch_index';
	END IF;
	IF p_payload ? 'graph_layer_index' AND (
		jsonb_typeof(p_payload->'graph_layer_index') <> 'number'
		OR COALESCE((p_payload->>'graph_layer_index') !~ '^(0|[1-9][0-9]*)$', true)
		OR (p_payload->>'graph_layer_index')::numeric > 1000
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_graph_layer_index';
	END IF;
	IF p_payload ? 'graph_layer_width' AND (
		jsonb_typeof(p_payload->'graph_layer_width') <> 'number'
		OR COALESCE((p_payload->>'graph_layer_width') !~ '^[1-9][0-9]*$', true)
		OR (p_payload->>'graph_layer_width')::numeric > 1000
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_graph_layer_width';
	END IF;
	IF p_payload ? 'read_epoch' AND (
		jsonb_typeof(p_payload->'read_epoch') <> 'number'
		OR COALESCE((p_payload->>'read_epoch') !~ '^(0|[1-9][0-9]*)$', true)
		OR (p_payload->>'read_epoch')::numeric > 1000
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_read_epoch';
	END IF;
	IF p_payload ? 'execution_class' AND (
		jsonb_typeof(p_payload->'execution_class') <> 'string'
		OR p_payload->>'execution_class' NOT IN (
			'evidence_read', 'control', 'review', 'mutation', 'rejected'
		)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_execution_class';
	END IF;
	IF p_payload ? 'memo_served'
		AND jsonb_typeof(p_payload->'memo_served') <> 'boolean' THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_memo_served';
	END IF;
	IF p_payload ? 'replayed'
		AND jsonb_typeof(p_payload->'replayed') <> 'boolean' THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_replayed';
	END IF;
	IF p_payload ? 'graph_plan_sha256' AND (
		jsonb_typeof(p_payload->'graph_plan_sha256') <> 'string'
		OR COALESCE((p_payload->>'graph_plan_sha256') !~ '^[0-9a-f]{64}$', true)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_graph_plan_sha256';
	END IF;
	IF p_payload ? 'exact_read_key' AND (
		jsonb_typeof(p_payload->'exact_read_key') <> 'string'
		OR COALESCE((p_payload->>'exact_read_key') !~ '^[0-9a-f]{64}$', true)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_exact_read_key';
	END IF;
	IF p_payload ? 'resource_key' AND (
		jsonb_typeof(p_payload->'resource_key') <> 'string'
		OR COALESCE((p_payload->>'resource_key') !~ '^[0-9a-f]{64}$', true)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_resource_key';
	END IF;
	IF p_payload->>'execution_class' = 'evidence_read'
		AND NOT (p_payload ? 'exact_read_key') THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_missing_exact_read_key';
	END IF;
	IF p_payload->>'execution_class' IN ('control', 'review')
		AND (p_payload ? 'exact_read_key' OR p_payload ? 'resource_key') THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_control_read_identity_forbidden';
	END IF;
	IF p_payload->>'execution_class' IN ('mutation', 'rejected')
		AND (p_payload ? 'exact_read_key' OR p_payload ? 'resource_key') THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_nonread_identity_forbidden';
	END IF;
	IF p_payload ? 'duration_ms' AND ($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_read_planning_observability_validation_missing';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_observation_key text, p_phase text, p_event_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

CREATE OR REPLACE VIEW public.agentic_chat_read_planning_turn_summary
WITH (security_invoker = true)
AS
WITH classified AS (
	SELECT
		observations.turn_run_id,
		observations.execution_generation,
		(observations.payload->>'sequence_index')::integer AS sequence_index,
		observations.payload->>'execution_class' AS execution_class,
		(observations.payload->>'logical_provider_round')::integer AS logical_provider_round,
		(observations.payload->>'read_epoch')::integer AS read_epoch,
		observations.payload->>'exact_read_key' AS exact_read_key,
		observations.payload->>'resource_key' AS resource_key,
		COALESCE((observations.payload->>'memo_served')::boolean, false) AS memo_served,
		COALESCE((observations.payload->>'replayed')::boolean, false) AS replayed,
		observations.payload->>'status' AS status,
		observations.payload->>'graph_plan_sha256' AS graph_plan_sha256,
		(observations.payload->>'graph_layer_index')::integer AS graph_layer_index,
		(observations.payload->>'graph_layer_width')::integer AS graph_layer_width
	FROM public.agentic_chat_execution_observations AS observations
	WHERE observations.phase = 'tool'
		AND observations.event_type = 'tool_execution_ended'
		AND observations.payload ?& ARRAY[
			'execution_class', 'logical_provider_round', 'read_epoch',
			'sequence_index', 'status'
		]
), evidence_history AS (
	SELECT
		classified.*,
		count(*) FILTER (WHERE classified.status = 'success') OVER (
			PARTITION BY classified.turn_run_id, classified.execution_generation,
				classified.exact_read_key, classified.read_epoch
			ORDER BY classified.sequence_index
			ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
		) AS prior_successes_in_epoch,
		min(classified.read_epoch) FILTER (WHERE classified.status = 'success') OVER (
			PARTITION BY classified.turn_run_id, classified.execution_generation,
				classified.exact_read_key
			ORDER BY classified.sequence_index
			ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
		) AS prior_success_epoch
	FROM classified
	WHERE classified.execution_class = 'evidence_read'
		AND classified.exact_read_key IS NOT NULL
), resource_projections AS (
	SELECT
		classified.turn_run_id,
		classified.execution_generation,
		classified.resource_key,
		count(DISTINCT classified.exact_read_key)::integer AS projection_count
	FROM classified
	WHERE classified.execution_class = 'evidence_read'
		AND classified.resource_key IS NOT NULL
		AND classified.exact_read_key IS NOT NULL
	GROUP BY classified.turn_run_id, classified.execution_generation, classified.resource_key
), projection_totals AS (
	SELECT
		resource_projections.turn_run_id,
		resource_projections.execution_generation,
		sum(greatest(resource_projections.projection_count - 1, 0))::integer
			AS additional_projection_count
	FROM resource_projections
	GROUP BY resource_projections.turn_run_id, resource_projections.execution_generation
), exact_first_success AS (
	SELECT
		classified.turn_run_id,
		classified.execution_generation,
		classified.exact_read_key,
		min(classified.logical_provider_round) FILTER (
			WHERE classified.status = 'success'
		) AS first_successful_round
	FROM classified
	WHERE classified.execution_class = 'evidence_read'
		AND classified.exact_read_key IS NOT NULL
	GROUP BY classified.turn_run_id, classified.execution_generation,
		classified.exact_read_key
), evidence_completion AS (
	SELECT
		exact_first_success.turn_run_id,
		exact_first_success.execution_generation,
		CASE
			WHEN count(*) FILTER (
				WHERE exact_first_success.first_successful_round IS NULL
			) = 0
			THEN max(exact_first_success.first_successful_round)
			ELSE NULL
		END::integer AS first_complete_evidence_round
	FROM exact_first_success
	GROUP BY exact_first_success.turn_run_id, exact_first_success.execution_generation
), evidence_rounds AS (
	SELECT
		classified.turn_run_id,
		classified.execution_generation,
		classified.logical_provider_round,
		count(*)::integer AS width
	FROM classified
	WHERE classified.execution_class = 'evidence_read'
	GROUP BY classified.turn_run_id, classified.execution_generation,
		classified.logical_provider_round
), evidence_round_summaries AS (
	SELECT
		evidence_rounds.turn_run_id,
		evidence_rounds.execution_generation,
		jsonb_agg(evidence_rounds.width ORDER BY evidence_rounds.logical_provider_round)
			AS evidence_round_widths
	FROM evidence_rounds
	GROUP BY evidence_rounds.turn_run_id, evidence_rounds.execution_generation
), graph_layers AS (
	SELECT
		observations.turn_run_id,
		observations.execution_generation,
		observations.payload->>'graph_plan_sha256' AS graph_plan_sha256,
		(observations.payload->>'graph_layer_index')::integer AS graph_layer_index,
		max((observations.payload->>'graph_layer_width')::integer)::integer
			AS graph_layer_width,
		min((observations.payload->>'sequence_index')::integer)::integer
			AS first_sequence_index
	FROM public.agentic_chat_execution_observations AS observations
	WHERE observations.phase = 'tool'
		AND observations.payload ?& ARRAY[
			'graph_plan_sha256', 'graph_layer_index', 'graph_layer_width', 'sequence_index'
		]
	GROUP BY observations.turn_run_id, observations.execution_generation,
		observations.payload->>'graph_plan_sha256',
		(observations.payload->>'graph_layer_index')::integer
), graph_layer_summaries AS (
	SELECT
		graph_layers.turn_run_id,
		graph_layers.execution_generation,
		jsonb_agg(
			graph_layers.graph_layer_width
			ORDER BY graph_layers.first_sequence_index, graph_layers.graph_plan_sha256,
				graph_layers.graph_layer_index
		) AS graph_layer_widths
	FROM graph_layers
	GROUP BY graph_layers.turn_run_id, graph_layers.execution_generation
), provider_retry_counts AS (
	SELECT
		observations.turn_run_id,
		observations.execution_generation,
		count(*)::integer AS provider_retry_count
	FROM public.agentic_chat_execution_observations AS observations
	WHERE observations.phase = 'provider'
		AND observations.event_type = 'provider_attempt_ended'
		AND observations.payload->>'attempt_kind' = 'retry'
	GROUP BY observations.turn_run_id, observations.execution_generation
), turn_keys AS (
	SELECT DISTINCT classified.turn_run_id, classified.execution_generation
	FROM classified
)
SELECT
	turn_keys.turn_run_id,
	turn_keys.execution_generation,
	count(*) FILTER (WHERE classified.execution_class = 'evidence_read')::integer
		AS evidence_read_call_count,
	count(DISTINCT classified.exact_read_key) FILTER (
		WHERE classified.execution_class = 'evidence_read'
	)::integer AS unique_exact_read_count,
	count(*) FILTER (WHERE evidence_history.prior_successes_in_epoch > 0)::integer
		AS exact_duplicate_count,
	count(DISTINCT classified.resource_key) FILTER (
		WHERE classified.execution_class = 'evidence_read'
	)::integer AS unique_resource_count,
	COALESCE(projection_totals.additional_projection_count, 0)::integer
		AS additional_projection_count,
	count(DISTINCT classified.logical_provider_round) FILTER (
		WHERE classified.execution_class = 'evidence_read'
	)::integer AS evidence_provider_round_count,
	count(DISTINCT classified.logical_provider_round) FILTER (
		WHERE classified.execution_class IN ('control', 'review')
	)::integer AS control_provider_round_count,
	evidence_completion.first_complete_evidence_round,
	count(*) FILTER (
		WHERE classified.execution_class = 'evidence_read' AND classified.memo_served
	)::integer AS memo_served_count,
	count(*) FILTER (
		WHERE evidence_history.prior_success_epoch IS NOT NULL
			AND evidence_history.read_epoch > evidence_history.prior_success_epoch
	)::integer AS justified_post_mutation_reread_count,
	count(*) FILTER (WHERE classified.execution_class = 'mutation')::integer
		AS mutation_call_count,
	count(*) FILTER (
		WHERE classified.execution_class = 'mutation' AND classified.replayed
	)::integer AS replayed_mutation_count,
	count(*) FILTER (WHERE classified.execution_class = 'rejected')::integer
		AS rejected_call_count,
	COALESCE(provider_retry_counts.provider_retry_count, 0)::integer AS provider_retry_count,
	COALESCE(evidence_round_summaries.evidence_round_widths, '[]'::jsonb)
		AS evidence_round_widths,
	COALESCE(graph_layer_summaries.graph_layer_widths, '[]'::jsonb) AS graph_layer_widths
FROM turn_keys
LEFT JOIN classified
	ON classified.turn_run_id = turn_keys.turn_run_id
	AND classified.execution_generation = turn_keys.execution_generation
LEFT JOIN evidence_history
	ON evidence_history.turn_run_id = classified.turn_run_id
	AND evidence_history.execution_generation = classified.execution_generation
	AND evidence_history.sequence_index = classified.sequence_index
LEFT JOIN projection_totals
	ON projection_totals.turn_run_id = turn_keys.turn_run_id
	AND projection_totals.execution_generation = turn_keys.execution_generation
LEFT JOIN evidence_completion
	ON evidence_completion.turn_run_id = turn_keys.turn_run_id
	AND evidence_completion.execution_generation = turn_keys.execution_generation
LEFT JOIN evidence_round_summaries
	ON evidence_round_summaries.turn_run_id = turn_keys.turn_run_id
	AND evidence_round_summaries.execution_generation = turn_keys.execution_generation
LEFT JOIN graph_layer_summaries
	ON graph_layer_summaries.turn_run_id = turn_keys.turn_run_id
	AND graph_layer_summaries.execution_generation = turn_keys.execution_generation
LEFT JOIN provider_retry_counts
	ON provider_retry_counts.turn_run_id = turn_keys.turn_run_id
	AND provider_retry_counts.execution_generation = turn_keys.execution_generation
GROUP BY
	turn_keys.turn_run_id,
	turn_keys.execution_generation,
	projection_totals.additional_projection_count,
	evidence_completion.first_complete_evidence_round,
	evidence_round_summaries.evidence_round_widths,
	graph_layer_summaries.graph_layer_widths,
	provider_retry_counts.provider_retry_count;

REVOKE ALL ON TABLE public.agentic_chat_read_planning_turn_summary
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agentic_chat_read_planning_turn_summary TO service_role;

COMMENT ON VIEW public.agentic_chat_read_planning_turn_summary IS
'Content-free per-turn read-planning metrics derived from durable logical-round, graph-layer, exact-read, resource, memo, and mutation-invalidation observations.';

CREATE OR REPLACE VIEW public.agentic_chat_read_planning_admin_summary
WITH (security_invoker = true)
AS
WITH provider_attribution AS (
	SELECT
		observations.turn_run_id,
		observations.execution_generation,
		COALESCE(
			jsonb_agg(DISTINCT jsonb_build_object(
				'route_id', observations.payload->>'route_id',
				'model_requested', observations.payload->>'model_requested',
				'model_used', observations.payload->>'model_used',
				'provider', observations.payload->>'provider'
			)) FILTER (WHERE observations.payload ? 'route_id'),
			'[]'::jsonb
		) AS model_routes,
		COALESCE(sum((observations.payload->>'duration_ms')::numeric) FILTER (
			WHERE observations.payload ? 'duration_ms'
		), 0)::bigint AS provider_duration_ms
	FROM public.agentic_chat_execution_observations AS observations
	WHERE observations.phase = 'provider'
		AND observations.event_type = 'provider_attempt_ended'
	GROUP BY observations.turn_run_id, observations.execution_generation
), usage_attribution AS (
	SELECT
		usage.turn_run_id,
		COALESCE(jsonb_agg(DISTINCT to_jsonb(usage.model_used)), '[]'::jsonb)
			AS models_used,
		COALESCE(jsonb_agg(DISTINCT to_jsonb(usage.provider)) FILTER (
			WHERE usage.provider IS NOT NULL
		), '[]'::jsonb) AS providers,
		sum(usage.prompt_tokens)::bigint AS prompt_tokens,
		sum(usage.completion_tokens)::bigint AS completion_tokens,
		sum(usage.total_tokens)::bigint AS total_tokens,
		sum(usage.total_cost_usd) AS total_cost_usd,
		sum(usage.response_time_ms)::bigint AS usage_response_time_ms
	FROM public.llm_usage_logs AS usage
	WHERE usage.turn_run_id IS NOT NULL
	GROUP BY usage.turn_run_id
)
SELECT
	summary.*,
	turns.stream_run_id,
	turns.status AS turn_status,
	turns.created_at,
	turns.finished_at,
	CASE
		WHEN turns.finished_at IS NULL THEN NULL
		ELSE floor(extract(epoch FROM (turns.finished_at - turns.created_at)) * 1000)::bigint
	END AS turn_latency_ms,
	turns.llm_pass_count,
	turns.tool_call_count,
	turns.tool_round_count,
	turns.prompt_snapshot_id,
	snapshots.snapshot_version AS prompt_snapshot_version,
	snapshots.prompt_variant,
	snapshots.system_prompt_sha256,
	snapshots.tools_sha256,
	COALESCE(provider_attribution.model_routes, '[]'::jsonb) AS model_routes,
	COALESCE(provider_attribution.provider_duration_ms, 0)::bigint AS provider_duration_ms,
	COALESCE(usage_attribution.models_used, '[]'::jsonb) AS models_used,
	COALESCE(usage_attribution.providers, '[]'::jsonb) AS providers,
	COALESCE(usage_attribution.prompt_tokens, 0)::bigint AS prompt_tokens,
	COALESCE(usage_attribution.completion_tokens, 0)::bigint AS completion_tokens,
	COALESCE(usage_attribution.total_tokens, 0)::bigint AS total_tokens,
	COALESCE(usage_attribution.total_cost_usd, 0) AS total_cost_usd,
	COALESCE(usage_attribution.usage_response_time_ms, 0)::bigint AS usage_response_time_ms
FROM public.agentic_chat_read_planning_turn_summary AS summary
JOIN public.chat_turn_runs AS turns
	ON turns.id = summary.turn_run_id
LEFT JOIN public.chat_prompt_snapshots AS snapshots
	ON snapshots.id = turns.prompt_snapshot_id
LEFT JOIN provider_attribution
	ON provider_attribution.turn_run_id = summary.turn_run_id
	AND provider_attribution.execution_generation = summary.execution_generation
LEFT JOIN usage_attribution
	ON usage_attribution.turn_run_id = summary.turn_run_id;

REVOKE ALL ON TABLE public.agentic_chat_read_planning_admin_summary
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agentic_chat_read_planning_admin_summary TO service_role;

COMMENT ON VIEW public.agentic_chat_read_planning_admin_summary IS
'Service-role evaluation view correlating content-free read-planning metrics with route/provider, prompt snapshot version, logical pass count, latency, token usage, and cost.';
