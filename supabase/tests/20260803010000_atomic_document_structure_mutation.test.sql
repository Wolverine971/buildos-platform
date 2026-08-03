-- supabase/tests/20260803010000_atomic_document_structure_mutation.test.sql
-- Disposable PostgreSQL verification for the atomic document-structure RPC.
-- Prerequisite: apply 20260803010000_atomic_document_structure_mutation.sql.
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
VALUES ('a0000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_projects (id, doc_structure)
VALUES (
	'b0000000-0000-4000-8000-000000000001',
	'{"version":1,"root":[{"id":"c0000000-0000-4000-8000-000000000001","order":0,"children":[{"id":"c0000000-0000-4000-8000-000000000003","order":0}]},{"id":"c0000000-0000-4000-8000-000000000002","order":1}]}'::jsonb
);

INSERT INTO public.onto_documents (id, project_id, children)
VALUES
	(
		'c0000000-0000-4000-8000-000000000001',
		'b0000000-0000-4000-8000-000000000001',
		'{"children":[{"id":"c0000000-0000-4000-8000-000000000003","order":0}]}'::jsonb
	),
	(
		'c0000000-0000-4000-8000-000000000002',
		'b0000000-0000-4000-8000-000000000001',
		'{"children":[]}'::jsonb
	),
	(
		'c0000000-0000-4000-8000-000000000003',
		'b0000000-0000-4000-8000-000000000001',
		'{"children":[]}'::jsonb
	);

SELECT pg_temp.assert_true(
	not has_function_privilege(
		'anon',
		'public.onto_project_doc_structure_update_atomic(uuid,integer,jsonb,text,uuid,jsonb)',
		'execute'
	),
	'anon must not execute the document-structure mutation RPC'
);

SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_project_doc_structure_update_atomic(uuid,integer,jsonb,text,uuid,jsonb)',
		'execute'
	),
	'authenticated callers must be able to execute the document-structure mutation RPC'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_project_doc_structure_update_atomic(
	'b0000000-0000-4000-8000-000000000001',
	1,
	'{"version":2,"root":[{"id":"c0000000-0000-4000-8000-000000000001","order":0},{"id":"c0000000-0000-4000-8000-000000000002","order":1,"children":[{"id":"c0000000-0000-4000-8000-000000000003","order":0}]}]}'::jsonb,
	'move',
	'a0000000-0000-4000-8000-000000000001',
	'[{"document_id":"c0000000-0000-4000-8000-000000000001","children":[]},{"document_id":"c0000000-0000-4000-8000-000000000002","children":[{"id":"c0000000-0000-4000-8000-000000000003","order":0}]}]'::jsonb
);

SELECT pg_temp.assert_true(
	(SELECT doc_structure->>'version' = '2' FROM public.onto_projects WHERE id = 'b0000000-0000-4000-8000-000000000001'),
	'canonical project structure was not updated'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND max(version) = 2
			AND bool_and(changed_by = 'a0000000-0000-4000-8000-000000000001'::uuid)
		FROM public.onto_project_structure_history
		WHERE project_id = 'b0000000-0000-4000-8000-000000000001'
	),
	'exactly one matching history row was not written'
);

SELECT pg_temp.assert_true(
	(
		SELECT children = '{"children":[]}'::jsonb
		FROM public.onto_documents
		WHERE id = 'c0000000-0000-4000-8000-000000000001'
	),
	'old parent child cache was not cleared'
);

SELECT pg_temp.assert_true(
	(
		SELECT children = '{"children":[{"id":"c0000000-0000-4000-8000-000000000003","order":0}]}'::jsonb
		FROM public.onto_documents
		WHERE id = 'c0000000-0000-4000-8000-000000000002'
	),
	'new parent child cache was not updated'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_project_doc_structure_update_atomic(
			'b0000000-0000-4000-8000-000000000001',
			1,
			'{"version":2,"root":[]}'::jsonb,
			'reorder',
			'a0000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected stale structure mutation to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'doc_structure_version_conflict',
				'stale mutation returned the wrong error'
			);
	END;
END;
$$;

-- The missing document error occurs after the project/history statements inside
-- the function. Catching it proves PostgreSQL rolls the entire function call back.
DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_project_doc_structure_update_atomic(
			'b0000000-0000-4000-8000-000000000001',
			2,
			'{"version":3,"root":[]}'::jsonb,
			'delete',
			'a0000000-0000-4000-8000-000000000001',
			'[{"document_id":"c0000000-0000-4000-8000-000000000099","children":[]}]'::jsonb
		);
		RAISE EXCEPTION 'expected missing document mutation to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'doc_structure_document_mismatch',
				'missing document mutation returned the wrong error'
			);
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(SELECT doc_structure->>'version' = '2' FROM public.onto_projects WHERE id = 'b0000000-0000-4000-8000-000000000001'),
	'failed child synchronization did not roll back the canonical structure'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND max(version) = 2
		FROM public.onto_project_structure_history
		WHERE project_id = 'b0000000-0000-4000-8000-000000000001'
	),
	'failed child synchronization did not roll back structure history'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('test.allow_project_write', 'false', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_project_doc_structure_update_atomic(
			'b0000000-0000-4000-8000-000000000001',
			2,
			'{"version":3,"root":[]}'::jsonb,
			'reorder',
			'a0000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected unauthorized structure mutation to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'doc_structure_access_denied',
				'unauthorized mutation returned the wrong error'
			);
	END;
END;
$$;

ROLLBACK;
