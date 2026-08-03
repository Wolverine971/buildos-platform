-- supabase/tests/20260803012000_atomic_document_restore.test.sql
-- Disposable PostgreSQL verification for the atomic document-restore RPC.
-- Prerequisites: apply structure, archive, and restore migrations in order.
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

INSERT INTO public.onto_actors (id)
VALUES ('a2000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_projects (id, doc_structure)
VALUES
	(
		'b2000000-0000-4000-8000-000000000001',
		'{"version":1,"root":[{"id":"c2000000-0000-4000-8000-000000000002","order":0}]}'::jsonb
	),
	(
		'b2000000-0000-4000-8000-000000000002',
		'{"version":1,"root":[{"id":"c2000000-0000-4000-8000-000000000003","order":0,"children":[{"id":"c2000000-0000-4000-8000-000000000004","order":0}]}]}'::jsonb
	);

INSERT INTO public.onto_documents (
	id,
	project_id,
	title,
	state_key,
	children,
	updated_at
)
VALUES
	(
		'c2000000-0000-4000-8000-000000000001',
		'b2000000-0000-4000-8000-000000000001',
		'Normally unlinked archived document',
		'archived',
		'{"children":[]}'::jsonb,
		'2026-08-03T13:00:00Z'
	),
	(
		'c2000000-0000-4000-8000-000000000002',
		'b2000000-0000-4000-8000-000000000001',
		'Unrelated document',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T13:00:00Z'
	),
	(
		'c2000000-0000-4000-8000-000000000003',
		'b2000000-0000-4000-8000-000000000002',
		'Legacy archived tree parent',
		'archived',
		'{"children":[{"id":"c2000000-0000-4000-8000-000000000004","order":0}]}'::jsonb,
		'2026-08-03T13:00:00Z'
	),
	(
		'c2000000-0000-4000-8000-000000000004',
		'b2000000-0000-4000-8000-000000000002',
		'Promoted child',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T13:00:00Z'
	);

SELECT pg_temp.assert_true(
	not has_function_privilege(
		'anon',
		'public.onto_document_restore_atomic(uuid,uuid,text,timestamptz,integer,jsonb,uuid,jsonb)',
		'execute'
	),
	'anon must not execute the document restore RPC'
);

SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_document_restore_atomic(uuid,uuid,text,timestamptz,integer,jsonb,uuid,jsonb)',
		'execute'
	),
	'authenticated callers must be able to execute the document restore RPC'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_document_restore_atomic(
	'b2000000-0000-4000-8000-000000000001',
	'c2000000-0000-4000-8000-000000000001',
	'draft',
	'2026-08-03T13:00:00Z',
	1,
	NULL,
	'a2000000-0000-4000-8000-000000000001',
	'[]'::jsonb
);

SELECT pg_temp.assert_true(
	(
		SELECT state_key = 'draft'
		FROM public.onto_documents
		WHERE id = 'c2000000-0000-4000-8000-000000000001'
	),
	'normal restore did not update the document state'
);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '1'
		FROM public.onto_projects
		WHERE id = 'b2000000-0000-4000-8000-000000000001'
	),
	'normal restore rewrote an unchanged document tree'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.onto_project_structure_history
		WHERE project_id = 'b2000000-0000-4000-8000-000000000001'
	),
	'normal restore wrote history for an unchanged document tree'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_restore_atomic(
			'b2000000-0000-4000-8000-000000000001',
			'c2000000-0000-4000-8000-000000000001',
			'ready',
			'2026-08-03T13:00:00Z',
			1,
			NULL,
			'a2000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected stale restore to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'document_restore_version_conflict',
				'stale restore returned the wrong error'
			);
	END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail_document_restore()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF coalesce(current_setting('test.fail_restore', true), 'false')::boolean
		AND OLD.state_key = 'archived'
		AND NEW.state_key <> 'archived' THEN
		RAISE EXCEPTION 'test_restore_row_failure';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_fail_document_restore
BEFORE UPDATE ON public.onto_documents
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_document_restore();

SELECT set_config('test.fail_restore', 'true', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_restore_atomic(
			'b2000000-0000-4000-8000-000000000002',
			'c2000000-0000-4000-8000-000000000003',
			'draft',
			'2026-08-03T13:00:00Z',
			1,
			'{"version":2,"root":[{"id":"c2000000-0000-4000-8000-000000000004","order":0}]}'::jsonb,
			'a2000000-0000-4000-8000-000000000001',
			'[{"document_id":"c2000000-0000-4000-8000-000000000003","children":[]}]'::jsonb
		);
		RAISE EXCEPTION 'expected restore row update to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'test_restore_row_failure',
				'restore row failure returned the wrong error'
			);
	END;
END;
$$;

SELECT set_config('test.fail_restore', 'false', true);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '1'
		FROM public.onto_projects
		WHERE id = 'b2000000-0000-4000-8000-000000000002'
	),
	'failed legacy restore did not roll back the canonical tree'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.onto_project_structure_history
		WHERE project_id = 'b2000000-0000-4000-8000-000000000002'
	),
	'failed legacy restore did not roll back structure history'
);

SELECT pg_temp.assert_true(
	(
		SELECT children = '{"children":[{"id":"c2000000-0000-4000-8000-000000000004","order":0}]}'::jsonb
		FROM public.onto_documents
		WHERE id = 'c2000000-0000-4000-8000-000000000003'
	),
	'failed legacy restore did not roll back the child cache'
);

SELECT pg_temp.assert_true(
	(
		SELECT state_key = 'archived'
		FROM public.onto_documents
		WHERE id = 'c2000000-0000-4000-8000-000000000003'
	),
	'failed legacy restore changed the document state'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('test.allow_project_write', 'false', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_restore_atomic(
			'b2000000-0000-4000-8000-000000000002',
			'c2000000-0000-4000-8000-000000000003',
			'draft',
			'2026-08-03T13:00:00Z',
			1,
			NULL,
			'a2000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected unauthorized restore to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'document_restore_access_denied',
				'unauthorized restore returned the wrong error'
			);
	END;
END;
$$;

ROLLBACK;
