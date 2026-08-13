-- supabase/tests/20260813010000_agentic_chat_supervisor_question_checkpoint.test.sql
-- Disposable PostgreSQL verification for the S3 supervisor-question checkpoint.
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
EXCEPTION WHEN OTHERS THEN
	RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_supervisor_question_checkpoint(uuid,uuid,uuid,uuid,integer,uuid,uuid,integer,text,text,jsonb,jsonb,jsonb)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_supervisor_question_checkpoint(uuid,uuid,uuid,uuid,integer,uuid,uuid,integer,text,text,jsonb,jsonb,jsonb)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_supervisor_question_checkpoint(uuid,uuid,uuid,uuid,integer,uuid,uuid,integer,text,text,jsonb,jsonb,jsonb)',
		'EXECUTE'
	),
	'supervisor checkpoint function grants are not service-only'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
	'fc300000-0000-4000-8000-000000000003',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000004',
	'fe600000-0000-4000-8000-000000000006',
	1,
	'ca000000-0000-5000-8000-000000000001',
	'cb000000-0000-5000-8000-000000000002',
	3,
	'repeated_validation_failures',
	'Which exact task should I update?',
	'{"contextType":"project","validationFailureCount":2}'::jsonb,
	'{"missing_field":"task_id","instruction":"Continue after the user identifies the task."}'::jsonb,
	'{
		"action":"ask_user",
		"question":"Which exact task should I update?",
		"reason":"repeated_validation_failures",
		"checkpoint":{
			"digest":{"contextType":"project","validationFailureCount":2},
			"resumeContext":{"missing_field":"task_id","instruction":"Continue after the user identifies the task."}
		}
	}'::jsonb
) AS receipt \gset first_

SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
	'fc300000-0000-4000-8000-000000000003',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000004',
	'fe600000-0000-4000-8000-000000000006',
	1,
	'ca000000-0000-5000-8000-000000000001',
	'cb000000-0000-5000-8000-000000000002',
	3,
	'repeated_validation_failures',
	'Which exact task should I update?',
	'{"contextType":"project","validationFailureCount":2}'::jsonb,
	'{"missing_field":"task_id","instruction":"Continue after the user identifies the task."}'::jsonb,
	'{
		"action":"ask_user",
		"question":"Which exact task should I update?",
		"reason":"repeated_validation_failures",
		"checkpoint":{
			"digest":{"contextType":"project","validationFailureCount":2},
			"resumeContext":{"missing_field":"task_id","instruction":"Continue after the user identifies the task."}
		}
	}'::jsonb
) AS receipt \gset replay_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'first_receipt'::jsonb->>'outcome' = 'persisted'
	AND :'replay_receipt'::jsonb->>'outcome' = 'already_persisted'
	AND :'first_receipt'::jsonb->>'checkpoint_id' = 'ca000000-0000-5000-8000-000000000001'
	AND :'first_receipt'::jsonb->>'supervisor_transition_id' = 'cb000000-0000-5000-8000-000000000002'
	AND (:'first_receipt'::jsonb->>'sequence')::integer = 3,
	'checkpoint insert/replay receipt is inconsistent'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND bool_and(
				execution_generation = 1
				AND supervisor_transition_id = 'cb000000-0000-5000-8000-000000000002'
				AND supervisor_sequence = 3
				AND checkpoint_type = 'supervisor_question'
				AND status = 'active'
				AND reason = 'repeated_validation_failures'
				AND question = 'Which exact task should I update?'
				AND digest = '{"contextType":"project","validationFailureCount":2}'::jsonb
				AND resume_context->>'missing_field' = 'task_id'
				AND supervisor_decision->>'action' = 'ask_user'
				AND expires_at = created_at + interval '24 hours'
			)
		FROM public.chat_turn_checkpoints
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000003'
	),
	'persisted checkpoint row is not exact'
);

