-- supabase/tests/20260902040000_agentic_chat_read_planning_observability.test.sql
-- Disposable PostgreSQL verification for content-free read-planning telemetry.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.persist_read_planning_observation(
	p_key_char text,
	p_sequence integer,
	p_round integer,
	p_epoch integer,
	p_class text,
	p_exact_key text DEFAULT NULL,
	p_resource_key text DEFAULT NULL,
	p_memo_served boolean DEFAULT false,
	p_plan_char text DEFAULT 'f',
	p_replayed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.persist_agentic_chat_execution_observation(
		'fc300000-0000-4000-8000-000000000001',
		'fa100000-0000-4000-8000-000000000001',
		'fc400000-0000-4000-8000-000000000001',
		'fc500000-0000-4000-8000-000000000001',
		1,
		repeat('b', 62) || '7' || p_key_char,
		'tool',
		'tool_execution_ended',
		jsonb_strip_nulls(jsonb_build_object(
			'tool_name', CASE
				WHEN p_class = 'evidence_read' THEN 'read_document_section'
				WHEN p_class = 'mutation' THEN 'update_onto_task'
				ELSE 'declare_turn_contract'
			END,
			'provider_tool_call_id', 'read-planning-' || p_sequence::text,
			'sequence_index', p_sequence,
			'status', 'success',
			'duration_ms', 1,
			'error_code', NULL,
			'logical_provider_round', p_round,
			'tool_batch_index', p_round,
			'graph_plan_sha256', repeat(p_plan_char, 64),
			'graph_layer_index', 0,
			'graph_layer_width', CASE WHEN p_round IN (1, 2) THEN 2 ELSE 1 END,
			'read_epoch', p_epoch,
			'execution_class', p_class,
			'exact_read_key', p_exact_key,
			'resource_key', p_resource_key,
			'memo_served', p_memo_served,
			'replayed', p_replayed
		))
	);
$$;

SET ROLE service_role;
SELECT pg_temp.persist_read_planning_observation('1', 1, 1, 0, 'evidence_read', repeat('a', 64), repeat('d', 64), false, 'f');
SELECT pg_temp.persist_read_planning_observation('2', 2, 1, 0, 'evidence_read', repeat('b', 64), repeat('e', 64), false, 'f');
SELECT pg_temp.persist_read_planning_observation('3', 3, 2, 0, 'evidence_read', repeat('c', 64), repeat('d', 64), false, 'e');
SELECT pg_temp.persist_read_planning_observation('4', 4, 2, 0, 'evidence_read', repeat('a', 64), repeat('d', 64), true, 'e');
SELECT pg_temp.persist_read_planning_observation('5', 5, 3, 0, 'control', NULL, NULL, false, 'd');
SELECT pg_temp.persist_read_planning_observation('6', 6, 4, 1, 'evidence_read', repeat('a', 64), repeat('d', 64), false, 'c');
SELECT pg_temp.persist_read_planning_observation('7', 7, 5, 1, 'mutation', NULL, NULL, false, 'b', true);

DO $$
BEGIN
	PERFORM pg_temp.persist_read_planning_observation(
		'8', 8, 6, 1, 'evidence_read', NULL, NULL, false, 'a'
	);
	RAISE EXCEPTION 'expected missing exact-read identity rejection';
EXCEPTION
	WHEN OTHERS THEN
		IF SQLERRM <> 'agentic_chat_execution_observation_missing_exact_read_key' THEN
			RAISE;
		END IF;
END;
$$;

DO $$
BEGIN
	PERFORM pg_temp.persist_read_planning_observation(
		'9', 9, 6, 1, 'control', repeat('a', 64), NULL, false, 'a'
	);
	RAISE EXCEPTION 'expected control read-identity rejection';
EXCEPTION
	WHEN OTHERS THEN
		IF SQLERRM <> 'agentic_chat_execution_observation_control_read_identity_forbidden' THEN
			RAISE;
		END IF;
END;
$$;
RESET ROLE;

SET ROLE service_role;
INSERT INTO public.llm_usage_logs (
	turn_run_id, model_requested, model_used, provider,
	prompt_tokens, completion_tokens, total_tokens, total_cost_usd, response_time_ms
)
VALUES (
	'fc300000-0000-4000-8000-000000000001',
	'model-requested', 'model-used', 'provider-a', 100, 20, 120, 0.01, 300
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT
			evidence_read_call_count = 5
			AND unique_exact_read_count = 3
			AND exact_duplicate_count = 1
			AND unique_resource_count = 2
			AND additional_projection_count = 1
			AND evidence_provider_round_count = 3
			AND control_provider_round_count = 1
			AND first_complete_evidence_round = 2
			AND memo_served_count = 1
			AND justified_post_mutation_reread_count = 1
			AND mutation_call_count = 1
			AND replayed_mutation_count = 1
			AND rejected_call_count = 0
			AND provider_retry_count = 1
			AND evidence_round_widths = '[2, 2, 1]'::jsonb
			AND graph_layer_widths = '[2, 2, 1, 1, 1]'::jsonb
		FROM public.agentic_chat_read_planning_turn_summary
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
			AND execution_generation = 1
	),
	format(
		'read-planning summary did not distinguish duplicates, projections, controls, or invalidated rereads: %s',
		(
			SELECT row_to_json(summary)::text
			FROM public.agentic_chat_read_planning_turn_summary AS summary
			WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
				AND execution_generation = 1
		)
	)
);

SELECT pg_temp.assert_true(
	(
		SELECT
			llm_pass_count = 2
			AND total_tokens = 120
			AND total_cost_usd = 0.01
			AND models_used = '["model-used"]'::jsonb
			AND providers = '["provider-a"]'::jsonb
			AND jsonb_array_length(model_routes) > 0
		FROM public.agentic_chat_read_planning_admin_summary
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
			AND execution_generation = 1
	),
	'admin summary did not correlate read planning with pass, route, provider, token, and cost data'
);

SELECT 'agentic_chat_read_planning_observability_ok' AS result;
