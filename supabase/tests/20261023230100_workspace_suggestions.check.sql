-- supabase/tests/20261023230100_workspace_suggestions.check.sql
-- Rehearsal assertions for Workspace suggestions:
--   pnpm db:rehearse supabase/migrations/20261023230000_workspace_foundation.sql \
--     supabase/migrations/20261023230100_workspace_suggestions.sql \
--     --check supabase/tests/20261023230100_workspace_suggestions.check.sql --role-probe
--
-- A owns a workspace and a real project; B is someone else.
-- DISPOSABLE DATABASE ONLY. Every fixture is invented; everything rolls back.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL client_min_messages = warning;
SET LOCAL search_path = public, extensions;

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE FUNCTION pg_temp.act_as(p_user uuid, p_role text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	PERFORM set_config(
		'request.jwt.claims',
		jsonb_build_object('role', p_role, 'sub', p_user)::text,
		true
	);
	PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
	PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid, text) TO anon, authenticated;

INSERT INTO auth.users (id, email) VALUES
	('e5000000-0000-4000-8000-000000000001', 'wss.a@example.com'),
	('e5000000-0000-4000-8000-000000000002', 'wss.b@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e5000000-0000-4000-8000-000000000001', 'wss.a@example.com', 'Suggest A', NULL),
	('e5000000-0000-4000-8000-000000000002', 'wss.b@example.com', 'Suggest B', NULL)
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e5000000-0000-4000-8000-000000000011', 'human', 'Suggest A', 'wss.a@example.com', 'e5000000-0000-4000-8000-000000000001'),
	('e5000000-0000-4000-8000-000000000012', 'human', 'Suggest B', 'wss.b@example.com', 'e5000000-0000-4000-8000-000000000002')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e5000000-0000-4000-8000-000000000021', 'A real project', 'project.default', 'e5000000-0000-4000-8000-000000000011', 'active');

SELECT pg_temp.act_as(NULL, 'service_role');
CREATE TEMP TABLE ws AS
	SELECT public.ensure_workspace_project_for_user('e5000000-0000-4000-8000-000000000001') AS id;

-- 1. A loose doc queues one debounced run; a second one shares it.
INSERT INTO public.onto_documents (project_id, title, type_key, state_key, created_by)
SELECT id, 'Pricing thought', 'document.note', 'draft', 'e5000000-0000-4000-8000-000000000011' FROM ws;
INSERT INTO public.onto_tasks (project_id, title, created_by, state_key)
SELECT id, 'Renew passport', 'e5000000-0000-4000-8000-000000000011', 'todo' FROM ws;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.queue_jobs
		WHERE dedup_key = 'workspace_suggest:e5000000-0000-4000-8000-000000000001'
			AND job_type = 'workspace_suggest' AND status = 'pending'
			AND scheduled_for > now() + interval '2 minutes'),
	'loose items queue exactly one delayed suggestion run'
);

-- 2. Items in a real project queue nothing.
INSERT INTO public.onto_documents (project_id, title, type_key, state_key, created_by)
VALUES ('e5000000-0000-4000-8000-000000000021', 'Project doc', 'document.default', 'draft', 'e5000000-0000-4000-8000-000000000011');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.queue_jobs WHERE job_type = 'workspace_suggest'
		AND user_id = 'e5000000-0000-4000-8000-000000000001'),
	'project items do not queue suggestion runs'
);

-- 3. Shape rules.
DO $$
BEGIN
	INSERT INTO public.workspace_suggestions (user_id, workspace_project_id, kind, item_key)
	SELECT 'e5000000-0000-4000-8000-000000000001', id, 'graduate', 'document:x' FROM ws;
	RAISE EXCEPTION 'assertion_failed: a graduate suggestion without a name was stored';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

INSERT INTO public.workspace_suggestions (user_id, workspace_project_id, kind, proposed_name, reason, items, item_key)
SELECT 'e5000000-0000-4000-8000-000000000001', id, 'graduate', 'Pricing', 'Three notes on pricing',
	'[{"kind":"document","id":"e5000000-0000-4000-8000-0000000000d1"}]'::jsonb, 'document:e5000000-0000-4000-8000-0000000000d1'
FROM ws;

DO $$
BEGIN
	INSERT INTO public.workspace_suggestions (user_id, workspace_project_id, kind, proposed_name, item_key)
	SELECT 'e5000000-0000-4000-8000-000000000001', id, 'graduate', 'Pricing again', 'document:e5000000-0000-4000-8000-0000000000d1' FROM ws;
	RAISE EXCEPTION 'assertion_failed: a duplicate open suggestion was stored';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- 4. People read only their own suggestions and write none.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.workspace_suggestions),
	'the owner sees their suggestion'
);
DO $$
BEGIN
	UPDATE public.workspace_suggestions SET status = 'accepted';
	RAISE EXCEPTION 'assertion_failed: a signed-in user updated a suggestion';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.workspace_suggestions),
	'someone else sees none of them'
);
RESET ROLE;

-- 5. Project loops skip the workspace.
SELECT pg_temp.act_as(NULL, 'service_role');
INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, changed_by)
SELECT id, 'document', gen_random_uuid(), 'created', 'e5000000-0000-4000-8000-000000000001' FROM ws;
INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, changed_by)
VALUES ('e5000000-0000-4000-8000-000000000021', 'document', gen_random_uuid(), 'created', 'e5000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.project_loop_activity(now() - interval '1 hour',
		ARRAY[(SELECT id FROM ws), 'e5000000-0000-4000-8000-000000000021'::uuid])),
	'project loop activity lists the project and skips the workspace'
);

ROLLBACK;
