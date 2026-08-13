-- supabase/tests/20260813070000_agentic_chat_terminal_domain_metadata.test.sql
-- Disposable PostgreSQL verification for P5 S3 unit 2 terminal domain metadata.
-- Requires the composed Phase 2C fixture and pg_temp.seed_timing_turn helper.
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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.empty_domain_state(p_updated_at text)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'version', 1,
		'updated_at', p_updated_at,
		'active_domains', '[]'::jsonb,
		'active_outcome_cards', '[]'::jsonb,
		'coverage_gaps', '[]'::jsonb,
		'research_backlog', '[]'::jsonb,
		'used_domains', '[]'::jsonb,
		'unknown_domain_interests', '[]'::jsonb,
		'workflow_gap_candidates', '[]'::jsonb,
		'recent_observations', '[]'::jsonb
	);
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_domain_artifact(
	p_turn_run_id uuid,
	p_artifact_id uuid,
	p_sensing_applied boolean,
	p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
		artifact_version, history_source, history, prepared, content_hash,
		history_bytes, content_bytes, created_at, retain_until
	) VALUES (
		p_artifact_id,
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		NULL,
		'agentic_chat_input_v2',
		'admission_window',
		'[]'::jsonb,
		jsonb_build_object(
			'sourcePreparedPromptId', NULL,
			'contextPayload', '{}'::jsonb,
			'conversationSummary', NULL,
			'surfaceProfile', 'fixture',
			'systemPrompt', 'fixture',
			'promptSections', '[]'::jsonb,
			'toolSurface', '{}'::jsonb,
			'sessionSnapshot', jsonb_build_object(
				'summary', NULL,
				'agent_metadata', '{}'::jsonb
			),
			'contextUsageSnapshot', jsonb_build_object(
				'estimatedTokens', 10,
				'tokenBudget', 1000,
				'usagePercent', 1,
				'tokensRemaining', 990,
				'status', 'ok'
			),
			'domainMetadata', jsonb_build_object(
				'version', 1,
				'sensingApplied', p_sensing_applied,
				'state', p_state,
				'skillDomainIds', jsonb_build_object(
					'content_strategy_beyond_blogging',
					'[
						"creator_growth",
						"marketing.youtube_growth"
					]'::jsonb
				),
				'outcomeCardDomainIds', jsonb_build_object(
					'newsletter_retention_review',
					'["marketing.content_strategy"]'::jsonb
				)
			)
		),
		repeat('b', 64),
		2,
		4096,
		clock_timestamp(),
		clock_timestamp() + interval '7 days 1 minute'
	);

	UPDATE public.chat_turn_runs
	SET input_artifact_id = p_artifact_id
	WHERE id = p_turn_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_domain_tool_execution(
	p_id uuid,
	p_turn_run_id uuid,
	p_sequence integer,
	p_tool_name text,
	p_result jsonb
)
RETURNS void
LANGUAGE sql
AS $$
	INSERT INTO public.chat_tool_executions (
		id, session_id, message_id, turn_run_id, stream_run_id, client_turn_id,
		provider_tool_call_id, tool_name, tool_category, gateway_op, help_path,
		sequence_index, arguments, result, result_count, zero_result,
		execution_time_ms, tokens_consumed, success, error_message,
		requires_user_action, affected_entities, effect_id, created_at
	) VALUES (
		p_id, p_turn_run_id, NULL, p_turn_run_id,
		'domain-stream-' || p_turn_run_id::text,
		'domain-client-' || p_turn_run_id::text,
		'domain-call-' || p_sequence::text,
		p_tool_name, 'read', NULL, NULL, p_sequence, '{}'::jsonb, p_result,
		NULL, NULL, 5, NULL, true, NULL, false, '[]'::jsonb, NULL,
		clock_timestamp()
	);
$$;

SELECT pg_temp.assert_true(
	public.agentic_chat_domain_reference_map_v1_is_valid(
		'{"skill":["creator_growth","marketing.youtube_growth"]}'::jsonb
	)
	AND NOT public.agentic_chat_domain_reference_map_v1_is_valid(
		'{"skill":["marketing.youtube_growth","creator_growth"]}'::jsonb
	),
	'domain reference maps require bounded ordered unique canonical ids'
);

