-- supabase/tests/20260830190000_semantic_discovery_phase3_search_scope.test.sql
-- Disposable PostgreSQL verification for Phase 3 lexical search access scope.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/semantic_discovery_search_base.sql
\ir ../migrations/20260825181727_harden_ontology_actor_access_rpcs.sql
\ir ../migrations/20260830190000_semantic_discovery_phase3_search_scope.sql

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
	NOT has_function_privilege(
		'anon',
		'public.onto_search_entities(uuid,text,uuid,text[],integer)',
		'execute'
	)
		AND has_function_privilege(
			'authenticated',
			'public.onto_search_entities(uuid,text,uuid,text[],integer)',
			'execute'
		)
		AND has_function_privilege(
			'service_role',
			'public.onto_search_entities(uuid,text,uuid,text[],integer)',
			'execute'
		),
	'lexical search grants must match the authenticated/service contract'
);

SELECT pg_temp.assert_true(
	(
		SELECT p.prosecdef
			AND 'search_path=public, extensions, pg_temp' = ANY(p.proconfig)
		FROM pg_proc AS p
		WHERE p.oid = 'public.onto_search_entities(uuid,text,uuid,text[],integer)'::regprocedure
	),
	'lexical search must remain SECURITY DEFINER with a fixed search_path'
);

SELECT pg_temp.assert_true(
	pg_get_functiondef(
		'public.onto_search_entities(uuid,text,uuid,text[],integer)'::regprocedure
	) ILIKE '%from onto_project_members%'
		AND pg_get_functiondef(
			'public.onto_search_entities(uuid,text,uuid,text[],integer)'::regprocedure
		) ILIKE '%may only search as the authenticated actor%'
		AND pg_get_functiondef(
			'public.onto_search_entities(uuid,text,uuid,text[],integer)'::regprocedure
		) NOT ILIKE '%where t.created_by = p_actor_id%',
	'lexical search must use project membership instead of entity creator scope'
);

INSERT INTO public.users (id, name, email)
VALUES
	('30190000-0000-4000-8000-000000000001', 'Owner', 'scope-owner@example.test'),
	('30190000-0000-4000-8000-000000000002', 'Member', 'scope-member@example.test'),
	('30190000-0000-4000-8000-000000000003', 'Outsider', 'scope-outsider@example.test');

INSERT INTO public.onto_actors (id, kind, name, user_id)
VALUES
	(
		'30190000-0000-4000-8000-000000000011',
		'human',
		'Owner',
		'30190000-0000-4000-8000-000000000001'
	),
	(
		'30190000-0000-4000-8000-000000000012',
		'human',
		'Member',
		'30190000-0000-4000-8000-000000000002'
	),
	(
		'30190000-0000-4000-8000-000000000013',
		'human',
		'Outsider',
		'30190000-0000-4000-8000-000000000003'
	);

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES
	(
		'30190000-0000-4000-8000-000000000021',
		'Shared Project',
		'project.default',
		'30190000-0000-4000-8000-000000000011'
	),
	(
		'30190000-0000-4000-8000-000000000022',
		'Private Project',
		'project.default',
		'30190000-0000-4000-8000-000000000013'
	),
	(
		'30190000-0000-4000-8000-000000000023',
		'Removed Membership Project',
		'project.default',
		'30190000-0000-4000-8000-000000000013'
	);

INSERT INTO public.onto_project_members (project_id, actor_id, access, removed_at)
VALUES
	(
		'30190000-0000-4000-8000-000000000021',
		'30190000-0000-4000-8000-000000000012',
		'read',
		NULL
	),
	(
		'30190000-0000-4000-8000-000000000023',
		'30190000-0000-4000-8000-000000000012',
		'admin',
		now()
	);

INSERT INTO public.onto_tasks (
	id,
	project_id,
	title,
	created_by,
	search_vector
)
VALUES
	(
		'30190000-0000-4000-8000-000000000031',
		'30190000-0000-4000-8000-000000000021',
		'Quasargarden shared launch',
		'30190000-0000-4000-8000-000000000011',
		to_tsvector('english', 'Quasargarden shared launch')
	),
	(
		'30190000-0000-4000-8000-000000000032',
		'30190000-0000-4000-8000-000000000022',
		'Quasargarden private launch',
		'30190000-0000-4000-8000-000000000013',
		to_tsvector('english', 'Quasargarden private launch')
	),
	(
		'30190000-0000-4000-8000-000000000033',
		'30190000-0000-4000-8000-000000000023',
		'Quasargarden removed launch',
		'30190000-0000-4000-8000-000000000013',
		to_tsvector('english', 'Quasargarden removed launch')
	);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT pg_temp.assert_true(
	(
		SELECT array_agg(search.id ORDER BY search.id) = ARRAY[
			'30190000-0000-4000-8000-000000000031'::uuid
		]
		FROM public.onto_search_entities(
			'30190000-0000-4000-8000-000000000012',
			'quasargarden',
			NULL,
			ARRAY['task'],
			10
		) AS search
	),
	'a member search must include shared entities and exclude private or removed access'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"30190000-0000-4000-8000-000000000002"}',
	true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
	'request.jwt.claim.sub',
	'30190000-0000-4000-8000-000000000002',
	true
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.onto_search_entities(
			'30190000-0000-4000-8000-000000000012',
			'quasargarden',
			'30190000-0000-4000-8000-000000000021',
			ARRAY['task'],
			10
		) AS search
		WHERE search.id = '30190000-0000-4000-8000-000000000031'
	),
	'an authenticated member must be able to search its shared project'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM 1
		FROM public.onto_search_entities(
			'30190000-0000-4000-8000-000000000011',
			'quasargarden',
			NULL,
			ARRAY['task'],
			10
		);
		RAISE EXCEPTION 'expected actor impersonation failure';
	EXCEPTION
		WHEN insufficient_privilege THEN
			GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
			PERFORM pg_temp.assert_true(
				v_message = 'onto_search_entities may only search as the authenticated actor',
				'authenticated actor mismatch returned the wrong error'
			);
	END;
END;
$$;

ROLLBACK;
