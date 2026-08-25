-- supabase/tests/20260825181727_harden_ontology_actor_access_rpcs.test.sql
-- Disposable PostgreSQL verification for ontology actor/access RPC hardening.
-- Prerequisite: apply 20260825181727_harden_ontology_actor_access_rpcs.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

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

SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.ensure_actor_for_user(uuid)', 'execute')
		AND has_function_privilege(
			'authenticated',
			'public.ensure_actor_for_user(uuid)',
			'execute'
		)
		AND has_function_privilege(
			'service_role',
			'public.ensure_actor_for_user(uuid)',
			'execute'
		),
	'ensure_actor_for_user grants do not match the authenticated/service contract'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.actor_has_project_member_access(uuid,uuid,text)',
		'execute'
	)
		AND NOT has_function_privilege(
			'authenticated',
			'public.actor_has_project_member_access(uuid,uuid,text)',
			'execute'
		)
		AND has_function_privilege(
			'service_role',
			'public.actor_has_project_member_access(uuid,uuid,text)',
			'execute'
		),
	'actor-explicit project access must be service-role-only'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.current_actor_has_project_member_access(uuid,text)',
		'execute'
	)
		AND has_function_privilege(
			'authenticated',
			'public.current_actor_has_project_member_access(uuid,text)',
			'execute'
		)
		AND has_function_privilege(
			'service_role',
			'public.current_actor_has_project_member_access(uuid,text)',
			'execute'
		),
	'current-actor project access grants do not match the web/service contract'
);

SELECT pg_temp.assert_true(
	(
		SELECT bool_and(p.prosecdef)
			AND bool_and('search_path=""' = ANY(p.proconfig))
		FROM pg_proc AS p
		WHERE p.oid = ANY(ARRAY[
			'public.ensure_actor_for_user(uuid)'::regprocedure::oid,
			'public.actor_has_project_member_access(uuid,uuid,text)'::regprocedure::oid,
			'public.current_actor_has_project_member_access(uuid,text)'::regprocedure::oid
		])
	),
	'target RPCs must remain SECURITY DEFINER with an empty search_path'
);

SELECT pg_temp.assert_true(
	(
		SELECT bool_and(r.rolsuper OR r.rolname = 'supabase_admin')
		FROM pg_proc AS p
		JOIN pg_roles AS r ON r.oid = p.proowner
		WHERE p.oid = ANY(ARRAY[
			'public.ensure_actor_for_user(uuid)'::regprocedure::oid,
			'public.actor_has_project_member_access(uuid,uuid,text)'::regprocedure::oid,
			'public.current_actor_has_project_member_access(uuid,text)'::regprocedure::oid
		])
	),
	'target SECURITY DEFINER RPCs must be owned by a trusted database role'
);

SELECT pg_temp.assert_true(
	pg_get_functiondef('public.ensure_actor_for_user(uuid)'::regprocedure)
		ILIKE '%ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING%',
	'actor provisioning must use conflict-safe creation'
);

INSERT INTO public.users (id, name, email)
VALUES
	(
		'25181727-0000-4000-8000-000000000001',
		'Authenticated Owner',
		'actor-owner@example.test'
	),
	(
		'25181727-0000-4000-8000-000000000002',
		'Explicit Service User',
		'actor-service@example.test'
	),
	(
		'25181727-0000-4000-8000-000000000003',
		'   ',
		'actor-fallback@example.test'
	);

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"25181727-0000-4000-8000-000000000001"}',
	true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
	'request.jwt.claim.sub',
	'25181727-0000-4000-8000-000000000001',
	true
);

SELECT public.ensure_actor_for_user(
	'25181727-0000-4000-8000-000000000001'
);

SELECT pg_temp.assert_true(
	(
		SELECT a.id IS NOT NULL
			AND a.id = public.ensure_actor_for_user(
				'25181727-0000-4000-8000-000000000001'
			)
		FROM public.onto_actors AS a
		WHERE a.user_id = '25181727-0000-4000-8000-000000000001'
	),
	'repeated authenticated calls must return the canonical actor'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.ensure_actor_for_user(
			'25181727-0000-4000-8000-000000000002'
		);
		RAISE EXCEPTION 'expected authenticated actor mismatch';
	EXCEPTION
		WHEN insufficient_privilege THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'ensure_actor_for_user may only resolve the authenticated user',
				'authenticated mismatch returned the wrong error'
			);
	END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"service_role"}',
	true
);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT public.ensure_actor_for_user(
	'25181727-0000-4000-8000-000000000002'
);

SELECT public.ensure_actor_for_user(
	'25181727-0000-4000-8000-000000000003'
);

SELECT pg_temp.assert_true(
	(
		SELECT a.name = 'actor-fallback@example.test'
		FROM public.onto_actors AS a
		WHERE a.user_id = '25181727-0000-4000-8000-000000000003'
	),
	'blank user names must retain the email fallback behavior'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.ensure_actor_for_user(
			'25181727-0000-4000-8000-000000000099'
		);
		RAISE EXCEPTION 'expected missing user failure';
	EXCEPTION
		WHEN OTHERS THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			IF v_message = 'expected missing user failure' THEN
				RAISE;
			END IF;
			PERFORM pg_temp.assert_true(
				v_message = 'User not found: 25181727-0000-4000-8000-000000000099',
				'missing user returned the wrong error'
			);
	END;
END;
$$;

RESET ROLE;

INSERT INTO public.onto_projects (id, name, type_key, created_by)
SELECT
	'25181727-0000-4000-8000-000000000010',
	'Actor Access Test Project',
	'project.test.actor_access',
	a.id
FROM public.onto_actors AS a
WHERE a.user_id = '25181727-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"25181727-0000-4000-8000-000000000001"}',
	true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
	'request.jwt.claim.sub',
	'25181727-0000-4000-8000-000000000001',
	true
);

SELECT pg_temp.assert_true(
	public.current_actor_has_project_member_access(
		'25181727-0000-4000-8000-000000000010',
		'admin'
	),
	'current project owner must retain admin access'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"service_role"}',
	true
);
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT pg_temp.assert_true(
	(
		SELECT public.actor_has_project_member_access(
			a.id,
			'25181727-0000-4000-8000-000000000010',
			'admin'
		)
		FROM public.onto_actors AS a
		WHERE a.user_id = '25181727-0000-4000-8000-000000000001'
	),
	'service-role actor-explicit access must retain owner semantics'
);

RESET ROLE;
ROLLBACK;
