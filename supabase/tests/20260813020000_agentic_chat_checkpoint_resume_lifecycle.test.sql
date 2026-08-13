-- supabase/tests/20260813020000_agentic_chat_checkpoint_resume_lifecycle.test.sql
-- Disposable PostgreSQL verification for the S4 immutable resume lifecycle.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink;

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

CREATE OR REPLACE FUNCTION pg_temp.attempt_resume_admission(
	p_turn_run_id uuid,
	p_artifact_id uuid,
	p_prepared jsonb,
	p_expected_error text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_runs(
			id, session_id, user_id, correlation_id, execution_mode,
			execution_generation, status
		) VALUES (
			p_turn_run_id,
			'fb200000-0000-4000-8000-000000000002',
			'fa100000-0000-4000-8000-000000000001',
			gen_random_uuid(),
			'worker_realtime',
			0,
			'queued'
		);
		INSERT INTO public.chat_turn_input_artifacts(
			id, turn_run_id, session_id, user_id, prepared
		) VALUES (
			p_artifact_id,
			p_turn_run_id,
			'fb200000-0000-4000-8000-000000000002',
			'fa100000-0000-4000-8000-000000000001',
			p_prepared
		);
		RETURN false;
	EXCEPTION WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected_error || '%';
	END;
END;
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.recover_agentic_chat_resume_checkpoints(uuid,timestamptz,timestamptz)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.recover_agentic_chat_resume_checkpoints(uuid,timestamptz,timestamptz)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.recover_agentic_chat_resume_checkpoints(uuid,timestamptz,timestamptz)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.claim_agentic_chat_resume_checkpoint_for_artifact()',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'service_role',
		'public.resolve_agentic_chat_resume_checkpoint_on_terminal()',
		'EXECUTE'
	),
	'resume lifecycle function grants are not least-privilege'
);

-- The artifact insert claims the newest exact active checkpoint.
INSERT INTO public.chat_turn_checkpoints(
	id, turn_run_id, session_id, user_id, execution_generation,
	supervisor_transition_id, supervisor_sequence, checkpoint_type, status,
	reason, digest, resume_context, supervisor_decision, question,
	expires_at, created_at
) VALUES (
	'c4000000-0000-4000-8000-000000000001',
	'fc300000-0000-4000-8000-000000000003',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	1,
	'cb000000-0000-5000-8000-000000000002',
	3,
	'supervisor_question',
	'active',
	'repeated_validation_failures',
	'{"validationFailureCount":2}',
	'{"instruction":"Continue after the user identifies the task.","missing_field":"task_id"}',
	'{"action":"ask_user"}',
	'Which exact task should I update?',
	'2026-08-14T12:00:00Z',
	'2026-08-13T10:00:00Z'
);

SET ROLE service_role;
INSERT INTO public.chat_turn_runs(
	id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status
) VALUES (
	'd1000000-0000-4000-8000-000000000001',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000002',
	'worker_realtime',
	0,
	'queued'
);
INSERT INTO public.chat_turn_input_artifacts(
	id, turn_run_id, session_id, user_id, prepared
) VALUES (
	'd3000000-0000-4000-8000-000000000003',
	'd1000000-0000-4000-8000-000000000001',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'{
		"resumeCheckpoint": {
			"checkpointId":"c4000000-0000-4000-8000-000000000001",
			"originalTurnRunId":"fc300000-0000-4000-8000-000000000003",
			"checkpointType":"supervisor_question",
			"reason":"repeated_validation_failures",
			"question":"Which exact task should I update?",
			"resumeContext":{"instruction":"Continue after the user identifies the task.","missing_field":"task_id"},
			"resumeMessage":"Continue from the previous supervisor checkpoint.\nDo not re-run completed reads or writes unless the user answer changes the target.\nSupervisor question that paused the previous turn: Which exact task should I update?\nCheckpoint resume context: {\"instruction\":\"Continue after the user identifies the task.\",\"missing_field\":\"task_id\"}",
			"sourceExecutionGeneration":1,
			"supervisorTransitionId":"cb000000-0000-5000-8000-000000000002",
			"supervisorSequence":3
		}
	}'::jsonb
);
UPDATE public.chat_turn_runs
SET input_artifact_id = 'd3000000-0000-4000-8000-000000000003'
WHERE id = 'd1000000-0000-4000-8000-000000000001';
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'resuming'
			AND resume_turn_run_id = 'd1000000-0000-4000-8000-000000000001'
			AND resume_started_at IS NOT NULL
		FROM public.chat_turn_checkpoints
		WHERE id = 'c4000000-0000-4000-8000-000000000001'
	),
	'artifact admission did not atomically claim the exact checkpoint'
);