-- The additive worker identity must not change legacy web inserts.
SET ROLE service_role;
INSERT INTO public.chat_turn_checkpoints(
	id, turn_run_id, session_id, user_id, checkpoint_type, status, reason,
	digest, resume_context, supervisor_decision, question
) VALUES (
	'cc000000-0000-4000-8000-000000000003',
	'fc300000-0000-4000-8000-000000000003',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'supervisor_question', 'active', 'legacy_fixture', '{}', '{}', '{}', 'Legacy question'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT execution_generation IS NULL
			AND supervisor_transition_id IS NULL
			AND supervisor_sequence IS NULL
		FROM public.chat_turn_checkpoints
		WHERE id = 'cc000000-0000-4000-8000-000000000003'
	),
	'legacy checkpoint did not retain nullable worker identity'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
			'fc300000-0000-4000-8000-000000000003',
			'fa100000-0000-4000-8000-000000000001',
			'fc400000-0000-4000-8000-000000000004',
			'fe600000-0000-4000-8000-000000000006',
			1,
			'ca000000-0000-5000-8000-000000000001',
			'cb000000-0000-5000-8000-000000000002',
			3,
			'repeated_validation_failures',
			'Different question',
			'{"contextType":"project","validationFailureCount":2}'::jsonb,
			'{"missing_field":"task_id","instruction":"Continue after the user identifies the task."}'::jsonb,
			'{"action":"ask_user","question":"Different question","reason":"repeated_validation_failures","checkpoint":{"digest":{"contextType":"project","validationFailureCount":2},"resumeContext":{"missing_field":"task_id","instruction":"Continue after the user identifies the task."}}}'::jsonb
		)$$,
		'agentic_chat_supervisor_checkpoint_replay_conflict'
	),
	'conflicting checkpoint replay was not rejected'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
			'fc300000-0000-4000-8000-000000000003',
			'fa100000-0000-4000-8000-000000000001',
			'fc400000-0000-4000-8000-000000000004',
			'fe600000-0000-4000-8000-000000000006',
			1,
			'cd000000-0000-5000-8000-000000000004',
			'ce000000-0000-5000-8000-000000000005',
			4,
			'repeated_validation_failures',
			'Which task?',
			'{"contextType":"project"}'::jsonb,
			'{"missing_field":"task_id"}'::jsonb,
			'{"action":"ask_user","question":"Wrong","reason":"repeated_validation_failures","checkpoint":{"digest":{"contextType":"project"},"resumeContext":{"missing_field":"task_id"}}}'::jsonb
		)$$,
		'agentic_chat_supervisor_checkpoint_invalid_payload'
	),
	'mismatched decision payload was not rejected'
);
RESET ROLE;

UPDATE public.chat_turn_runs SET execution_generation = 2
WHERE id = 'fc300000-0000-4000-8000-000000000003';
SET ROLE service_role;
SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
	'fc300000-0000-4000-8000-000000000003',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000004',
	'fe600000-0000-4000-8000-000000000006',
	1,
	'cf000000-0000-5000-8000-000000000006',
	'c1000000-0000-5000-8000-000000000007',
	4,
	'repeated_validation_failures',
	'Which task?',
	'{"contextType":"project"}'::jsonb,
	'{"missing_field":"task_id"}'::jsonb,
	'{"action":"ask_user","question":"Which task?","reason":"repeated_validation_failures","checkpoint":{"digest":{"contextType":"project"},"resumeContext":{"missing_field":"task_id"}}}'::jsonb
) AS receipt \gset stale_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'stale_receipt'::jsonb->>'outcome' = 'stale_generation',
	'stale generation did not lose the checkpoint fence'
);

UPDATE public.chat_turn_runs
SET execution_generation = 1, cancel_requested_at = transaction_timestamp(), cancel_reason = 'user_cancelled'
WHERE id = 'fc300000-0000-4000-8000-000000000003';
SET ROLE service_role;
SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
	'fc300000-0000-4000-8000-000000000003',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000004',
	'fe600000-0000-4000-8000-000000000006',
	1,
	'cf000000-0000-5000-8000-000000000006',
	'c1000000-0000-5000-8000-000000000007',
	4,
	'repeated_validation_failures',
	'Which task?',
	'{"contextType":"project"}'::jsonb,
	'{"missing_field":"task_id"}'::jsonb,
	'{"action":"ask_user","question":"Which task?","reason":"repeated_validation_failures","checkpoint":{"digest":{"contextType":"project"},"resumeContext":{"missing_field":"task_id"}}}'::jsonb
) AS receipt \gset cancelled_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'cancelled_receipt'::jsonb->>'outcome' = 'cancel_requested',
	'cancel request did not win the checkpoint fence'
);

UPDATE public.chat_turn_runs
SET cancel_requested_at = NULL, cancel_reason = NULL, status = 'completed'
WHERE id = 'fc300000-0000-4000-8000-000000000003';
SET ROLE service_role;
SELECT public.persist_agentic_chat_supervisor_question_checkpoint(
	'fc300000-0000-4000-8000-000000000003',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000004',
	'fe600000-0000-4000-8000-000000000006',
	1,
	'cf000000-0000-5000-8000-000000000006',
	'c1000000-0000-5000-8000-000000000007',
	4,
	'repeated_validation_failures',
	'Which task?',
	'{"contextType":"project"}'::jsonb,
	'{"missing_field":"task_id"}'::jsonb,
	'{"action":"ask_user","question":"Which task?","reason":"repeated_validation_failures","checkpoint":{"digest":{"contextType":"project"},"resumeContext":{"missing_field":"task_id"}}}'::jsonb
) AS receipt \gset terminal_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'terminal_receipt'::jsonb->>'outcome' = 'already_terminal',
	'terminal turn did not reject a new checkpoint'
);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM public.chat_turn_checkpoints),
	'failed or fenced checkpoint calls leaked rows'
);

SELECT 'agentic_chat_supervisor_question_checkpoint_ok' AS result;

