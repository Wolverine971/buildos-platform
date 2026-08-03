-- Disposable PostgreSQL verification for the atomic document-delete RPC.
-- Prerequisites: apply the document lifecycle migrations in version order.
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
VALUES ('a3000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_projects (id, doc_structure)
VALUES
	(
		'b3000000-0000-4000-8000-000000000001',
		'{"version":1,"root":[{"id":"c3000000-0000-4000-8000-000000000001","order":0,"children":[{"id":"c3000000-0000-4000-8000-000000000002","order":0,"children":[{"id":"c3000000-0000-4000-8000-000000000003","order":0}]},{"id":"c3000000-0000-4000-8000-000000000004","order":1}]}]}'::jsonb
	),
	(
		'b3000000-0000-4000-8000-000000000002',
		'{"version":1,"root":[{"id":"c3000000-0000-4000-8000-000000000006","order":0}]}'::jsonb
	),
	(
		'b3000000-0000-4000-8000-000000000003',
		'{"version":1,"root":[{"id":"c3000000-0000-4000-8000-000000000007","order":0,"children":[{"id":"c3000000-0000-4000-8000-000000000008","order":0}]}]}'::jsonb
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
		'c3000000-0000-4000-8000-000000000001',
		'b3000000-0000-4000-8000-000000000001',
		'Parent',
		'draft',
		'{"children":[{"id":"c3000000-0000-4000-8000-000000000002","order":0},{"id":"c3000000-0000-4000-8000-000000000004","order":1}]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000002',
		'b3000000-0000-4000-8000-000000000001',
		'Soft delete target',
		'draft',
		'{"children":[{"id":"c3000000-0000-4000-8000-000000000003","order":0}]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000003',
		'b3000000-0000-4000-8000-000000000001',
		'Promoted child',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000004',
		'b3000000-0000-4000-8000-000000000001',
		'Sibling',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000005',
		'b3000000-0000-4000-8000-000000000002',
		'Permanent delete target',
		'archived',
		'{"children":[]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000006',
		'b3000000-0000-4000-8000-000000000002',
		'Unrelated permanent-project document',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000007',
		'b3000000-0000-4000-8000-000000000003',
		'Rollback target',
		'draft',
		'{"children":[{"id":"c3000000-0000-4000-8000-000000000008","order":0}]}'::jsonb,
		'2026-08-03T14:00:00Z'
	),
	(
		'c3000000-0000-4000-8000-000000000008',
		'b3000000-0000-4000-8000-000000000003',
		'Rollback child',
		'draft',
		'{"children":[]}'::jsonb,
		'2026-08-03T14:00:00Z'
	);

SELECT pg_temp.assert_true(
	not has_function_privilege(
		'anon',
		'public.onto_document_delete_atomic(uuid,uuid,boolean,timestamptz,integer,jsonb,uuid,jsonb)',
		'execute'
	),
	'anon must not execute the document delete RPC'
);

SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_document_delete_atomic(uuid,uuid,boolean,timestamptz,integer,jsonb,uuid,jsonb)',
		'execute'
	),
	'authenticated callers must be able to execute the document delete RPC'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_document_delete_atomic(
	'b3000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000002',
	false,
	'2026-08-03T14:00:00Z',
	1,
	'{"version":2,"root":[{"id":"c3000000-0000-4000-8000-000000000001","order":0,"children":[{"id":"c3000000-0000-4000-8000-000000000003","order":0},{"id":"c3000000-0000-4000-8000-000000000004","order":1}]}]}'::jsonb,
	'a3000000-0000-4000-8000-000000000001',
	'[{"document_id":"c3000000-0000-4000-8000-000000000001","children":[{"id":"c3000000-0000-4000-8000-000000000003","order":0},{"id":"c3000000-0000-4000-8000-000000000004","order":1}]},{"document_id":"c3000000-0000-4000-8000-000000000002","children":[]}]'::jsonb
);

SELECT pg_temp.assert_true(
	(
		SELECT deleted_at IS NOT NULL
		FROM public.onto_documents
		WHERE id = 'c3000000-0000-4000-8000-000000000002'
	),
	'soft delete did not mark the target row deleted'
);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '2'
		FROM public.onto_projects
		WHERE id = 'b3000000-0000-4000-8000-000000000001'
	),
	'soft delete did not update the canonical tree'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND max(version) = 2
		FROM public.onto_project_structure_history
		WHERE project_id = 'b3000000-0000-4000-8000-000000000001'
	),
	'soft delete did not write one structure history row'
);