-- Later mutable source drift cannot alter the worker's frozen resume message.
UPDATE public.chat_turn_checkpoints
SET question = 'A later mutable question',
	resume_context = '{"later":"drift"}'
WHERE id = 'c4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT prepared->'resumeCheckpoint'->>'question'
			= 'Which exact task should I update?'
			AND prepared->'resumeCheckpoint'->'resumeContext'
				= '{"instruction":"Continue after the user identifies the task.","missing_field":"task_id"}'::jsonb
		FROM public.chat_turn_input_artifacts
		WHERE id = 'd3000000-0000-4000-8000-000000000003'
	),
	'mutable checkpoint drift changed the immutable worker artifact'
);

SET ROLE service_role;
UPDATE public.chat_turn_runs
SET status = 'completed'
WHERE id = 'd1000000-0000-4000-8000-000000000001';
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'resumed' AND resumed_at IS NOT NULL
		FROM public.chat_turn_checkpoints
		WHERE id = 'c4000000-0000-4000-8000-000000000001'
	),
	'completed terminal truth did not hard-consume the checkpoint'
);

-- Failed terminal truth restores the claimed checkpoint to active.
INSERT INTO public.chat_turn_checkpoints(
	id, turn_run_id, session_id, user_id, checkpoint_type, status, reason,
	digest, resume_context, supervisor_decision, question, expires_at, created_at
) VALUES (
	'c5000000-0000-4000-8000-000000000002',
	'fc300000-0000-4000-8000-000000000003',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'supervisor_question', 'active', 'legacy_resume', '{}',
	'{"known":"value"}', '{}', 'Continue?',
	'2026-08-14T12:00:00Z', '2026-08-13T10:05:00Z'
);

SET ROLE service_role;
INSERT INTO public.chat_turn_runs(
	id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status
) VALUES (
	'd1000000-0000-4000-8000-000000000004',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000005',
	'worker_realtime', 0, 'queued'
);
INSERT INTO public.chat_turn_input_artifacts(
	id, turn_run_id, session_id, user_id, prepared
) VALUES (
	'd3000000-0000-4000-8000-000000000006',
	'd1000000-0000-4000-8000-000000000004',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'{"resumeCheckpoint":{"checkpointId":"c5000000-0000-4000-8000-000000000002","originalTurnRunId":"fc300000-0000-4000-8000-000000000003","checkpointType":"supervisor_question","reason":"legacy_resume","question":"Continue?","resumeContext":{"known":"value"},"resumeMessage":"Continue from the previous supervisor checkpoint.\nDo not re-run completed reads or writes unless the user answer changes the target.\nSupervisor question that paused the previous turn: Continue?\nCheckpoint resume context: {\"known\":\"value\"}","sourceExecutionGeneration":null,"supervisorTransitionId":null,"supervisorSequence":null}}'::jsonb
);
UPDATE public.chat_turn_runs
SET input_artifact_id = 'd3000000-0000-4000-8000-000000000006',
	status = 'failed'
WHERE id = 'd1000000-0000-4000-8000-000000000004';
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'active'
			AND resume_turn_run_id IS NULL
			AND resume_started_at IS NULL
			AND resumed_at IS NULL
		FROM public.chat_turn_checkpoints
		WHERE id = 'c5000000-0000-4000-8000-000000000002'
	),
	'failed terminal truth did not restore the checkpoint'
);