-- Admission-time sensing is frozen and projected even without a load tool.
SELECT pg_temp.seed_timing_turn(
	'c2310000-0000-4000-8000-000000000001',
	'c2410000-0000-4000-8000-000000000001',
	'c2510000-0000-4000-8000-000000000001',
	'c2610000-0000-4000-8000-000000000001',
	'c2710000-0000-4000-8000-000000000001',
	'domain-sensing-only',
	1,
	false,
	false
);
UPDATE public.chat_sessions
SET agent_metadata = '{"keep":{"nested":true}}'::jsonb
WHERE id = 'c2310000-0000-4000-8000-000000000001';
SELECT pg_temp.seed_domain_artifact(
	'c2310000-0000-4000-8000-000000000001',
	'c2810000-0000-4000-8000-000000000001',
	true,
	jsonb_set(
		pg_temp.empty_domain_state('2026-08-13T12:00:00.000Z'),
		'{active_domains}',
		'[{
			"id":"marketing.youtube_growth",
			"name":"YouTube Growth",
			"coverage_status":"partial",
			"confidence":0.8,
			"first_seen_at":"2026-08-13T12:00:00.000Z",
			"last_seen_at":"2026-08-13T12:00:00.000Z",
			"occurrences":1,
			"skill_ids":["content_strategy_beyond_blogging"],
			"gap_skill_ids":[]
		}]'::jsonb
	)
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c2310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c2410000-0000-4000-8000-000000000001',
	'c2510000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'c2910000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT agent_metadata->'fastchat_domain_state'->'active_domains'->0->>'id'
				= 'marketing.youtube_growth'
			AND agent_metadata->'keep' = '{"nested":true}'::jsonb
		FROM public.chat_sessions
		WHERE id = 'c2310000-0000-4000-8000-000000000001'
	),
	'frozen sensing projects at terminal truth and preserves unrelated metadata'
);

-- Legacy records sensing before provider execution, so an exceptional failed
-- turn must retain that frozen sensing state even though it projects no tools.
SELECT pg_temp.seed_timing_turn(
	'c2360000-0000-4000-8000-000000000001',
	'c2460000-0000-4000-8000-000000000001',
	'c2560000-0000-4000-8000-000000000001',
	'c2660000-0000-4000-8000-000000000001',
	'c2760000-0000-4000-8000-000000000001',
	'domain-failed-sensing', 1, false, false
);
SELECT pg_temp.seed_domain_artifact(
	'c2360000-0000-4000-8000-000000000001',
	'c2860000-0000-4000-8000-000000000001',
	true,
	jsonb_set(
		pg_temp.empty_domain_state('2026-08-13T12:00:00.000Z'),
		'{active_domains}',
		'[{"id":"marketing.content_strategy"}]'::jsonb
	)
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn_with_failure_events(
	'c2360000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c2460000-0000-4000-8000-000000000001',
	'c2560000-0000-4000-8000-000000000001',
	1, 'failed', 'error', 'permanent', NULL, 'fixture answer', '{}'::jsonb,
	NULL, NULL, NULL,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"failed","finished_reason":"error","failure_code":"permanent","usage":{"total_tokens":0}}'::jsonb,
	'An error occurred while streaming.',
	'c2b60000-0000-5000-8000-000000000001',
	jsonb_set(
		pg_temp.timing_draft('c2360000-0000-4000-8000-000000000001'),
		'{finished_reason}',
		'"error"'::jsonb
	),
	'c2c60000-0000-5000-8000-000000000001'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT status = 'failed'
			AND (
				SELECT agent_metadata->'fastchat_domain_state'->'active_domains'->0->>'id'
				FROM public.chat_sessions sessions
				WHERE sessions.id = turns.session_id
			) = 'marketing.content_strategy'
		FROM public.chat_turn_runs turns
		WHERE id = 'c2360000-0000-4000-8000-000000000001'
	),
	'failed worker terminal truth retains admission-frozen sensing without tool projection'
);

