-- supabase/migrations/20261017202000_agentic_chat_review_decision_observations.sql
-- Pipeline audit 2026-10-17, M5 + S5: retain the independent write review's
-- structured decisions and a per-turn write-commission shadow log in the
-- private, content-free execution-observation ledger.
--
--   provider_review_decided       one row per reviewer decision (lane, attempt,
--                                 outcome, refusal code, finding codes, the held
--                                 calls named defective, stage size and tools).
--   provider_commission_observed  one row per turn execution: Jev's write
--                                 commission probability and commissioned write
--                                 tools vs the write tools actually proposed,
--                                 review outcomes, awaiting_user_card, and
--                                 whether the uncommissioned-write hold ran.
--
-- Payloads carry enum codes, tool names, counts and one probability only:
-- never reviewer prose, arguments, or user text. Every key is typed below and
-- any other key is refused, like the existing provider allowlist.
--
-- The function stays SECURITY INVOKER with only search_path set, and keeps its
-- service_role-only grant. The event_type CHECK is widened; existing rows all
-- satisfy the wider constraint.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
	v_constraint_name text;
BEGIN
	SELECT constraints.conname
	INTO STRICT v_constraint_name
	FROM pg_catalog.pg_constraint AS constraints
	WHERE constraints.conrelid = 'public.agentic_chat_execution_observations'::regclass
		AND constraints.contype = 'c'
		AND pg_catalog.pg_get_constraintdef(constraints.oid) LIKE '%event_type%'
		AND pg_catalog.pg_get_constraintdef(constraints.oid) LIKE '%provider_attempt_started%';
	EXECUTE format(
		'ALTER TABLE public.agentic_chat_execution_observations DROP CONSTRAINT %I',
		v_constraint_name
	);
END;
$migration$;
ALTER TABLE public.agentic_chat_execution_observations
	ADD CONSTRAINT agentic_chat_execution_observations_event_type_check CHECK (
		event_type IN (
			'provider_attempt_started',
			'provider_attempt_ended',
			'provider_media_resolved',
			'provider_review_decided',
			'provider_commission_observed',
			'tool_execution_started',
			'tool_execution_ended'
		)
		AND (
			(phase = 'provider' AND event_type LIKE 'provider_%')
			OR (phase = 'tool' AND event_type LIKE 'tool_execution_%')
		)
	) NOT VALID;
ALTER TABLE public.agentic_chat_execution_observations
	VALIDATE CONSTRAINT agentic_chat_execution_observations_event_type_check;

