-- Disposable PostgreSQL verification for personal onto_events RLS.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\ir fixtures/ontology_actor_access_base.sql

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

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT p_project_id IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM public.onto_projects AS p
			WHERE p.id = p_project_id
				AND p.deleted_at IS NULL
				AND (
					p.created_by = public.current_actor_id()
					OR EXISTS (
						SELECT 1
						FROM public.onto_project_members AS m
						WHERE m.project_id = p.id
							AND m.actor_id = public.current_actor_id()
							AND m.removed_at IS NULL
							AND (
								(p_required_access = 'read' AND m.access IN ('read', 'write', 'admin'))
								OR (p_required_access = 'write' AND m.access IN ('write', 'admin'))
								OR (p_required_access = 'admin' AND m.access = 'admin')
							)
					)
				)
		)
$$;

GRANT EXECUTE ON FUNCTION public.current_actor_has_project_member_access(uuid, text)
	TO authenticated, service_role;

CREATE TABLE public.onto_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid REFERENCES public.onto_projects(id),
	owner_entity_type text NOT NULL,
	owner_entity_id uuid,
	created_by uuid NOT NULL,
	title text NOT NULL,
	start_at timestamptz NOT NULL,
	deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onto_events TO authenticated;
ALTER TABLE public.onto_events ENABLE ROW LEVEL SECURITY;

\ir ../migrations/20260829223736_restore_personal_onto_events_rls.sql

BEGIN;

INSERT INTO public.users (id, name, email)
VALUES
	('29223736-0000-4000-8000-000000000001', 'Event Owner', 'owner@example.test'),
	('29223736-0000-4000-8000-000000000002', 'Other User', 'other@example.test');

INSERT INTO public.onto_actors (id, kind, name, email, user_id)
VALUES
	(
		'29223736-1000-4000-8000-000000000001',
		'human',
		'Event Owner',
		'owner@example.test',
		'29223736-0000-4000-8000-000000000001'
	),
	(
		'29223736-1000-4000-8000-000000000002',
		'human',
		'Other User',
		'other@example.test',
		'29223736-0000-4000-8000-000000000002'
	);

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES
	(
		'29223736-2000-4000-8000-000000000001',
		'Owner Project',
		'project',
		'29223736-1000-4000-8000-000000000001'
	),
	(
		'29223736-2000-4000-8000-000000000002',
		'Other Project',
		'project',
		'29223736-1000-4000-8000-000000000002'
	);

INSERT INTO public.onto_project_members (project_id, actor_id, access)
VALUES (
	'29223736-2000-4000-8000-000000000001',
	'29223736-1000-4000-8000-000000000002',
	'read'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
	'request.jwt.claim.sub',
	'29223736-0000-4000-8000-000000000001',
	true
);

INSERT INTO public.onto_events (
	id, project_id, owner_entity_type, owner_entity_id, created_by, title, start_at
)
VALUES
	(
		'29223736-3000-4000-8000-000000000001',
		NULL,
		'actor',
		'29223736-1000-4000-8000-000000000001',
		'29223736-1000-4000-8000-000000000001',
		'Owner personal actor event',
		'2026-08-31T14:00:00Z'
	),
	(
		'29223736-3000-4000-8000-000000000002',
		NULL,
		'standalone',
		NULL,
		'29223736-1000-4000-8000-000000000001',
		'Owner standalone event',
		'2026-08-31T15:00:00Z'
	),
	(
		'29223736-3000-4000-8000-000000000003',
		'29223736-2000-4000-8000-000000000001',
		'project',
		'29223736-2000-4000-8000-000000000001',
		'29223736-1000-4000-8000-000000000001',
		'Owner project event',
		'2026-08-31T16:00:00Z'
	);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 3 FROM public.onto_events),
	'owner must read personal actor, standalone, and writable project events'
);

UPDATE public.onto_events
SET title = 'Owner personal actor event updated'
WHERE id = '29223736-3000-4000-8000-000000000001';

DO $$
BEGIN
	BEGIN
		UPDATE public.onto_events
		SET owner_entity_id = '29223736-1000-4000-8000-000000000002'
		WHERE id = '29223736-3000-4000-8000-000000000001';
		RAISE EXCEPTION 'expected personal event reassignment to fail';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

DO $$
BEGIN
	BEGIN
		INSERT INTO public.onto_events (
			id, project_id, owner_entity_type, owner_entity_id, created_by, title, start_at
		)
		VALUES (
			'29223736-3000-4000-8000-000000000004',
			NULL,
			'task',
			'29223736-1000-4000-8000-000000000001',
			'29223736-1000-4000-8000-000000000001',
			'Invalid projectless task event',
			'2026-08-31T17:00:00Z'
		);
		RAISE EXCEPTION 'expected projectless task event to fail';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

SELECT set_config(
	'request.jwt.claim.sub',
	'29223736-0000-4000-8000-000000000002',
	true
);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.onto_events),
	'other actor must see only the project event shared through read membership'
);

UPDATE public.onto_events
SET title = 'Cross-user update must not happen'
WHERE id = '29223736-3000-4000-8000-000000000001';

DELETE FROM public.onto_events
WHERE id = '29223736-3000-4000-8000-000000000001';

DO $$
BEGIN
	BEGIN
		INSERT INTO public.onto_events (
			id, project_id, owner_entity_type, owner_entity_id, created_by, title, start_at
		)
		VALUES (
			'29223736-3000-4000-8000-000000000005',
			NULL,
			'actor',
			'29223736-1000-4000-8000-000000000001',
			'29223736-1000-4000-8000-000000000001',
			'Spoofed owner personal event',
			'2026-08-31T18:00:00Z'
		);
		RAISE EXCEPTION 'expected spoofed personal event to fail';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

INSERT INTO public.onto_events (
	id, project_id, owner_entity_type, owner_entity_id, created_by, title, start_at
)
VALUES (
	'29223736-3000-4000-8000-000000000006',
	NULL,
	'actor',
	'29223736-1000-4000-8000-000000000002',
	'29223736-1000-4000-8000-000000000002',
	'Other actor personal event',
	'2026-08-31T19:00:00Z'
);

SELECT set_config(
	'request.jwt.claim.sub',
	'29223736-0000-4000-8000-000000000001',
	true
);

SELECT pg_temp.assert_true(
	(
		SELECT title = 'Owner personal actor event updated'
		FROM public.onto_events
		WHERE id = '29223736-3000-4000-8000-000000000001'
	),
	'cross-user update/delete attempts must leave the owner personal event unchanged'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.onto_events
		WHERE id = '29223736-3000-4000-8000-000000000006'
	),
	'owner must not see the other actor personal event'
);

DELETE FROM public.onto_events
WHERE id IN (
	'29223736-3000-4000-8000-000000000001',
	'29223736-3000-4000-8000-000000000002'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.onto_events
		WHERE id IN (
			'29223736-3000-4000-8000-000000000001',
			'29223736-3000-4000-8000-000000000002'
		)
	),
	'owner must be able to delete their personal actor and standalone events'
);

ROLLBACK;