-- Any missing or drifting snapshot rolls back both turn and artifact admission.
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.attempt_resume_admission(
		'd1000000-0000-4000-8000-000000000007',
		'd3000000-0000-4000-8000-000000000008',
		'{}'::jsonb,
		'agentic_chat_resume_artifact_snapshot_mismatch'
	),
	'missing active-checkpoint snapshot was not rejected'
);
SELECT pg_temp.assert_true(
	pg_temp.attempt_resume_admission(
		'd1000000-0000-4000-8000-000000000009',
		'd3000000-0000-4000-8000-000000000010',
		'{"resumeCheckpoint":{"checkpointId":"c5000000-0000-4000-8000-000000000002","originalTurnRunId":"fc300000-0000-4000-8000-000000000003","checkpointType":"supervisor_question","reason":"wrong_reason","question":"Continue?","resumeContext":{"known":"value"},"resumeMessage":"wrong","sourceExecutionGeneration":null,"supervisorTransitionId":null,"supervisorSequence":null}}'::jsonb,
		'agentic_chat_resume_artifact_snapshot_mismatch'
	),
	'drifting active-checkpoint snapshot was not rejected'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.chat_turn_runs
		WHERE id IN (
			'd1000000-0000-4000-8000-000000000007',
			'd1000000-0000-4000-8000-000000000009'
		)
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_turn_input_artifacts
		WHERE id IN (
			'd3000000-0000-4000-8000-000000000008',
			'd3000000-0000-4000-8000-000000000010'
		)
	)
	AND (
		SELECT status = 'active'
		FROM public.chat_turn_checkpoints
		WHERE id = 'c5000000-0000-4000-8000-000000000002'
	),
	'failed admission leaked a turn, artifact, or checkpoint claim'
);

-- Expired active rows do not require a resume snapshot.
UPDATE public.chat_turn_checkpoints
SET expires_at = '2026-08-12T00:00:00Z'
WHERE id = 'c5000000-0000-4000-8000-000000000002';
SET ROLE service_role;
INSERT INTO public.chat_turn_runs(
	id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status
) VALUES (
	'd1000000-0000-4000-8000-000000000011',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000012',
	'worker_realtime', 0, 'queued'
);
INSERT INTO public.chat_turn_input_artifacts(
	id, turn_run_id, session_id, user_id, prepared
) VALUES (
	'd3000000-0000-4000-8000-000000000013',
	'd1000000-0000-4000-8000-000000000011',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'{}'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'expired'
		FROM public.chat_turn_checkpoints
		WHERE id = 'c5000000-0000-4000-8000-000000000002'
	),
	'expired active checkpoint was not retired during admission'
);

-- Recovery is service-only, idempotent, and leaves live queued/running claims alone.
INSERT INTO public.chat_turn_checkpoints(
	id, turn_run_id, session_id, user_id, resume_turn_run_id,
	checkpoint_type, status, reason, digest, resume_context,
	supervisor_decision, resume_started_at, expires_at
) VALUES
	(
		'c6000000-0000-4000-8000-000000000003',
		'fc300000-0000-4000-8000-000000000003',
		'fb200000-0000-4000-8000-000000000002',
		'fa100000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		'supervisor_resume', 'resuming', 'recover_completed', '{}', '{}', '{}',
		'2026-08-11T00:00:00Z', NULL
	),
	(
		'c6000000-0000-4000-8000-000000000004',
		'fc300000-0000-4000-8000-000000000003',
		'fb200000-0000-4000-8000-000000000002',
		'fa100000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000004',
		'supervisor_resume', 'resuming', 'recover_failed', '{}', '{}', '{}',
		'2026-08-11T00:00:00Z', NULL
	),
	(
		'c6000000-0000-4000-8000-000000000005',
		'fc300000-0000-4000-8000-000000000003',
		'fb200000-0000-4000-8000-000000000002',
		'fa100000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000011',
		'supervisor_resume', 'resuming', 'keep_queued', '{}', '{}', '{}',
		'2026-08-11T00:00:00Z', NULL
	),
	(
		'c6000000-0000-4000-8000-000000000006',
		'fc300000-0000-4000-8000-000000000003',
		'fb200000-0000-4000-8000-000000000002',
		'fa100000-0000-4000-8000-000000000001',
		NULL,
		'supervisor_resume', 'resuming', 'recover_orphan', '{}', '{}', '{}',
		'2026-08-11T00:00:00Z', NULL
	),
	(
		'c6000000-0000-4000-8000-000000000007',
		'fc300000-0000-4000-8000-000000000003',
		'fb200000-0000-4000-8000-000000000002',
		'fa100000-0000-4000-8000-000000000001',
		NULL,
		'supervisor_resume', 'active', 'recover_expired', '{}', '{}', '{}',
		NULL, '2026-08-12T00:00:00Z'
	);

