-- Agentic Chat Worker Phase 4 P3 S2: immutable history strategy/count contract.
--
-- New web admissions include the exact history strategy and counts inside the
-- hashed artifact. This trigger validates those values, copies them onto the
-- parent turn in the same transaction, and (for prepared prompts) proves that
-- the frozen model history is an exact projection of the locked prepared row.
-- Artifacts without historyState retain rolling v2/v3 compatibility.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_prepared_history_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_prepared public.agentic_chat_prepared_prompts%ROWTYPE;
	v_history_state jsonb := NEW.prepared->'historyState';
	v_strategy text;
	v_compressed boolean;
	v_raw_history_count integer;
	v_history_for_model_count integer;
	v_expected_prepared_history jsonb;
BEGIN
	IF NEW.history_source = 'prepared_prompt' THEN
		IF NEW.source_prepared_prompt_id IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_lineage_missing';
		END IF;

		SELECT prepared.*
		INTO v_prepared
		FROM public.agentic_chat_prepared_prompts AS prepared
		WHERE prepared.id = NEW.source_prepared_prompt_id
			AND prepared.session_id = NEW.session_id
			AND prepared.user_id = NEW.user_id;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_scope_mismatch';
		END IF;

		IF EXISTS (
			SELECT 1
			FROM public.chat_messages AS message
			WHERE message.session_id = NEW.session_id
				AND message.user_id = NEW.user_id
				AND message.created_at > v_prepared.created_at
		) THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_stale';
		END IF;
	ELSIF NEW.history_source <> 'admission_window' THEN
		RAISE EXCEPTION 'agentic_chat_input_history_source_invalid';
	END IF;

	-- The field is optional only so already-retained artifacts and an older web
	-- process can coexist with this migration during a rolling deployment.
	IF v_history_state IS NULL THEN
		RETURN NEW;
	END IF;

	IF jsonb_typeof(v_history_state) <> 'object'
		OR jsonb_typeof(COALESCE(v_history_state->'strategy', 'null'::jsonb)) <> 'string'
		OR v_history_state->>'strategy' NOT IN (
			'raw_history',
			'continuity_only',
			'compressed_history'
		)
		OR jsonb_typeof(COALESCE(v_history_state->'compressed', 'null'::jsonb)) <> 'boolean'
		OR COALESCE((v_history_state->>'rawHistoryCount') !~ '^[0-9]+$', true)
		OR COALESCE((v_history_state->>'historyForModelCount') !~ '^[0-9]+$', true) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_invalid';
	END IF;

	v_strategy := v_history_state->>'strategy';
	v_compressed := (v_history_state->>'compressed')::boolean;
	v_raw_history_count := (v_history_state->>'rawHistoryCount')::integer;
	v_history_for_model_count := (v_history_state->>'historyForModelCount')::integer;

	IF v_compressed IS DISTINCT FROM (v_strategy = 'compressed_history')
		OR v_raw_history_count < 0
		OR v_raw_history_count > 50
		OR v_history_for_model_count < 0
		OR v_history_for_model_count > 50
		OR v_history_for_model_count <> jsonb_array_length(NEW.history)
		OR (
			v_strategy = 'continuity_only'
			AND (v_raw_history_count <> 0 OR v_history_for_model_count <> 1)
		) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_invalid';
	END IF;

	IF NEW.history_source = 'prepared_prompt' THEN
		IF jsonb_typeof(v_prepared.history_for_model) <> 'array'
			OR jsonb_array_length(v_prepared.history_for_model) > 50
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_prepared.history_for_model) AS history_item(value)
				WHERE jsonb_typeof(history_item.value) <> 'object'
					OR jsonb_typeof(COALESCE(history_item.value->'role', 'null'::jsonb)) <> 'string'
					OR history_item.value->>'role' NOT IN ('user', 'assistant', 'system', 'tool')
					OR jsonb_typeof(COALESCE(history_item.value->'content', 'null'::jsonb)) <> 'string'
					OR (
						history_item.value ? 'attachments'
						AND (
							jsonb_typeof(history_item.value->'attachments') <> 'array'
							OR jsonb_array_length(history_item.value->'attachments') <> 0
						)
					)
					OR (
						history_item.value ? 'tool_calls'
						AND jsonb_typeof(history_item.value->'tool_calls') <> 'array'
					)
					OR EXISTS (
						SELECT 1
						FROM jsonb_array_elements(
							CASE
								WHEN jsonb_typeof(history_item.value->'tool_calls') = 'array'
									THEN history_item.value->'tool_calls'
								ELSE '[]'::jsonb
							END
						) AS tool_call(value)
						WHERE jsonb_typeof(tool_call.value) <> 'object'
					)
					OR (
						history_item.value ? 'tool_call_id'
						AND jsonb_typeof(history_item.value->'tool_call_id') NOT IN ('string', 'null')
					)
			) THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_invalid';
		END IF;

		IF v_prepared.history_strategy IS DISTINCT FROM v_strategy
			OR v_prepared.history_compressed IS DISTINCT FROM v_compressed
			OR v_prepared.raw_history_count IS DISTINCT FROM v_raw_history_count
			OR v_prepared.history_for_model_count IS DISTINCT FROM v_history_for_model_count THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_state_mismatch';
		END IF;

		SELECT COALESCE(
			jsonb_agg(
				jsonb_build_object(
					'sourceMessageId', NULL,
					'role', history_item.value->>'role',
					'content', history_item.value->>'content',
					'attachments', '[]'::jsonb,
					'toolCalls', COALESCE(history_item.value->'tool_calls', '[]'::jsonb),
					'toolCallId', COALESCE(history_item.value->'tool_call_id', 'null'::jsonb)
				)
				ORDER BY history_item.ordinality
			),
			'[]'::jsonb
		)
		INTO v_expected_prepared_history
		FROM jsonb_array_elements(v_prepared.history_for_model)
			WITH ORDINALITY AS history_item(value, ordinality);

		IF NEW.history IS DISTINCT FROM v_expected_prepared_history THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_copy_mismatch';
		END IF;
	ELSIF NEW.source_prepared_prompt_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_input_admission_history_lineage_invalid';
	END IF;

	UPDATE public.chat_turn_runs AS turn_run
	SET history_strategy = v_strategy,
		history_compressed = v_compressed,
		raw_history_count = v_raw_history_count,
		history_for_model_count = v_history_for_model_count
	WHERE turn_run.id = NEW.turn_run_id
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_turn_scope_mismatch';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_prepared_history_currency()
	FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_agentic_chat_prepared_history_currency() IS
	'Fails stale or divergent prepared history, validates optional immutable historyState evidence, and copies new evidence to the parent turn in the admission transaction.';

COMMIT;
