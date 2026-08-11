-- supabase/tests/20260811010000_agentic_chat_task_move_worker_bridge.test.sql
-- Disposable PostgreSQL verification for the worker task-move bridge.
-- Prerequisite: apply task_move_worker_bridge_base.sql, then the migration.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.onto_task_move_atomic_for_user(uuid,uuid,uuid,uuid,text)',
		'execute'
	),
	'anon must not execute the worker task-move bridge'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'authenticated',
		'public.onto_task_move_atomic_for_user(uuid,uuid,uuid,uuid,text)',
		'execute'
	),
	'authenticated callers must not execute the worker task-move bridge'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.onto_task_move_atomic_for_user(uuid,uuid,uuid,uuid,text)',
		'execute'
	),
	'service_role must execute the worker task-move bridge'
);

INSERT INTO public.users (id, email)
VALUES
	('11000000-0000-4000-8000-000000000001', 'move-owner@example.test'),
	('11000000-0000-4000-8000-000000000002', 'move-outsider@example.test');

INSERT INTO public.onto_actors (id, kind, name, user_id)
VALUES
	(
		'12000000-0000-4000-8000-000000000001',
		'human',
		'Move Owner',
		'11000000-0000-4000-8000-000000000001'
	),
	(
		'12000000-0000-4000-8000-000000000002',
		'human',
		'Move Outsider',
		'11000000-0000-4000-8000-000000000002'
	);

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES
	(
		'13000000-0000-4000-8000-000000000001',
		'Move Source',
		'project.test.task_move',
		'12000000-0000-4000-8000-000000000001'
	),
	(
		'13000000-0000-4000-8000-000000000002',
		'Move Destination',
		'project.test.task_move',
		'12000000-0000-4000-8000-000000000001'
	);

-- Replace the established inner command only inside this rolled-back
-- transaction. The stub makes delegation and auth.uid() impersonation directly
-- observable without constructing the task move's full dependent graph.
CREATE OR REPLACE FUNCTION public.onto_task_move_atomic(
	p_task_id uuid,
	p_expected_source_project_id uuid,
	p_destination_project_id uuid,
	p_confirmation_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'subject', auth.uid(),
		'task_id', p_task_id,
		'source_project_id', p_expected_source_project_id,
		'destination_project_id', p_destination_project_id,
		'confirmation_token', p_confirmation_token
	);
$$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config(
	'request.jwt.claim.sub',
	'11000000-0000-4000-8000-000000000002',
	true
);

CREATE TEMP TABLE task_move_bridge_receipt AS
SELECT public.onto_task_move_atomic_for_user(
	'11000000-0000-4000-8000-000000000001',
	'14000000-0000-4000-8000-000000000001',
	'13000000-0000-4000-8000-000000000001',
	'13000000-0000-4000-8000-000000000002',
	'confirmed-token'
) AS receipt;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'subject' = '11000000-0000-4000-8000-000000000001'
			AND receipt->>'task_id' = '14000000-0000-4000-8000-000000000001'
			AND receipt->>'source_project_id' = '13000000-0000-4000-8000-000000000001'
			AND receipt->>'destination_project_id' = '13000000-0000-4000-8000-000000000002'
			AND receipt->>'confirmation_token' = 'confirmed-token'
		FROM task_move_bridge_receipt
	),
	'worker bridge must delegate the exact arguments under the explicit user subject'
);
SELECT pg_temp.assert_true(
	current_setting('request.jwt.claim.sub', true) =
		'11000000-0000-4000-8000-000000000002',
	'worker bridge must restore the prior request subject'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_task_move_atomic_for_user(
			'11000000-0000-4000-8000-000000000002',
			'14000000-0000-4000-8000-000000000001',
			'13000000-0000-4000-8000-000000000001',
			'13000000-0000-4000-8000-000000000002',
			NULL
		);
		RAISE EXCEPTION 'expected worker bridge access denial';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			IF v_message = 'expected worker bridge access denial' THEN
				RAISE;
			END IF;
			PERFORM pg_temp.assert_true(
				v_message = 'task_move_access_denied',
				'worker bridge must fail closed for an actor without both project grants'
			);
	END;
END;
$$;

ROLLBACK;