SET ROLE service_role;
SELECT public.recover_agentic_chat_resume_checkpoints(
	'fa100000-0000-4000-8000-000000000001',
	'2026-08-13T00:00:00Z',
	'2026-08-13T12:00:00Z'
) AS receipt \gset recovery_
SELECT public.recover_agentic_chat_resume_checkpoints(
	'fa100000-0000-4000-8000-000000000001',
	'2026-08-13T00:00:00Z',
	'2026-08-13T12:00:00Z'
) AS receipt \gset replay_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'recovery_receipt'::jsonb->'marked_resumed_checkpoint_ids'
		@> '["c6000000-0000-4000-8000-000000000003"]'::jsonb
	AND :'recovery_receipt'::jsonb->'restored_active_checkpoint_ids'
		@> '["c6000000-0000-4000-8000-000000000004","c6000000-0000-4000-8000-000000000006"]'::jsonb
	AND :'recovery_receipt'::jsonb->'expired_checkpoint_ids'
		@> '["c6000000-0000-4000-8000-000000000007"]'::jsonb
	AND :'replay_receipt'::jsonb->'marked_resumed_checkpoint_ids' = '[]'::jsonb
	AND :'replay_receipt'::jsonb->'restored_active_checkpoint_ids' = '[]'::jsonb
	AND :'replay_receipt'::jsonb->'expired_checkpoint_ids' = '[]'::jsonb,
	'recovery receipt or exact replay is inconsistent'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'resuming'
			AND resume_turn_run_id = 'd1000000-0000-4000-8000-000000000011'
		FROM public.chat_turn_checkpoints
		WHERE id = 'c6000000-0000-4000-8000-000000000005'
	),
	'recovery stole a live queued resume claim'
);

-- Two simultaneous admissions for the same active checkpoint produce exactly
-- one committed claimant. The pause keeps the winning row lock open long
-- enough for the second connection to exercise the lock/recheck path.
INSERT INTO public.users(id)
VALUES ('ea100000-0000-4000-8000-000000000001');
INSERT INTO public.chat_sessions(id, user_id)
VALUES (
	'eb200000-0000-4000-8000-000000000002',
	'ea100000-0000-4000-8000-000000000001'
);
INSERT INTO public.chat_turn_runs(
	id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status
) VALUES (
	'ec300000-0000-4000-8000-000000000003',
	'eb200000-0000-4000-8000-000000000002',
	'ea100000-0000-4000-8000-000000000001',
	'ed400000-0000-4000-8000-000000000004',
	'worker_realtime', 1, 'completed'
);
INSERT INTO public.chat_turn_checkpoints(
	id, turn_run_id, session_id, user_id, checkpoint_type, status, reason,
	digest, resume_context, supervisor_decision, expires_at
) VALUES (
	'ee500000-0000-4000-8000-000000000005',
	'ec300000-0000-4000-8000-000000000003',
	'eb200000-0000-4000-8000-000000000002',
	'ea100000-0000-4000-8000-000000000001',
	'supervisor_resume', 'active', 'concurrent_resume', '{}',
	'{"known":"race"}', '{}', '2026-08-14T12:00:00Z'
);

