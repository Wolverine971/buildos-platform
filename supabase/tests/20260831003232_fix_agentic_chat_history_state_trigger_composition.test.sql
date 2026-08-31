-- supabase/tests/20260831003232_fix_agentic_chat_history_state_trigger_composition.test.sql
-- Executable contract for the composed prepared-history artifact trigger.

INSERT INTO public.chat_turn_runs (id, session_id, user_id) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'20000000-0000-4000-8000-000000000001',
		'30000000-0000-4000-8000-000000000001'
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'20000000-0000-4000-8000-000000000001',
		'30000000-0000-4000-8000-000000000001'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'20000000-0000-4000-8000-000000000001',
		'30000000-0000-4000-8000-000000000001'
	),
	(
		'10000000-0000-4000-8000-000000000004',
		'20000000-0000-4000-8000-000000000001',
		'30000000-0000-4000-8000-000000000001'
	);

-- This is the production failure shape: a fresh admission_window artifact
-- with empty history must copy raw_history/0/0 onto the parent turn.
INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	history_source, history, prepared
) VALUES (
	'40000000-0000-4000-8000-000000000001',
	'10000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000001',
	'30000000-0000-4000-8000-000000000001',
	NULL,
	'admission_window',
	'[]'::jsonb,
	'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":0,"historyForModelCount":0}}'::jsonb
);

DO $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
BEGIN
	SELECT * INTO STRICT v_turn
	FROM public.chat_turn_runs
	WHERE id = '10000000-0000-4000-8000-000000000001';

	IF v_turn.history_strategy IS DISTINCT FROM 'raw_history'
		OR v_turn.history_compressed IS DISTINCT FROM false
		OR v_turn.raw_history_count IS DISTINCT FROM 0
		OR v_turn.history_for_model_count IS DISTINCT FROM 0 THEN
		RAISE EXCEPTION 'fresh admission did not copy history state: %', row_to_json(v_turn);
	END IF;
END;
$$;

-- Divergent history evidence fails inside the artifact transaction and does
-- not partially update the parent turn.
DO $$
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_input_artifacts (
			id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
			history_source, history, prepared
		) VALUES (
			'40000000-0000-4000-8000-000000000002',
			'10000000-0000-4000-8000-000000000002',
			'20000000-0000-4000-8000-000000000001',
			'30000000-0000-4000-8000-000000000001',
			NULL,
			'admission_window',
			'[]'::jsonb,
			'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":0,"historyForModelCount":1}}'::jsonb
		);
		RAISE EXCEPTION 'invalid history state was admitted';
	EXCEPTION
		WHEN OTHERS THEN
			IF SQLERRM <> 'agentic_chat_input_history_state_invalid' THEN
				RAISE;
			END IF;
	END;

	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_input_artifacts
		WHERE id = '40000000-0000-4000-8000-000000000002'
	) OR EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE id = '10000000-0000-4000-8000-000000000002'
			AND history_strategy IS NOT NULL
	) THEN
		RAISE EXCEPTION 'invalid artifact left partial state';
	END IF;
END;
$$;

INSERT INTO public.agentic_chat_prepared_prompts (
	id, session_id, user_id, history_cutoff_at, history_for_model,
	history_strategy, history_compressed, raw_history_count,
	history_for_model_count, created_at
) VALUES (
	'50000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000001',
	'30000000-0000-4000-8000-000000000001',
	now() - interval '20 seconds',
	'[{"role":"assistant","content":"Earlier answer","attachments":[],"tool_calls":[],"tool_call_id":null}]'::jsonb,
	'raw_history', false, 1, 1,
	now() - interval '5 seconds'
);

INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, created_at
) VALUES (
	'60000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000001',
	'30000000-0000-4000-8000-000000000001',
	'user', 'Landed during prompt assembly', now() - interval '10 seconds'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_input_artifacts (
			id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
			history_source, history, prepared
		) VALUES (
			'40000000-0000-4000-8000-000000000003',
			'10000000-0000-4000-8000-000000000003',
			'20000000-0000-4000-8000-000000000001',
			'30000000-0000-4000-8000-000000000001',
			'50000000-0000-4000-8000-000000000001',
			'prepared_prompt',
			'[{"sourceMessageId":null,"role":"assistant","content":"Earlier answer","attachments":[],"toolCalls":[],"toolCallId":null}]'::jsonb,
			'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":1,"historyForModelCount":1}}'::jsonb
		);
		RAISE EXCEPTION 'assembly-window message was admitted';
	EXCEPTION
		WHEN OTHERS THEN
			IF SQLERRM <> 'agentic_chat_input_prepared_history_stale' THEN
				RAISE;
			END IF;
	END;
END;
$$;

DELETE FROM public.chat_messages
WHERE id = '60000000-0000-4000-8000-000000000001';

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	history_source, history, prepared
) VALUES (
	'40000000-0000-4000-8000-000000000004',
	'10000000-0000-4000-8000-000000000004',
	'20000000-0000-4000-8000-000000000001',
	'30000000-0000-4000-8000-000000000001',
	'50000000-0000-4000-8000-000000000001',
	'prepared_prompt',
	'[{"sourceMessageId":null,"role":"assistant","content":"Earlier answer","attachments":[],"toolCalls":[],"toolCallId":null}]'::jsonb,
	'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":1,"historyForModelCount":1}}'::jsonb
);

DO $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
BEGIN
	SELECT * INTO STRICT v_turn
	FROM public.chat_turn_runs
	WHERE id = '10000000-0000-4000-8000-000000000004';

	IF v_turn.history_strategy IS DISTINCT FROM 'raw_history'
		OR v_turn.history_compressed IS DISTINCT FROM false
		OR v_turn.raw_history_count IS DISTINCT FROM 1
		OR v_turn.history_for_model_count IS DISTINCT FROM 1 THEN
		RAISE EXCEPTION 'prepared admission did not copy history state: %', row_to_json(v_turn);
	END IF;

	IF position('history_cutoff_at' in pg_get_functiondef(
		'public.validate_agentic_chat_prepared_history_currency()'::regprocedure
	)) = 0 OR position('UPDATE public.chat_turn_runs' in pg_get_functiondef(
		'public.validate_agentic_chat_prepared_history_currency()'::regprocedure
	)) = 0 THEN
		RAISE EXCEPTION 'composed trigger body is missing a required contract';
	END IF;

	IF has_function_privilege(
		'anon',
		'public.validate_agentic_chat_prepared_history_currency()',
		'EXECUTE'
	) OR has_function_privilege(
		'authenticated',
		'public.validate_agentic_chat_prepared_history_currency()',
		'EXECUTE'
	) THEN
		RAISE EXCEPTION 'trigger function execution widened';
	END IF;
END;
$$;

SELECT 'agentic_chat_history_state_trigger_composition_ok' AS result;