SELECT pg_temp.assert_true(
	(
		SELECT children = '{"children":[{"id":"c3000000-0000-4000-8000-000000000003","order":0},{"id":"c3000000-0000-4000-8000-000000000004","order":1}]}'::jsonb
		FROM public.onto_documents
		WHERE id = 'c3000000-0000-4000-8000-000000000001'
	),
	'soft delete did not synchronize the promoted child list'
);

SELECT public.onto_document_delete_atomic(
	'b3000000-0000-4000-8000-000000000002',
	'c3000000-0000-4000-8000-000000000005',
	true,
	'2026-08-03T14:00:00Z',
	1,
	NULL,
	'a3000000-0000-4000-8000-000000000001',
	'[]'::jsonb
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.onto_documents
		WHERE id = 'c3000000-0000-4000-8000-000000000005'
	),
	'permanent delete left the archived document row behind'
);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '1'
		FROM public.onto_projects
		WHERE id = 'b3000000-0000-4000-8000-000000000002'
	),
	'permanent delete rewrote an unchanged tree'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_delete_atomic(
			'b3000000-0000-4000-8000-000000000003',
			'c3000000-0000-4000-8000-000000000007',
			false,
			'2026-08-03T13:59:59Z',
			1,
			'{"version":2,"root":[]}'::jsonb,
			'a3000000-0000-4000-8000-000000000001',
			'[{"document_id":"c3000000-0000-4000-8000-000000000007","children":[]}]'::jsonb
		);
		RAISE EXCEPTION 'expected stale delete to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'document_delete_version_conflict',
				'stale delete returned the wrong error'
			);
	END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail_document_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF coalesce(current_setting('test.fail_delete', true), 'false')::boolean
		AND OLD.deleted_at IS NULL
		AND NEW.deleted_at IS NOT NULL THEN
		RAISE EXCEPTION 'test_delete_row_failure';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_fail_document_soft_delete
BEFORE UPDATE ON public.onto_documents
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_document_soft_delete();

SELECT set_config('test.fail_delete', 'true', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_delete_atomic(
			'b3000000-0000-4000-8000-000000000003',
			'c3000000-0000-4000-8000-000000000007',
			false,
			'2026-08-03T14:00:00Z',
			1,
			'{"version":2,"root":[]}'::jsonb,
			'a3000000-0000-4000-8000-000000000001',
			'[{"document_id":"c3000000-0000-4000-8000-000000000007","children":[]}]'::jsonb
		);
		RAISE EXCEPTION 'expected soft delete row update to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'test_delete_row_failure',
				'soft delete row failure returned the wrong error'
			);
	END;
END;
$$;

SELECT set_config('test.fail_delete', 'false', true);

SELECT pg_temp.assert_true(
	(
		SELECT doc_structure->>'version' = '1'
		FROM public.onto_projects
		WHERE id = 'b3000000-0000-4000-8000-000000000003'
	),
	'failed soft delete did not roll back the canonical tree'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.onto_project_structure_history
		WHERE project_id = 'b3000000-0000-4000-8000-000000000003'
	),
	'failed soft delete did not roll back structure history'
);

SELECT pg_temp.assert_true(
	(
		SELECT children = '{"children":[{"id":"c3000000-0000-4000-8000-000000000008","order":0}]}'::jsonb
		FROM public.onto_documents
		WHERE id = 'c3000000-0000-4000-8000-000000000007'
	),
	'failed soft delete did not roll back the child cache'
);

SELECT pg_temp.assert_true(
	(
		SELECT deleted_at IS NULL
		FROM public.onto_documents
		WHERE id = 'c3000000-0000-4000-8000-000000000007'
	),
	'failed soft delete changed the document row'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('test.allow_project_write', 'false', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_document_delete_atomic(
			'b3000000-0000-4000-8000-000000000003',
			'c3000000-0000-4000-8000-000000000007',
			false,
			'2026-08-03T14:00:00Z',
			1,
			NULL,
			'a3000000-0000-4000-8000-000000000001',
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected unauthorized delete to fail';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'document_delete_access_denied',
				'unauthorized delete returned the wrong error'
			);
	END;
END;
$$;

ROLLBACK;