CREATE OR REPLACE FUNCTION public.test_admit_checkpoint_resume_race(
	p_turn_run_id uuid,
	p_artifact_id uuid,
	p_correlation_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
	BEGIN
		INSERT INTO public.chat_turn_runs(
			id, session_id, user_id, correlation_id, execution_mode,
			execution_generation, status
		) VALUES (
			p_turn_run_id,
			'eb200000-0000-4000-8000-000000000002',
			'ea100000-0000-4000-8000-000000000001',
			p_correlation_id,
			'worker_realtime', 0, 'queued'
		);
		INSERT INTO public.chat_turn_input_artifacts(
			id, turn_run_id, session_id, user_id, prepared
		) VALUES (
			p_artifact_id,
			p_turn_run_id,
			'eb200000-0000-4000-8000-000000000002',
			'ea100000-0000-4000-8000-000000000001',
			'{"resumeCheckpoint":{"checkpointId":"ee500000-0000-4000-8000-000000000005","originalTurnRunId":"ec300000-0000-4000-8000-000000000003","checkpointType":"supervisor_resume","reason":"concurrent_resume","question":null,"resumeContext":{"known":"race"},"resumeMessage":"Continue from the previous supervisor checkpoint.\nDo not re-run completed reads or writes unless the user answer changes the target.\nCheckpoint resume context: {\"known\":\"race\"}","sourceExecutionGeneration":null,"supervisorTransitionId":null,"supervisorSequence":null}}'::jsonb
		);
		UPDATE public.chat_turn_runs
		SET input_artifact_id = p_artifact_id
		WHERE id = p_turn_run_id;
		PERFORM pg_sleep(0.5);
		RETURN 'claimed';
	EXCEPTION WHEN OTHERS THEN
		RETURN SQLERRM;
	END;
END;
$$;

SELECT dblink_connect(
	'resume_admit_a',
	format(
		'dbname=%L host=%L port=%L',
		current_database(),
		current_setting('unix_socket_directories'),
		current_setting('port')
	)
);
SELECT dblink_connect(
	'resume_admit_b',
	format(
		'dbname=%L host=%L port=%L',
		current_database(),
		current_setting('unix_socket_directories'),
		current_setting('port')
	)
);
SELECT dblink_send_query('resume_admit_a', $query$
	SELECT public.test_admit_checkpoint_resume_race(
		'ef600000-0000-4000-8000-000000000006',
		'e0700000-0000-4000-8000-000000000007',
		'e1800000-0000-4000-8000-000000000008'
	)
$query$);
SELECT dblink_send_query('resume_admit_b', $query$
	SELECT public.test_admit_checkpoint_resume_race(
		'ef600000-0000-4000-8000-000000000009',
		'e0700000-0000-4000-8000-000000000010',
		'e1800000-0000-4000-8000-000000000011'
	)
$query$);

CREATE TEMP TABLE concurrent_resume_admission_results(result text);
INSERT INTO concurrent_resume_admission_results
SELECT result
FROM dblink_get_result('resume_admit_a', false) AS response(result text);
INSERT INTO concurrent_resume_admission_results
SELECT result
FROM dblink_get_result('resume_admit_b', false) AS response(result text);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM concurrent_resume_admission_results WHERE result = 'claimed')
	AND (
		SELECT count(*) = 1
		FROM concurrent_resume_admission_results
		WHERE result LIKE '%agentic_chat_resume_artifact_snapshot_without_active_checkpoint%'
	)
	AND (
		SELECT count(*) = 1
		FROM public.chat_turn_runs
		WHERE id IN (
			'ef600000-0000-4000-8000-000000000006',
			'ef600000-0000-4000-8000-000000000009'
		)
	)
	AND (
		SELECT count(*) = 1
		FROM public.chat_turn_input_artifacts
		WHERE id IN (
			'e0700000-0000-4000-8000-000000000007',
			'e0700000-0000-4000-8000-000000000010'
		)
	)
	AND (
		SELECT status = 'resuming'
			AND resume_turn_run_id IN (
				'ef600000-0000-4000-8000-000000000006',
				'ef600000-0000-4000-8000-000000000009'
			)
		FROM public.chat_turn_checkpoints
		WHERE id = 'ee500000-0000-4000-8000-000000000005'
	),
	'concurrent checkpoint admission did not produce exactly one claimant'
);

SELECT dblink_disconnect('resume_admit_a');
SELECT dblink_disconnect('resume_admit_b');
DROP FUNCTION public.test_admit_checkpoint_resume_race(uuid, uuid, uuid);

SELECT 'agentic_chat_checkpoint_resume_lifecycle_ok' AS result;