-- Two identical successful skill loads in one turn produce one compact signal
-- per mapped domain, matching legacy turn-level signal compaction.
SELECT pg_temp.seed_timing_turn(
	'c2320000-0000-4000-8000-000000000001',
	'c2420000-0000-4000-8000-000000000001',
	'c2520000-0000-4000-8000-000000000001',
	'c2620000-0000-4000-8000-000000000001',
	'c2720000-0000-4000-8000-000000000001',
	'domain-skill-load', 1, false, false
);
SELECT pg_temp.seed_domain_artifact(
	'c2320000-0000-4000-8000-000000000001',
	'c2820000-0000-4000-8000-000000000001',
	false,
	pg_temp.empty_domain_state('2026-08-13T12:00:00.000Z')
);
SELECT pg_temp.seed_domain_tool_execution(
	'c2a20000-0000-5000-8000-000000000001',
	'c2320000-0000-4000-8000-000000000001', 1, 'skill_load',
	'{"type":"skill","id":"content_strategy_beyond_blogging"}'::jsonb
);
SELECT pg_temp.seed_domain_tool_execution(
	'c2a20000-0000-5000-8000-000000000002',
	'c2320000-0000-4000-8000-000000000001', 2, 'skill_load',
	'{"type":"skill","id":"content_strategy_beyond_blogging"}'::jsonb
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c2320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c2420000-0000-4000-8000-000000000001',
	'c2520000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'c2920000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":2}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT jsonb_array_length(agent_metadata->'fastchat_domain_state'->'used_domains') = 2
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					agent_metadata->'fastchat_domain_state'->'used_domains'
				) entry(value)
				WHERE entry.value->>'source' <> 'skill_load'
					OR entry.value->>'skill_id' <> 'content_strategy_beyond_blogging'
					OR (entry.value->>'occurrences')::integer <> 1
			)
		FROM public.chat_sessions
		WHERE id = 'c2320000-0000-4000-8000-000000000001'
	),
	'durable successful skill loads use the frozen catalog map and compact duplicates'
);

-- Full outcome-card payloads add both used-domain and coverage-gap/backlog state.
SELECT pg_temp.seed_timing_turn(
	'c2330000-0000-4000-8000-000000000001',
	'c2430000-0000-4000-8000-000000000001',
	'c2530000-0000-4000-8000-000000000001',
	'c2630000-0000-4000-8000-000000000001',
	'c2730000-0000-4000-8000-000000000001',
	'domain-outcome-load', 1, false, false
);
SELECT pg_temp.seed_domain_artifact(
	'c2330000-0000-4000-8000-000000000001',
	'c2830000-0000-4000-8000-000000000001',
	false,
	pg_temp.empty_domain_state('2026-08-13T12:00:00.000Z')
);
SELECT pg_temp.seed_domain_tool_execution(
	'c2a30000-0000-5000-8000-000000000001',
	'c2330000-0000-4000-8000-000000000001', 1, 'outcome_card_load',
	'{
		"type":"outcome_card",
		"id":"newsletter_retention_review",
		"domain_ids":["marketing.content_strategy"],
		"coverage_status":"partial",
		"gaps":[{
			"missing_skill_id":"newsletter_retention_diagnostics",
			"user_need":"diagnose retention and churn in a newsletter funnel",
			"summary":"No dedicated newsletter retention diagnostics skill exists yet."
		}]
	}'::jsonb
);
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c2330000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'c2430000-0000-4000-8000-000000000001',
	'c2530000-0000-4000-8000-000000000001',
	1, 'completed', 'stop', NULL,
	'c2930000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":1}'::jsonb,
	10, 6, 16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT agent_metadata->'fastchat_domain_state' @> '{
			"used_domains":[{
				"domain_id":"marketing.content_strategy",
				"source":"outcome_card_load",
				"tool_name":"outcome_card_load",
				"outcome_card_id":"newsletter_retention_review"
			}],
			"coverage_gaps":[{
				"missing_skill_id":"newsletter_retention_diagnostics",
				"domain_ids":["marketing.content_strategy"]
			}],
			"research_backlog":[{
				"id":"skill:newsletter_retention_diagnostics",
				"kind":"skill",
				"priority":"medium",
				"missing_skill_id":"newsletter_retention_diagnostics"
			}]
		}'::jsonb
		FROM public.chat_sessions
		WHERE id = 'c2330000-0000-4000-8000-000000000001'
	),
	'outcome-card durable truth projects used domains and bounded gap backlog state'
);

