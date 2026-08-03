-- supabase/tests/20260803011000_atomic_document_archive.test.sql
-- Disposable PostgreSQL verification for the atomic document-archive RPC.
-- Prerequisites: apply the document structure and archive migrations in order.
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
VALUES ('a1000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_projects (id, doc_structure)
VALUES
	(
		'b1000000-0000-4000-8000-000000000001',
		'{"version":1,"root":[{"id":"c1000000-0000-4000-8000-000000000001","order":0,"children":[{"id":"c1000000-0000-4000-8000-000000000002","order":0}]},{"id":"c1000000-0000-4000-8000-000000000003","order":1}]}'::jsonb
	),
	(
		'b1000000-0000-4000-8000-000000000002',
		'{"version":1,"root":[{"id":"c1000000-0000-4000-8000-000000000004","order":0,"children":[{"id":"c1000000-0000-4000-8000-000000000005","order":0}]}]}'::jsonb
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
		'c1000000-0000-4000-8000-000000000001',
		'b1000000-0000-4000-8000-000000000001',
		'Archive target',
		'draft',
		'{"children":[{"id":"c1000000-0000-4000-8000-000000000002","order":0}]}'::jsonb,
		'2026-08-03T12:00:00Z'
	),
	(
		'c1000000-0000-4000-8000-000000000002',
		'b1000000-0000-4000-8000-000000000001',
		'Archive descendant',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T12:00:00Z'
	),
	(
		'c1000000-0000-4000-8000-000000000003',
		'b1000000-0000-4000-8000-000000000001',
		'Unrelated document',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T12:00:00Z'
	),
	(
		'c1000000-0000-4000-8000-000000000004',
		'b1000000-0000-4000-8000-000000000002',
		'Rollback target',
		'draft',
		'{"children":[{"id":"c1000000-0000-4000-8000-000000000005","order":0}]}'::jsonb,
		'2026-08-03T12:00:00Z'
	),
	(
		'c1000000-0000-4000-8000-000000000005',
		'b1000000-0000-4000-8000-000000000002',
		'Rollback descendant',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T12:00:00Z'
	);

SELECT pg_temp.assert_true(
	not has_function_privilege(
		'anon',
		'public.onto_document_archive_atomic(uuid,uuid,uuid[],timestamptz,integer,jsonb,uuid,jsonb)',
		'execute'
	),
	'anon must not execute the document archive RPC'
);

SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_document_archive_atomic(uuid,uuid,uuid[],timestamptz,integer,jsonb,uuid,jsonb)',
		'execute'
	),
	'authenticated callers must be able to execute the document archive RPC'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_document_archive_atomic(
	'b1000000-0000-4000-8000-000000000001',
	'c1000000-0000-4000-8000-000000000001',
	ARRAY[
		'c1000000-0000-4000-8000-000000000001'::uuid,
		'c1000000-0000-4000-8000-000000000002'::uuid
	],
	'2026-08-03T12:00:00Z',
	1,
	'{"version":2,"root":[{"id":"c1000000-0000-4000-8000-000000000003","order":0}]}'::jsonb,
	'a1000000-0000-4000-8000-000000000001',
	'[{"document_id":"c1000000-0000-4000-8000-000000000001","children":[]}]'::jsonb
);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '2'
		FROM public.onto_projects
		WHERE id = 'b1000000-0000-4000-8000-000000000001'
	),
	'archive did not update the canonical tree'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND max(version) = 2
		FROM public.onto_project_structure_history
		WHERE project_id = 'b1000000-0000-4000-8000-000000000001'
	),
	'archive did not write exactly one structure history row'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2 AND bool_and(state_key = 'archived')
		FROM public.onto_documents
		WHERE id = ANY(ARRAY[
			'c1000000-0000-4000-8000-000000000001'::uuid,
			'c1000000-0000-4000-8000-000000000002'::uuid
		])
	),
	'archive did not update the target and descendant rows'
);

SELECT pg_temp.assert_true(
	(
		SELECT state_key = 'draft'
		FROM public.onto_documents
		WHERE id = 'c1000000-0000-4000-8000-000000000003'
	),
	'archive changed an unrelated document row'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_archive_atomic(
			'b1000000-0000-4000-8000-000000000001',
			'c1000000-0000-4000-8000-000000000001',
			ARRAY['c1000000-0000-4000-8000-000000000001'::uuid],
			'2026-08-03T12:00:00Z',
			2,
			'{"version":3,"root":[]}'::jsonb,
			'a1000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected stale document archive to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'document_archive_version_conflict',
				'stale archive returned the wrong error'
			);
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '2'
		FROM public.onto_projects
		WHERE id = 'b1000000-0000-4000-8000-000000000001'
	),
	'stale archive changed the canonical tree'
);

CREATE OR REPLACE FUNCTION pg_temp.fail_document_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF coalesce(current_setting('test.fail_archive', true), 'false')::boolean
		AND NEW.state_key = 'archived' THEN
		RAISE EXCEPTION 'test_archive_row_failure';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_fail_document_archive
BEFORE UPDATE ON public.onto_documents
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_document_archive();

SELECT set_config('test.fail_archive', 'true', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_archive_atomic(
			'b1000000-0000-4000-8000-000000000002',
			'c1000000-0000-4000-8000-000000000004',
			ARRAY[
				'c1000000-0000-4000-8000-000000000004'::uuid,
				'c1000000-0000-4000-8000-000000000005'::uuid
			],
			'2026-08-03T12:00:00Z',
			1,
			'{"version":2,"root":[]}'::jsonb,
			'a1000000-0000-4000-8000-000000000001',
			'[{"document_id":"c1000000-0000-4000-8000-000000000004","children":[]}]'::jsonb
		);
		RAISE EXCEPTION 'expected archive row update to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'test_archive_row_failure',
				'archive row failure returned the wrong error'
			);
	END;
END;
$$;

SELECT set_config('test.fail_archive', 'false', true);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '1'
		FROM public.onto_projects
		WHERE id = 'b1000000-0000-4000-8000-000000000002'
	),
	'failed row archive did not roll back the canonical tree'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.onto_project_structure_history
		WHERE project_id = 'b1000000-0000-4000-8000-000000000002'
	),
	'failed row archive did not roll back structure history'
);

SELECT pg_temp.assert_true(
	(
		SELECT children = '{"children":[{"id":"c1000000-0000-4000-8000-000000000005","order":0}]}'::jsonb
		FROM public.onto_documents
		WHERE id = 'c1000000-0000-4000-8000-000000000004'
	),
	'failed row archive did not roll back the child cache'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2 AND bool_and(state_key = 'draft')
		FROM public.onto_documents
		WHERE project_id = 'b1000000-0000-4000-8000-000000000002'
	),
	'failed row archive left document rows archived'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('test.allow_project_write', 'false', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_archive_atomic(
			'b1000000-0000-4000-8000-000000000002',
			'c1000000-0000-4000-8000-000000000004',
			ARRAY['c1000000-0000-4000-8000-000000000004'::uuid],
			'2026-08-03T12:00:00Z',
			NULL,
			NULL,
			'a1000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected unauthorized archive to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'document_archive_access_denied',
				'unauthorized archive returned the wrong error'
			);
	END;
END;
$$;

ROLLBACK;