DO $migration$
DECLARE
	v_body text;
	v_next text;
	v_identity_anchor constant text := $anchor$'provider_media_resolved',$anchor$;
	v_allowlist_anchor constant text := $anchor$	ELSIF p_phase = 'provider' AND p_payload - ARRAY[$anchor$;
BEGIN
	SELECT prosrc INTO STRICT v_body FROM pg_catalog.pg_proc
	WHERE oid = 'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;
	IF position('agentic_chat_execution_observation_invalid_review_receipt' IN v_body) > 0 THEN
		RETURN;
	END IF;
	-- Each anchor must occur exactly once, or the body is not the one this
	-- migration was written against.
	IF (length(v_body) - length(replace(v_body, v_identity_anchor, ''))) / length(v_identity_anchor) <> 1
		OR (length(v_body) - length(replace(v_body, v_allowlist_anchor, ''))) / length(v_allowlist_anchor) <> 1 THEN
		RAISE EXCEPTION 'agentic_chat_review_observation_unexpected_body';
	END IF;

	v_next := replace(v_body, v_identity_anchor,
		$new$'provider_media_resolved',
			'provider_review_decided',
			'provider_commission_observed',$new$);
	v_body := v_next;

	v_next := replace(v_body, v_allowlist_anchor,
		$new$	ELSIF p_phase = 'provider' AND p_event_type = 'provider_review_decided' THEN
		-- One independent-review decision (M5): structured fields only.
		IF NOT (p_payload ?& ARRAY[
				'logical_provider_round', 'review_lane', 'review_attempt', 'review_outcome',
				'review_decision_tool', 'review_rejection_code', 'review_finding_codes',
				'review_defective_calls', 'review_argument_check_count',
				'review_stage_call_count', 'review_stage_tools', 'review_prior_revisions',
				'review_read_only_offered', 'duration_ms'
			])
			OR p_payload - ARRAY[
				'logical_provider_round', 'review_lane', 'review_attempt', 'review_outcome',
				'review_decision_tool', 'review_rejection_code', 'review_finding_codes',
				'review_defective_calls', 'review_argument_check_count',
				'review_stage_call_count', 'review_stage_tools', 'review_prior_revisions',
				'review_read_only_offered', 'duration_ms'
			] <> '{}'::jsonb
			OR jsonb_typeof(p_payload->'review_lane') IS DISTINCT FROM 'string'
			OR p_payload->>'review_lane' NOT IN ('mutation_batch', 'turn_contract')
			OR jsonb_typeof(p_payload->'review_attempt') IS DISTINCT FROM 'number'
			OR p_payload->>'review_attempt' NOT IN ('1', '2')
			OR jsonb_typeof(p_payload->'review_outcome') IS DISTINCT FROM 'string'
			OR p_payload->>'review_outcome' NOT IN (
				'approved', 'revision_requested', 'read_only', 'clarification', 'invalid'
			)
			OR (p_payload->'review_decision_tool' <> 'null'::jsonb AND (
				jsonb_typeof(p_payload->'review_decision_tool') IS DISTINCT FROM 'string'
				OR p_payload->>'review_decision_tool' !~ '^[a-z][a-z0-9_]{0,127}$'))
			OR (p_payload->'review_rejection_code' <> 'null'::jsonb AND (
				jsonb_typeof(p_payload->'review_rejection_code') IS DISTINCT FROM 'string'
				OR p_payload->>'review_rejection_code' !~ '^[a-z][a-z0-9_]{0,63}$'))
			OR jsonb_typeof(p_payload->'review_finding_codes') IS DISTINCT FROM 'array'
			OR jsonb_typeof(p_payload->'review_defective_calls') IS DISTINCT FROM 'array'
			OR jsonb_typeof(p_payload->'review_stage_tools') IS DISTINCT FROM 'array'
			OR jsonb_typeof(p_payload->'review_read_only_offered') IS DISTINCT FROM 'boolean'
			OR EXISTS (SELECT 1 FROM jsonb_each(p_payload) AS field(key, value)
				WHERE field.key IN (
					'review_argument_check_count', 'review_stage_call_count',
					'review_prior_revisions'
				)
				AND (jsonb_typeof(field.value) IS DISTINCT FROM 'number'
					OR field.value::text !~ '^(0|[1-9][0-9]{0,2})$')) THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_review_receipt';
		END IF;
		IF (p_payload->>'review_argument_check_count')::numeric > 20
			OR (p_payload->>'review_stage_call_count')::numeric > 100
			OR (p_payload->>'review_prior_revisions')::numeric > 100
			OR jsonb_array_length(p_payload->'review_finding_codes') > 8
			OR jsonb_array_length(p_payload->'review_defective_calls') > 40
			OR jsonb_array_length(p_payload->'review_stage_tools') > 40
			OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'review_finding_codes') AS item(value)
				WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
					OR item.value #>> '{}' !~ '^[a-z][a-z0-9_]{0,63}$')
			OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'review_defective_calls') AS item(value)
				WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'number'
					OR item.value::text !~ '^([1-9]|[1-3][0-9]|40)$')
			OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'review_stage_tools') AS item(value)
				WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
					OR item.value #>> '{}' !~ '^[a-z][a-z0-9_]{0,127}$') THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_review_receipt';
		END IF;
	ELSIF p_phase = 'provider' AND p_event_type = 'provider_commission_observed' THEN
		-- One per turn execution (S5 shadow log): Jev's commission vs proposed writes.
		IF NOT (p_payload ?& ARRAY[
				'jev_status', 'jev_write_commission', 'jev_commissioned_write_tools',
				'proposed_write_tools', 'proposed_write_call_count', 'review_outcomes',
				'awaiting_user_card', 'writes_held', 'hold_enabled', 'turn_rules_playbook',
				'finished_reason'
			])
			OR p_payload - ARRAY[
				'jev_status', 'jev_write_commission', 'jev_commissioned_write_tools',
				'proposed_write_tools', 'proposed_write_call_count', 'review_outcomes',
				'awaiting_user_card', 'writes_held', 'hold_enabled', 'turn_rules_playbook',
				'finished_reason'
			] <> '{}'::jsonb
			OR jsonb_typeof(p_payload->'jev_status') IS DISTINCT FROM 'string'
			OR p_payload->>'jev_status' NOT IN ('selected', 'fallback', 'skipped', 'absent')
			OR (p_payload->'jev_write_commission' <> 'null'::jsonb
				AND jsonb_typeof(p_payload->'jev_write_commission') IS DISTINCT FROM 'number')
			OR jsonb_typeof(p_payload->'jev_commissioned_write_tools') IS DISTINCT FROM 'array'
			OR jsonb_typeof(p_payload->'proposed_write_tools') IS DISTINCT FROM 'array'
			OR jsonb_typeof(p_payload->'review_outcomes') IS DISTINCT FROM 'array'
			OR jsonb_typeof(p_payload->'proposed_write_call_count') IS DISTINCT FROM 'number'
			OR p_payload->>'proposed_write_call_count' !~ '^(0|[1-9][0-9]{0,3})$'
			OR jsonb_typeof(p_payload->'awaiting_user_card') IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(p_payload->'writes_held') IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(p_payload->'hold_enabled') IS DISTINCT FROM 'boolean'
			OR (p_payload->'turn_rules_playbook' <> 'null'::jsonb AND (
				jsonb_typeof(p_payload->'turn_rules_playbook') IS DISTINCT FROM 'string'
				OR p_payload->>'turn_rules_playbook' !~ '^[a-z][a-z0-9_]{0,63}$'))
			OR (p_payload->'finished_reason' <> 'null'::jsonb AND (
				jsonb_typeof(p_payload->'finished_reason') IS DISTINCT FROM 'string'
				OR p_payload->>'finished_reason' !~ '^[a-z][a-z0-9_]{0,63}$')) THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_commission_receipt';
		END IF;
		IF (p_payload->'jev_write_commission' <> 'null'::jsonb
				AND ((p_payload->>'jev_write_commission')::numeric < 0
					OR (p_payload->>'jev_write_commission')::numeric > 1))
			OR (p_payload->>'proposed_write_call_count')::numeric > 1000
			OR jsonb_array_length(p_payload->'jev_commissioned_write_tools') > 64
			OR jsonb_array_length(p_payload->'proposed_write_tools') > 64
			OR jsonb_array_length(p_payload->'review_outcomes') > 24
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					(p_payload->'jev_commissioned_write_tools') || (p_payload->'proposed_write_tools')
				) AS item(value)
				WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
					OR item.value #>> '{}' !~ '^[a-z][a-z0-9_]{0,127}$')
			OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'review_outcomes') AS item(value)
				WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
					OR item.value #>> '{}' NOT IN (
						'approved', 'revision_requested', 'read_only', 'clarification', 'invalid'
					)) THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_commission_receipt';
		END IF;
	ELSIF p_phase = 'provider' AND p_payload - ARRAY[$new$);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_review_observation_unexpected_body';
	END IF;

	EXECUTE format($ddl$
		CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(
			p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid,
			p_processing_token uuid, p_execution_generation integer,
			p_observation_key text, p_phase text, p_event_type text, p_payload jsonb
		) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
		SET search_path = pg_catalog, public AS %L
	$ddl$, v_next);
END;
$migration$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb) TO service_role;

COMMIT;