-- Invalid maps fail artifact admission, while rolling artifacts remain untouched.
SELECT pg_temp.seed_timing_turn(
	'c2340000-0000-4000-8000-000000000001',
	'c2440000-0000-4000-8000-000000000001',
	'c2540000-0000-4000-8000-000000000001',
	'c2640000-0000-4000-8000-000000000001',
	'c2740000-0000-4000-8000-000000000001',
	'domain-invalid-map', 1, false, false
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT pg_temp.seed_domain_artifact(
				'c2340000-0000-4000-8000-000000000001',
				'c2840000-0000-4000-8000-000000000001',
				false,
				pg_temp.empty_domain_state('not-a-timestamp')
			)
		$statement$,
		'agentic_chat_domain_metadata_invalid_snapshot'
	),
	'invalid frozen domain metadata rolls artifact admission back'
);

-- Scope corruption aborts the entire terminal statement after message/event writes.
SELECT pg_temp.seed_timing_turn(
	'c2350000-0000-4000-8000-000000000001',
	'c2450000-0000-4000-8000-000000000001',
	'c2550000-0000-4000-8000-000000000001',
	'c2650000-0000-4000-8000-000000000001',
	'c2750000-0000-4000-8000-000000000001',
	'domain-atomic-rollback', 1, false, false
);
SELECT pg_temp.seed_domain_artifact(
	'c2350000-0000-4000-8000-000000000001',
	'c2850000-0000-4000-8000-000000000001',
	true,
	pg_temp.empty_domain_state('2026-08-13T12:00:00.000Z')
);
INSERT INTO public.users (id)
VALUES ('fa200000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
UPDATE public.chat_sessions
SET user_id = 'fa200000-0000-4000-8000-000000000001'
WHERE id = 'c2350000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.finalize_agentic_chat_turn(
				'c2350000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'c2450000-0000-4000-8000-000000000001',
				'c2550000-0000-4000-8000-000000000001',
				1, 'completed', 'stop', NULL,
				'c2950000-0000-4000-8000-000000000001',
				'fixture answer',
				'{"completion_status":"completed","answer_source":"model","tool_round_count":0,"tool_call_count":0}'::jsonb,
				10, 6, 16,
				'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
				'{"type":"done","finished_reason":"stop"}'::jsonb
			)
		$statement$,
		'agentic_chat_terminal_domain_metadata_scope_mismatch'
	),
	'domain metadata scope corruption rejects terminal coupling'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND assistant_message_id IS NULL
		FROM public.chat_turn_runs
		WHERE id = 'c2350000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_messages
		WHERE id = 'c2950000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_turn_events
		WHERE turn_run_id = 'c2350000-0000-4000-8000-000000000001'
			AND event_type = 'done'
	),
	'domain metadata failure rolls back message, event, and terminal turn truth'
);

SELECT pg_temp.assert_true(
	has_function_privilege('service_role',
		'public.agentic_chat_domain_reference_map_v1_is_valid(jsonb)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated',
		'public.agentic_chat_domain_reference_map_v1_is_valid(jsonb)', 'EXECUTE')
	AND NOT has_function_privilege('anon',
		'public.agentic_chat_merge_domain_ids_v1(jsonb,jsonb,integer)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated',
		'public.validate_agentic_chat_domain_metadata_snapshot_v1()', 'EXECUTE')
	AND NOT has_function_privilege('anon',
		'public.apply_agentic_chat_terminal_domain_metadata_v1()', 'EXECUTE'),
	'domain projection helpers and triggers retain the intended service-only/direct-deny boundary'
);

SELECT 'agentic_chat_terminal_domain_metadata_ok' AS result;
