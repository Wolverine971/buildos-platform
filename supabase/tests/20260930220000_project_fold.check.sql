-- supabase/tests/20260930220000_project_fold.check.sql
-- Rehearsal check for 20260930220000_project_fold_foundation.sql and
-- 20260930220100_project_unfold.sql. Run (after the applied files the cached
-- snapshot may lack):
--   pnpm db:rehearse supabase/migrations/20260930170110_organize_atomic_moves_and_journal.sql \
--     supabase/migrations/20260930210000_organize_guard_lock_order.sql \
--     supabase/migrations/20260930211000_project_hierarchy_attach_detach.sql \
--     supabase/migrations/20260930212000_organize_hardening.sql \
--     supabase/migrations/20260930220000_project_fold_foundation.sql \
--     supabase/migrations/20260930220100_project_unfold.sql --role-probe \
--     --check supabase/tests/20260930220000_project_fold.check.sql
-- DISPOSABLE DATABASE ONLY. All fixtures are invented; everything rolls back.

\set ON_ERROR_STOP on

ALTER ROLE service_role BYPASSRLS;
BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE TEMP TABLE results (key text PRIMARY KEY, value jsonb) ON COMMIT DROP;
GRANT ALL ON results TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
	EXCEPTION WHEN OTHERS THEN
		IF position(p_expected IN SQLERRM) > 0 THEN
			RETURN;
		END IF;
		RAISE EXCEPTION 'assertion_failed: expected "%" from [%], got "%"', p_expected, p_sql, SQLERRM;
	END;
	RAISE EXCEPTION 'assertion_failed: expected "%" from [%], but it succeeded', p_expected, p_sql;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Service-role calls, the way the worker bridge makes them.
CREATE OR REPLACE FUNCTION pg_temp.fold_preview(p_user uuid, p_source uuid, p_dest uuid, p_additions uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_fold_preview(p_user, p_source, p_dest, p_additions);
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.fold_apply(p_user uuid, p_source uuid, p_dest uuid, p_token text, p_fold uuid, p_additions uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_fold_apply(p_user, p_source, p_dest, p_token, p_fold, p_additions);
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.blockers(p_preview jsonb) RETURNS text[]
LANGUAGE sql AS $$ SELECT ARRAY(SELECT jsonb_array_elements_text(p_preview->'impact'->'blockers') ORDER BY 1) $$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.assert_raises(text, text),
	pg_temp.as_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. A owns Source (S) and Dest (D) and Hub (H). B is a write member of
-- S only. C is an admin of D only. X is nobody's member. Q owns Other (O).
-- ids: users a4.., actors b4.., projects c4.., documents d4.., tasks e4..

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
FROM (VALUES
	('a4000000-0000-4000-8000-000000000001'::uuid, 'fold-a@example.test'),
	('a4000000-0000-4000-8000-000000000002'::uuid, 'fold-b@example.test'),
	('a4000000-0000-4000-8000-000000000003'::uuid, 'fold-c@example.test'),
	('a4000000-0000-4000-8000-000000000004'::uuid, 'fold-x@example.test'),
	('a4000000-0000-4000-8000-000000000005'::uuid, 'fold-q@example.test')
) AS v(id, email)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email) SELECT id, email FROM auth.users WHERE email LIKE 'fold-%@example.test'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT v.id, v.user_id, 'human', v.name
FROM (VALUES
	('b4000000-0000-4000-8000-000000000001'::uuid, 'a4000000-0000-4000-8000-000000000001'::uuid, 'Avery'),
	('b4000000-0000-4000-8000-000000000002'::uuid, 'a4000000-0000-4000-8000-000000000002'::uuid, 'Blair'),
	('b4000000-0000-4000-8000-000000000003'::uuid, 'a4000000-0000-4000-8000-000000000003'::uuid, 'Casey'),
	('b4000000-0000-4000-8000-000000000004'::uuid, 'a4000000-0000-4000-8000-000000000004'::uuid, 'Xan'),
	('b4000000-0000-4000-8000-000000000005'::uuid, 'a4000000-0000-4000-8000-000000000005'::uuid, 'Quinn')
) AS v(id, user_id, name)
WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors AS a WHERE a.user_id = v.user_id);

INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c4000000-0000-4000-8000-000000000001', 'Studio', 'project.base', 'b4000000-0000-4000-8000-000000000001'),
	('c4000000-0000-4000-8000-000000000002', 'Wayne', 'project.base', 'b4000000-0000-4000-8000-000000000001'),
	('c4000000-0000-4000-8000-000000000003', 'Hub', 'project.base', 'b4000000-0000-4000-8000-000000000001'),
	('c4000000-0000-4000-8000-000000000004', 'Other', 'project.base', 'b4000000-0000-4000-8000-000000000005');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002', 'editor', 'write'),
	('c4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000003', 'editor', 'admin');
-- S sits under Hub (the fold detaches it; unfold re-attaches).
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', 'a4000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.onto_project_set_parent_atomic('c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000003');
RESET ROLE;

-- Source documents: START HERE (linked from the project), thinking log, a
-- folder with a child, a top-level doc, an unlinked doc, an archived doc.
INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, content, props, created_by) VALUES
	('d4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'START HERE - Studio', 'document.context.project', 'ready', E'# START HERE\n<!-- managed:tasks v=1 -->\n- old\n<!-- /managed:tasks -->', '{"origin":"start_here_template","body_markdown":true}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'Thinking log', 'document.context.thinking_log', 'ready', 'log', '{"origin":"external_agent"}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'Research', 'document.default', 'ready', 'folder', '{}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000004', 'c4000000-0000-4000-8000-000000000001', 'Notes', 'document.default', 'draft', 'child', '{}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000005', 'c4000000-0000-4000-8000-000000000001', 'Offer', 'document.default', 'ready', 'offer', '{}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000006', 'c4000000-0000-4000-8000-000000000001', 'Loose', 'document.default', 'draft', 'loose', '{}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000007', 'c4000000-0000-4000-8000-000000000001', 'Old', 'document.default', 'archived', 'old', '{}', 'b4000000-0000-4000-8000-000000000001'),
	-- Destination's own START HERE and a doc in its tree.
	('d4000000-0000-4000-8000-000000000011', 'c4000000-0000-4000-8000-000000000002', 'START HERE - Wayne', 'document.context.project', 'ready', '# START HERE', '{"origin":"start_here_template"}', 'b4000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000012', 'c4000000-0000-4000-8000-000000000002', 'Brand', 'document.default', 'ready', 'brand', '{}', 'b4000000-0000-4000-8000-000000000001'),
	-- Other's doc (for a legacy cross-project link).
	('d4000000-0000-4000-8000-000000000021', 'c4000000-0000-4000-8000-000000000004', 'Elsewhere', 'document.default', 'ready', 'x', '{}', 'b4000000-0000-4000-8000-000000000005');
UPDATE public.onto_projects SET doc_structure = '{"version":3,"root":[{"id":"d4000000-0000-4000-8000-000000000003","title":"Research","children":[{"id":"d4000000-0000-4000-8000-000000000004","title":"Notes"}]},{"id":"d4000000-0000-4000-8000-000000000005","title":"Offer"},{"id":"d4000000-0000-4000-8000-000000000007"}]}'
WHERE id = 'c4000000-0000-4000-8000-000000000001';
UPDATE public.onto_projects SET doc_structure = '{"version":5,"meta":{"keep":1},"root":[{"id":"d4000000-0000-4000-8000-000000000012","title":"Brand"}]}'
WHERE id = 'c4000000-0000-4000-8000-000000000002';

INSERT INTO public.onto_tasks (id, project_id, title, start_at, props, created_by) VALUES
	('e4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Undated', NULL, '{"goal_id":"f4000000-0000-4000-8000-000000000001"}', 'b4000000-0000-4000-8000-000000000001'),
	('e4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'Dated', now() + interval '2 days', '{}', 'b4000000-0000-4000-8000-000000000001'),
	('e4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'Assigned', NULL, '{}', 'b4000000-0000-4000-8000-000000000001'),
	('e4000000-0000-4000-8000-000000000021', 'c4000000-0000-4000-8000-000000000004', 'Elsewhere task', NULL, '{}', 'b4000000-0000-4000-8000-000000000005');
INSERT INTO public.onto_goals (id, project_id, name, type_key, created_by) VALUES
	('f4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'Launch', 'goal.default', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_plans (id, project_id, name, type_key, created_by) VALUES
	('f4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'Plan', 'plan.default', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_milestones (id, project_id, title, created_by) VALUES
	('f4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'Beta', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_events (id, project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, created_by) VALUES
	('14000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'task', 'e4000000-0000-4000-8000-000000000002', 'event.task_work', 'Dated work', now() + interval '2 days', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('24000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'project', 'c4000000-0000-4000-8000-000000000001', 'goal', 'f4000000-0000-4000-8000-000000000001', 'has'),
	('24000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'goal', 'f4000000-0000-4000-8000-000000000001', 'task', 'e4000000-0000-4000-8000-000000000001', 'has_task'),
	('24000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'plan', 'f4000000-0000-4000-8000-000000000002', 'task', 'e4000000-0000-4000-8000-000000000003', 'has_task'),
	('24000000-0000-4000-8000-000000000004', 'c4000000-0000-4000-8000-000000000001', 'task', 'e4000000-0000-4000-8000-000000000001', 'document', 'd4000000-0000-4000-8000-000000000005', 'references'),
	('24000000-0000-4000-8000-000000000005', 'c4000000-0000-4000-8000-000000000001', 'project', 'c4000000-0000-4000-8000-000000000001', 'document', 'd4000000-0000-4000-8000-000000000001', 'has_context_document'),
	('24000000-0000-4000-8000-000000000006', 'c4000000-0000-4000-8000-000000000001', 'task', 'e4000000-0000-4000-8000-000000000002', 'event', '14000000-0000-4000-8000-000000000001', 'has_event'),
	('24000000-0000-4000-8000-000000000007', 'c4000000-0000-4000-8000-000000000001', 'milestone', 'f4000000-0000-4000-8000-000000000003', 'document', 'd4000000-0000-4000-8000-000000000004', 'references'),
	('24000000-0000-4000-8000-000000000011', 'c4000000-0000-4000-8000-000000000002', 'project', 'c4000000-0000-4000-8000-000000000002', 'document', 'd4000000-0000-4000-8000-000000000011', 'has_context_document');
-- A legacy link from S into Other (written before the dependent guard existed).
ALTER TABLE public.onto_edges DISABLE TRIGGER organize_lock_and_check;
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('24000000-0000-4000-8000-000000000009', 'c4000000-0000-4000-8000-000000000001', 'task', 'e4000000-0000-4000-8000-000000000021', 'document', 'd4000000-0000-4000-8000-000000000005', 'references');
ALTER TABLE public.onto_edges ENABLE TRIGGER organize_lock_and_check;
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, body, created_by) VALUES
	('34000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'document', 'd4000000-0000-4000-8000-000000000004', 'On Notes', 'b4000000-0000-4000-8000-000000000001'),
	('34000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'project', 'c4000000-0000-4000-8000-000000000001', 'On the project', 'b4000000-0000-4000-8000-000000000001'),
	('34000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'goal', 'f4000000-0000-4000-8000-000000000001', 'On the goal', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, content_hash, content_text, embedding) VALUES
	('document', 'd4000000-0000-4000-8000-000000000004', 'c4000000-0000-4000-8000-000000000001', 'h1', 'notes', array_fill(0.1::real, ARRAY[1536])::vector),
	('project', 'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'h2', 'studio', array_fill(0.1::real, ARRAY[1536])::vector);
INSERT INTO public.onto_assets (id, project_id, storage_path, content_type, file_size_bytes, created_by) VALUES
	('44000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'projects/c4000000-0000-4000-8000-000000000001/assets/44000000-0000-4000-8000-000000000001/original.png', 'image/png', 100, 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_asset_links (project_id, asset_id, entity_kind, entity_id, created_by) VALUES
	('c4000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 'document', 'd4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_public_pages (id, project_id, document_id, slug, title, created_by, updated_by) VALUES
	('54000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000005', 'fold-check-offer', 'Offer', 'b4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001');
CREATE OR REPLACE FUNCTION pg_temp.proposal(p_id uuid, p_project uuid, p_doc uuid, p_status text) RETURNS void LANGUAGE sql AS $$
	INSERT INTO public.onto_document_proposals (id, project_id, document_id, created_by_actor_id, instruction, patch, patch_hash,
		base_content_hash, result_content_hash, status, applied_at, applied_by_actor_id)
	VALUES (p_id, p_project, p_doc, 'b4000000-0000-4000-8000-000000000001', 'tighten',
		jsonb_build_object('schema_version', 1, 'project_id', p_project, 'document_id', p_doc,
			'base_content_hash', repeat('a', 64), 'patch_hash', repeat('b', 64)),
		repeat('b', 64), repeat('a', 64), repeat('c', 64), p_status,
		CASE WHEN p_status = 'applied' THEN now() END, CASE WHEN p_status = 'applied' THEN 'b4000000-0000-4000-8000-000000000001'::uuid END);
$$;
SELECT pg_temp.proposal('64000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000005', 'applied');
INSERT INTO public.onto_task_assignees (id, project_id, task_id, assignee_actor_id, assigned_by_actor_id) VALUES
	('74000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001'),
	('74000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.chat_sessions (id, user_id, context_type, entity_id, title) VALUES
	('84000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'project', 'c4000000-0000-4000-8000-000000000001', 'Studio chat');
INSERT INTO public.external_agent_callers (id, user_id, provider, caller_key, token_prefix, token_hash, status, project_scope_mode) VALUES
	('94000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'custom', 'fold-check', 'fc', 'fold-check-hash', 'trusted', 'selected');
INSERT INTO public.external_agent_project_permissions (user_id, external_agent_caller_id, project_id, access_mode, source) VALUES
	('a4000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'read_write', 'selected');

-- ---------------------------------------------------------------------------
-- 1. Table coverage: every project-pointing column is classified, and an
--    unclassified one blocks folds (and fails the standing check).

SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()),
	'policy covers every project column: ' || coalesce((SELECT string_agg(problem || ' ' || table_name || '.' || column_name, ', ') FROM private.project_fold_policy_gaps()), ''));
SAVEPOINT unclassified;
CREATE TABLE public.fold_probe_notes (id uuid PRIMARY KEY, project_id uuid REFERENCES public.onto_projects(id));
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()
	WHERE problem = 'unclassified' AND table_name = 'fold_probe_notes' AND column_name = 'project_id'),
	'a new project_id table is reported unclassified');
SELECT pg_temp.assert_true('table_policy_incomplete' = ANY(pg_temp.blockers(pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[]))),
	'an unclassified table blocks the fold');
-- The standing check's own query must fail too (run it inline).
SELECT pg_temp.assert_raises($q$DO $d$ BEGIN
	IF EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()) THEN RAISE EXCEPTION 'coverage_gap'; END IF; END $d$$q$, 'coverage_gap');
ALTER TABLE public.fold_probe_notes RENAME COLUMN project_id TO owner_project_id;
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM private.project_fold_policy_gaps() WHERE table_name = 'fold_probe_notes'),
	'a renamed *_project_id column is still discovered');
ROLLBACK TO SAVEPOINT unclassified;
SAVEPOINT stale_policy;
INSERT INTO private.project_fold_table_policy (table_name, column_name, action, reason) VALUES ('no_such_table', 'project_id', 'leave_behind', 'a table that was dropped');
UPDATE private.project_fold_table_policy SET action = 'move' WHERE table_name = 'cycles';
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM private.project_fold_policy_gaps() WHERE problem = 'policy_names_missing_column' AND table_name = 'no_such_table')
	AND EXISTS (SELECT 1 FROM private.project_fold_policy_gaps() WHERE problem = 'classified_move_but_not_implemented' AND table_name = 'cycles'),
	'stale policy rows and unimplemented moves are reported');
ROLLBACK TO SAVEPOINT stale_policy;

-- ---------------------------------------------------------------------------
-- 2. Access: service only; admin on both projects.

SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises($q$SELECT public.onto_project_fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')$q$,
	'permission denied');
SELECT pg_temp.assert_raises($q$SELECT public.onto_project_fold_apply('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','t','f4000000-0000-4000-8000-0000000000ff')$q$,
	'permission denied');
RESET ROLE;
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')$q$,
	'project_fold_access_denied');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')$q$,
	'project_fold_access_denied');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000004')$q$,
	'project_fold_access_denied');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001')$q$,
	'project_fold_same_project');
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT pg_temp.assert_raises($q$SELECT public.onto_project_fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')$q$,
	'project_fold_service_only');

-- ---------------------------------------------------------------------------
-- 3. Members, hierarchy, proposals and rollout flags as blockers.

UPDATE private.organize_rollout SET calendar_sync_ready = false, asset_access_ready = false WHERE singleton;
INSERT INTO results VALUES ('p0', pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true(pg_temp.blockers((SELECT value FROM results WHERE key = 'p0'))
	= ARRAY['asset_access_not_deployed', 'calendar_sync_not_deployed', 'members_missing'],
	'rollout flags and the missing member block: ' || pg_temp.blockers((SELECT value FROM results WHERE key = 'p0'))::text);
SELECT pg_temp.assert_true((SELECT value->'impact'->'members_missing' = '["b4000000-0000-4000-8000-000000000002"]'::jsonb FROM results WHERE key = 'p0'),
	'B (write on Studio, not in Wayne) is the missing member');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000003']::uuid[])$q$,
	'project_fold_invalid_member_addition');
SELECT pg_temp.assert_raises(format($q$SELECT pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002',%L,'f4000000-0000-4000-8000-0000000000f1')$q$,
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'p0')), 'project_fold_blocked');
UPDATE private.organize_rollout SET calendar_sync_ready = true, asset_access_ready = true WHERE singleton;
SELECT pg_temp.assert_true(pg_temp.blockers(pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])) = '{}',
	'naming the missing member clears the last blocker');
SAVEPOINT more_blockers;
SELECT pg_temp.proposal('64000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000004', 'pending');
INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c4000000-0000-4000-8000-000000000005', 'Studio child', 'project.base', 'b4000000-0000-4000-8000-000000000001');
SELECT set_config('buildos.project_hierarchy_write', 'on', true);
UPDATE public.onto_projects SET parent_project_id = NULL WHERE id = 'c4000000-0000-4000-8000-000000000001';
UPDATE public.onto_projects SET parent_project_id = 'c4000000-0000-4000-8000-000000000001' WHERE id = 'c4000000-0000-4000-8000-000000000005';
SELECT set_config('buildos.project_hierarchy_write', '', true);
INSERT INTO public.onto_events (project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, created_by) VALUES
	('c4000000-0000-4000-8000-000000000001', 'project', 'c4000000-0000-4000-8000-000000000001', 'event.default', 'Offsite', now() + interval '9 days', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO results VALUES ('p_more', pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[]));
SELECT pg_temp.assert_true(pg_temp.blockers((SELECT value FROM results WHERE key = 'p_more'))
	= ARRAY['pending_document_proposal', 'source_has_sub_projects', 'standalone_events_not_supported'],
	'pending proposals, sub-projects and non-task events block: ' || pg_temp.blockers((SELECT value FROM results WHERE key = 'p_more'))::text);
-- Folding a hub into its own child is the same rule.
SELECT pg_temp.assert_true('source_has_sub_projects' = ANY(pg_temp.blockers(pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000005', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[]))),
	'a hub cannot fold into its own child');
ROLLBACK TO SAVEPOINT more_blockers;

-- ---------------------------------------------------------------------------
-- 4. The token: stable under embedding/read-state/sync churn and unrelated
--    projects; changes when a moved document changes.

INSERT INTO results VALUES ('p1', pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[]));
SELECT pg_temp.assert_true((SELECT value->'impact'->'counts'->>'onto_documents' = '7' AND value->'impact'->'counts'->>'onto_tasks' = '3'
	AND value->'impact'->'counts'->>'documents_filed' = '6' AND value->'impact'->'counts'->>'stale_links_left_with_source' = '1'
	AND value->'impact'->'counts'->>'context_document_links_dropped' = '1' AND value->'impact'->'counts'->>'assignees_removed' = '1'
	AND value->'impact'->'counts'->>'task_events_rebuilt' = '1' AND value->'impact'->'counts'->>'comments_left_with_source' = '1'
	AND value->'impact'->'counts'->>'onto_edges' = '5' AND value->'impact'->'counts'->>'task_event_links_dropped' = '1'
	AND value->'impact'->'counts'->>'project_edges_repointed' = '1'
	AND jsonb_array_length(value->'impact'->'demoted_documents') = 2
	AND value->'impact'->'connector_grants_not_copied'->>'project_permissions' = '1'
	AND value->'impact'->>'folder_title' = 'From Studio'
	AND value->'info'->'repointed'->>'chat_sessions' = '1'
	FROM results WHERE key = 'p1'),
	'preview impact: ' || (SELECT (value->'impact'->'counts')::text FROM results WHERE key = 'p1'));
UPDATE public.onto_embeddings SET content_hash = 'h1b', updated_at = now() + interval '1 minute' WHERE entity_id = 'd4000000-0000-4000-8000-000000000004';
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, chunk_index, content_hash, content_text, embedding) VALUES
	('document', 'd4000000-0000-4000-8000-000000000004', 'c4000000-0000-4000-8000-000000000001', 1, 'h3', 'notes 2', array_fill(0.2::real, ARRAY[1536])::vector);
INSERT INTO public.onto_comment_read_states (project_id, entity_type, entity_id, root_id, actor_id, last_read_at, last_read_comment_id) VALUES
	('c4000000-0000-4000-8000-000000000001', 'document', 'd4000000-0000-4000-8000-000000000004', '34000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', now(), '34000000-0000-4000-8000-000000000001');
UPDATE public.onto_events SET sync_status = 'synced', last_synced_at = now(), props = props || '{"google":"x"}' WHERE id = '14000000-0000-4000-8000-000000000001';
UPDATE public.onto_documents SET content = 'Unrelated edit' WHERE id = 'd4000000-0000-4000-8000-000000000012';
UPDATE public.onto_projects SET description = 'Unrelated' WHERE id = 'c4000000-0000-4000-8000-000000000002';
INSERT INTO public.chat_sessions (user_id, context_type, entity_id, title) VALUES
	('a4000000-0000-4000-8000-000000000001', 'project', 'c4000000-0000-4000-8000-000000000001', 'Another chat');
SELECT pg_temp.assert_true((SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
		'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])->'confirmation_token' = value->'confirmation_token'
	FROM results WHERE key = 'p1'),
	'embedding upserts, read states, calendar sync status, destination edits and new chats leave the token unchanged');
-- A START HERE managed-region refresh is machine churn too.
UPDATE public.onto_documents SET content = E'# START HERE\n<!-- managed:tasks v=1 -->\n- refreshed\n<!-- /managed:tasks -->'
WHERE id = 'd4000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
		'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])->'confirmation_token' = value->'confirmation_token'
	FROM results WHERE key = 'p1'),
	'a START HERE managed-region refresh leaves the token unchanged');
UPDATE public.onto_documents SET content = 'Edited notes' WHERE id = 'd4000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true((SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
		'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])->'confirmation_token' <> value->'confirmation_token'
	FROM results WHERE key = 'p1'),
	'editing a moved document changes the token');
SELECT pg_temp.assert_raises(format($q$SELECT pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002',%L,'f4000000-0000-4000-8000-0000000000f1',ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])$q$,
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'p1')), 'project_fold_stale_preview');
-- Preview takes no project row locks (xmax unchanged).
INSERT INTO results VALUES ('xmax', (SELECT jsonb_agg(xmax::text ORDER BY id) FROM public.onto_projects
	WHERE id IN ('c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002')));
UPDATE results SET value = pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000002', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[]) WHERE key = 'p1';
SELECT pg_temp.assert_true((SELECT jsonb_agg(xmax::text ORDER BY id) FROM public.onto_projects
	WHERE id IN ('c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002')) = (SELECT value FROM results WHERE key = 'xmax'),
	'preview leaves project rows unlocked');

-- ---------------------------------------------------------------------------
-- 5. Apply.

INSERT INTO results VALUES ('ids_before', jsonb_build_object(
	'documents', (SELECT jsonb_agg(id ORDER BY id) FROM public.onto_documents WHERE project_id = 'c4000000-0000-4000-8000-000000000001'),
	'tasks', (SELECT jsonb_agg(id ORDER BY id) FROM public.onto_tasks WHERE project_id = 'c4000000-0000-4000-8000-000000000001'),
	'edges', (SELECT jsonb_agg(jsonb_build_array(id, src_kind, src_id, rel, dst_kind, dst_id) ORDER BY id) FROM public.onto_edges
		WHERE project_id = 'c4000000-0000-4000-8000-000000000001' AND id IN ('24000000-0000-4000-8000-000000000002',
			'24000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000007'))));
INSERT INTO results VALUES ('fold', pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000002', (SELECT value->>'confirmation_token' FROM results WHERE key = 'p1'),
	'f4000000-0000-4000-8000-0000000000f1', ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[]));
SELECT pg_temp.assert_true((SELECT value->>'status' = 'folded' AND value->>'calendar_sync' = 'queued' FROM results WHERE key = 'fold'),
	'fold applies: ' || (SELECT value::text FROM results WHERE key = 'fold'));

-- Ids intact, graph intact.
SELECT pg_temp.assert_true(
	(SELECT jsonb_agg(id ORDER BY id) FROM public.onto_documents WHERE id IN (SELECT jsonb_array_elements_text(value->'documents')::uuid FROM results WHERE key = 'ids_before')
		AND project_id = 'c4000000-0000-4000-8000-000000000002') = (SELECT value->'documents' FROM results WHERE key = 'ids_before')
	AND (SELECT jsonb_agg(id ORDER BY id) FROM public.onto_tasks WHERE project_id = 'c4000000-0000-4000-8000-000000000002')
		= (SELECT value->'tasks' FROM results WHERE key = 'ids_before')
	AND NOT EXISTS (SELECT 1 FROM public.onto_documents WHERE project_id = 'c4000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.onto_tasks WHERE project_id = 'c4000000-0000-4000-8000-000000000001')
	AND (SELECT count(*) = 1 FROM public.onto_goals WHERE id = 'f4000000-0000-4000-8000-000000000001' AND project_id = 'c4000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.onto_plans WHERE id = 'f4000000-0000-4000-8000-000000000002' AND project_id = 'c4000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.onto_milestones WHERE id = 'f4000000-0000-4000-8000-000000000003' AND project_id = 'c4000000-0000-4000-8000-000000000002'),
	'every document, task, goal, plan and milestone moved with its id');
SELECT pg_temp.assert_true(
	(SELECT jsonb_agg(jsonb_build_array(id, src_kind, src_id, rel, dst_kind, dst_id) ORDER BY id) FROM public.onto_edges
		WHERE project_id = 'c4000000-0000-4000-8000-000000000002' AND id IN ('24000000-0000-4000-8000-000000000002',
			'24000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000007'))
		= (SELECT value->'edges' FROM results WHERE key = 'ids_before')
	AND (SELECT src_id = 'c4000000-0000-4000-8000-000000000002' AND project_id = 'c4000000-0000-4000-8000-000000000002'
		FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.onto_edges WHERE id IN ('24000000-0000-4000-8000-000000000005', '24000000-0000-4000-8000-000000000006'))
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000009')
	AND EXISTS (SELECT 1 FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000011')
	AND (SELECT props->>'goal_id' = 'f4000000-0000-4000-8000-000000000001' FROM public.onto_tasks WHERE id = 'e4000000-0000-4000-8000-000000000001'),
	'links between moved items survive unchanged; project links follow; the source START HERE and task-event links are dropped; the legacy cross-project link stays; task goal_id survives');

-- Tree: the source's tree under "From Studio", appended to the destination's.
SELECT pg_temp.assert_true(
	(SELECT private.organize_tree(doc_structure->'root') FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000002')
	= jsonb_build_array(
		jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000012', 'children', '[]'::jsonb),
		jsonb_build_object('id', (SELECT value->>'folder_document_id' FROM results WHERE key = 'fold'), 'children', jsonb_build_array(
			jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000003', 'children', jsonb_build_array(
				jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000004', 'children', '[]'::jsonb))),
			jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000005', 'children', '[]'::jsonb),
			jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000001', 'children', '[]'::jsonb),
			jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000002', 'children', '[]'::jsonb),
			jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000006', 'children', '[]'::jsonb)))),
	'destination tree: own docs, then From Studio holding the source tree (archived doc out) and unlinked docs: '
		|| (SELECT private.organize_tree(doc_structure->'root')::text FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true(
	(SELECT title = 'From Studio' AND type_key = 'document.default' AND project_id = 'c4000000-0000-4000-8000-000000000002'
		AND props->'folded_from'->>'project_id' = 'c4000000-0000-4000-8000-000000000001'
		FROM public.onto_documents WHERE id = (SELECT (value->>'folder_document_id')::uuid FROM results WHERE key = 'fold'))
	AND (SELECT doc_structure->'meta' = '{"keep":1}'::jsonb AND (doc_structure->>'version')::int = 6 FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000002')
	AND (SELECT doc_structure->'root' = '[]'::jsonb FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001')
	AND (SELECT count(*) = 2 FROM public.onto_project_structure_history WHERE change_type = 'move'
		AND project_id IN ('c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002'))
	AND (SELECT children->'children' @> '[{"id":"d4000000-0000-4000-8000-000000000003"}]' FROM public.onto_documents
		WHERE id = (SELECT (value->>'folder_document_id')::uuid FROM results WHERE key = 'fold')),
	'the folder is a plain document; both trees are versioned writes with history; child caches set');

-- Demotion.
SELECT pg_temp.assert_true(
	(SELECT type_key = 'document.default' AND NOT props ? 'origin' AND props->>'former_role' = 'start_here' AND props->>'body_markdown' = 'true'
		FROM public.onto_documents WHERE id = 'd4000000-0000-4000-8000-000000000001')
	AND (SELECT type_key = 'document.default' AND props->>'origin' = 'external_agent' AND props->>'former_role' = 'thinking_log'
		FROM public.onto_documents WHERE id = 'd4000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.onto_documents WHERE project_id = 'c4000000-0000-4000-8000-000000000002' AND type_key = 'document.context.project'),
	'START HERE and the thinking log are plain documents; the destination keeps one START HERE');

-- Source archived, merged, detached from its hub.
SELECT pg_temp.assert_true(
	(SELECT archived_at IS NOT NULL AND merged_into_project_id = 'c4000000-0000-4000-8000-000000000002' AND parent_project_id IS NULL
		FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001')
	AND coalesce(current_setting('buildos.project_hierarchy_write', true), '') = '',
	'source archived with merged_into, parent cleared, hierarchy flag off again');
SELECT pg_temp.assert_raises($q$UPDATE public.onto_projects SET merged_into_project_id = NULL WHERE id = 'c4000000-0000-4000-8000-000000000001'$q$,
	'project_hierarchy_columns_protected');

-- Dependents.
SELECT pg_temp.assert_true(
	(SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_comments WHERE id = '34000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_comments WHERE id = '34000000-0000-4000-8000-000000000003')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_comments WHERE id = '34000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 2 FROM public.onto_embeddings WHERE entity_id = 'd4000000-0000-4000-8000-000000000004' AND project_id = 'c4000000-0000-4000-8000-000000000002')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_embeddings WHERE entity_type = 'project' AND entity_id = 'c4000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_comment_read_states WHERE entity_id = 'd4000000-0000-4000-8000-000000000004')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' AND storage_project_id = 'c4000000-0000-4000-8000-000000000001'
		FROM public.onto_assets WHERE id = '44000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_asset_links WHERE asset_id = '44000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' AND slug = 'fold-check-offer' FROM public.onto_public_pages WHERE id = '54000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' AND status = 'applied' FROM public.onto_document_proposals WHERE id = '64000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_task_assignees WHERE id = '74000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.onto_task_assignees WHERE id = '74000000-0000-4000-8000-000000000002')
	AND (SELECT entity_id = 'c4000000-0000-4000-8000-000000000002' FROM public.chat_sessions WHERE id = '84000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.external_agent_project_permissions
		WHERE external_agent_caller_id = '94000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.external_agent_project_permissions WHERE project_id = 'c4000000-0000-4000-8000-000000000002'),
	'comments, embeddings, read states, assets, links, pages and assignees follow; project comments/embedding, finished proposals and connector grants stay; a non-member assignee is removed; chats follow');
SELECT pg_temp.assert_true(
	(SELECT role_key = 'editor' AND access = 'write' AND removed_at IS NULL FROM public.onto_project_members
		WHERE project_id = 'c4000000-0000-4000-8000-000000000002' AND actor_id = 'b4000000-0000-4000-8000-000000000002'),
	'the named member joins the destination with their source role');
SELECT pg_temp.assert_true(
	(SELECT deleted_at IS NOT NULL AND project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_events WHERE id = '14000000-0000-4000-8000-000000000001')
	AND (SELECT count(*) = 1 FROM public.queue_jobs WHERE job_type = 'sync_calendar'
		AND metadata->>'kind' = 'onto_organize_task_sync' AND metadata->>'taskId' = 'e4000000-0000-4000-8000-000000000002'
		AND metadata->>'sourceProjectId' = 'c4000000-0000-4000-8000-000000000001'
		AND metadata->'removedEvents' @> '[{"id":"14000000-0000-4000-8000-000000000001","project_id":"c4000000-0000-4000-8000-000000000001"}]'),
	'the task event is soft-deleted in the source and one Organize calendar job rebuilds it in the destination');

-- Manifest and receipt.
SELECT pg_temp.assert_true(
	(SELECT user_id = 'a4000000-0000-4000-8000-000000000001' AND source_project_id = 'c4000000-0000-4000-8000-000000000001'
		AND manifest->'nodes'->'onto_documents' ? 'd4000000-0000-4000-8000-000000000005'
		AND jsonb_array_length(manifest->'removed_assignees') = 1 AND jsonb_array_length(manifest->'dropped_edges') = 2
		AND manifest->'project_edges' = '["24000000-0000-4000-8000-000000000001"]'
		AND source_state->>'parent_project_id' = 'c4000000-0000-4000-8000-000000000003'
		FROM public.onto_project_fold_manifests WHERE id = 'f4000000-0000-4000-8000-0000000000f1')
	AND (SELECT count(*) = 2 FROM public.onto_project_logs WHERE after_data->>'fold_id' = 'f4000000-0000-4000-8000-0000000000f1'),
	'the manifest records what moved and the prior state; one log row per project');

-- Idempotent retry; a different request under the same id is refused.
SELECT pg_temp.assert_true((SELECT (pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-000000000002', value->>'confirmation_token', 'f4000000-0000-4000-8000-0000000000f1',
	ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])->>'replayed')::boolean FROM results WHERE key = 'p1'),
	'a retry with the same fold id replays the receipt');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','other','f4000000-0000-4000-8000-0000000000f1',ARRAY['b4000000-0000-4000-8000-000000000002']::uuid[])$q$,
	'project_fold_idempotency_conflict');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.queue_jobs WHERE metadata->>'taskId' = 'e4000000-0000-4000-8000-000000000002'),
	'the replay queued nothing');
-- A merged source cannot fold again; nothing folds into it.
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000003')$q$,
	'project_fold_source_already_merged');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001')$q$,
	'project_fold_destination_archived');

-- ---------------------------------------------------------------------------
-- 6. Forwarding: only readers of the destination learn where it went.

SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001')
	= '{"status":"merged","destination_project_id":"c4000000-0000-4000-8000-000000000002"}'::jsonb, 'A is forwarded');
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000002') IS NULL, 'a live project has no redirect');
RESET ROLE;
SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001') IS NOT NULL, 'B (added at fold) is forwarded');
RESET ROLE;
SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001') IS NULL, 'X (no access) learns nothing');
RESET ROLE;
SAVEPOINT redirect_removed;
UPDATE public.onto_project_members SET removed_at = now() WHERE project_id = 'c4000000-0000-4000-8000-000000000002' AND actor_id = 'b4000000-0000-4000-8000-000000000002';
SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001') IS NULL, 'B removed from the destination learns nothing');
RESET ROLE;
ROLLBACK TO SAVEPOINT redirect_removed;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001') IS NOT NULL
	AND public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000004') IS NULL
	AND public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001') IS NULL,
	'the service role answers for the actor it names, and only then');
RESET ROLE;
SELECT pg_temp.assert_true(NOT has_function_privilege('anon', 'public.get_project_route_redirect(uuid,uuid)', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.get_project_route_redirect(uuid,uuid)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'public.onto_project_fold_apply(uuid,uuid,uuid,text,uuid,uuid[])', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.project_fold_prepare(uuid,uuid,uuid,uuid[],boolean)', 'EXECUTE')
	AND NOT has_table_privilege('authenticated', 'public.onto_project_fold_manifests', 'SELECT')
	AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.onto_project_fold_manifests'::regclass),
	'grants: only the redirect is client-callable; the manifest is service only with RLS on');

-- ---------------------------------------------------------------------------
-- 7. Unfold: unedited items come back with everything they are linked to;
--    edited ones, and anything linked to them or to newer work, stay.

CREATE OR REPLACE FUNCTION pg_temp.unfold_preview(p_user uuid, p_fold uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_unfold_preview(p_user, p_fold);
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.unfold_apply(p_user uuid, p_fold uuid, p_token text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_unfold_apply(p_user, p_fold, p_token);
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.staying(p_preview jsonb) RETURNS jsonb LANGUAGE sql AS $$
	SELECT coalesce(jsonb_object_agg(s->>'id', s->>'reason'), '{}') FROM jsonb_array_elements(p_preview->'impact'->'staying') s
$$;

SELECT pg_temp.assert_raises($q$SELECT pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-0000000000f1')$q$,
	'project_fold_access_denied');
SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises($q$SELECT public.onto_project_unfold_preview('a4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-0000000000f1')$q$,
	'permission denied');
RESET ROLE;

-- Work done in the destination after the fold: Notes is edited (it and the
-- milestone linked to it stay); Brand (the destination's own) is linked to the
-- Launch goal, which pins Launch, its task Undated, the Offer doc Undated links
-- to, and Offer's image.
UPDATE public.onto_documents SET content = 'Notes edited in Wayne' WHERE id = 'd4000000-0000-4000-8000-000000000004';
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('24000000-0000-4000-8000-000000000021', 'c4000000-0000-4000-8000-000000000002', 'document', 'd4000000-0000-4000-8000-000000000012', 'goal', 'f4000000-0000-4000-8000-000000000001', 'references');

UPDATE private.organize_rollout SET calendar_sync_ready = false WHERE singleton;
SELECT pg_temp.assert_true('calendar_sync_not_deployed' = ANY(pg_temp.blockers(pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1'))),
	'a returning dated task waits for calendar readiness');
UPDATE private.organize_rollout SET calendar_sync_ready = true WHERE singleton;

INSERT INTO results VALUES ('u1', pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1'));
SELECT pg_temp.assert_true(
	(SELECT pg_temp.staying(value) = jsonb_build_object(
		'd4000000-0000-4000-8000-000000000004', 'edited_since_fold',
		'f4000000-0000-4000-8000-000000000003', 'linked_to_item_that_stays',
		'f4000000-0000-4000-8000-000000000001', 'linked_to_item_that_stays',
		'e4000000-0000-4000-8000-000000000001', 'linked_to_item_that_stays',
		'd4000000-0000-4000-8000-000000000005', 'linked_to_item_that_stays',
		'44000000-0000-4000-8000-000000000001', 'linked_to_item_that_stays')
		AND value->'impact'->'returning' = '{"onto_documents":5,"onto_tasks":2,"onto_plans":1}'::jsonb
		AND (value->'impact'->>'folder_removed')::boolean = false
		AND value->'impact'->'blockers' = '[]'::jsonb
		AND value->'impact'->'source_restore'->>'parent_project_id' = 'c4000000-0000-4000-8000-000000000003'
	FROM results WHERE key = 'u1'),
	'unfold plan: ' || (SELECT (value->'impact')::text FROM results WHERE key = 'u1'));
-- Token: stable under embedding churn; an edit to a returning doc changes it,
-- and reverting the edit restores it.
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, content_hash, content_text, embedding) VALUES
	('document', 'd4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000002', 'h9', 'research', array_fill(0.3::real, ARRAY[1536])::vector);
SELECT pg_temp.assert_true((SELECT pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1')->'confirmation_token'
	= value->'confirmation_token' FROM results WHERE key = 'u1'), 'unfold token ignores embedding churn');
UPDATE public.onto_documents SET content = 'Research edited' WHERE id = 'd4000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true((SELECT pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1')->'confirmation_token'
	<> value->'confirmation_token' FROM results WHERE key = 'u1'), 'editing a returning doc changes the unfold token');
SELECT pg_temp.assert_raises(format($q$SELECT pg_temp.unfold_apply('a4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-0000000000f1',%L)$q$,
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'u1')), 'project_unfold_stale_preview');
UPDATE public.onto_documents SET content = 'folder' WHERE id = 'd4000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true((SELECT pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1')->'confirmation_token'
	= value->'confirmation_token' FROM results WHERE key = 'u1'), 'reverting the edit restores the token');

INSERT INTO results VALUES ('unfold', pg_temp.unfold_apply('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1',
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'u1')));
SELECT pg_temp.assert_true((SELECT value->>'status' = 'unfolded' AND value->>'calendar_sync' = 'queued' AND (value->>'parent_restored')::boolean
	FROM results WHERE key = 'unfold'), 'unfold applies: ' || (SELECT value::text FROM results WHERE key = 'unfold'));

-- What came back, ids intact; what stayed, untouched.
SELECT pg_temp.assert_true(
	(SELECT array_agg(id ORDER BY id) FROM public.onto_documents WHERE project_id = 'c4000000-0000-4000-8000-000000000001')
		= ARRAY['d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003',
			'd4000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000007']::uuid[]
	AND (SELECT array_agg(id ORDER BY id) FROM public.onto_tasks WHERE project_id = 'c4000000-0000-4000-8000-000000000001')
		= ARRAY['e4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000003']::uuid[]
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_plans WHERE id = 'f4000000-0000-4000-8000-000000000002')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' AND content = 'Notes edited in Wayne' FROM public.onto_documents WHERE id = 'd4000000-0000-4000-8000-000000000004')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_goals WHERE id = 'f4000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_assets WHERE id = '44000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000003')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000002')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000002' AND src_id = 'c4000000-0000-4000-8000-000000000002' FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.onto_edges e
		LEFT JOIN public.onto_documents d ON d.id IN (e.src_id, e.dst_id)
		LEFT JOIN public.onto_tasks t ON t.id IN (e.src_id, e.dst_id)
		WHERE e.project_id IN ('c4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002')
			AND e.id <> '24000000-0000-4000-8000-000000000009'
			AND coalesce(d.project_id, t.project_id, e.project_id) <> e.project_id),
	'returning items are back with their ids; edited and linked items stayed; no link crosses projects');
SELECT pg_temp.assert_true(
	(SELECT type_key = 'document.context.project' AND props->>'origin' = 'start_here_template' AND NOT props ? 'former_role'
		FROM public.onto_documents WHERE id = 'd4000000-0000-4000-8000-000000000001')
	AND (SELECT type_key = 'document.context.thinking_log' FROM public.onto_documents WHERE id = 'd4000000-0000-4000-8000-000000000002')
	AND EXISTS (SELECT 1 FROM public.onto_edges WHERE id = '24000000-0000-4000-8000-000000000005' AND project_id = 'c4000000-0000-4000-8000-000000000001'),
	'START HERE, its project link and the thinking log are restored');
SELECT pg_temp.assert_true(
	(SELECT private.organize_tree(doc_structure->'root') FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001')
		= '[{"id":"d4000000-0000-4000-8000-000000000003","children":[]},{"id":"d4000000-0000-4000-8000-000000000001","children":[]},{"id":"d4000000-0000-4000-8000-000000000002","children":[]},{"id":"d4000000-0000-4000-8000-000000000006","children":[]}]'::jsonb
	AND (SELECT private.organize_tree(doc_structure->'root') FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000002')
		= jsonb_build_array(jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000012', 'children', '[]'::jsonb),
			jsonb_build_object('id', (SELECT value->>'folder_document_id' FROM results WHERE key = 'fold'), 'children', jsonb_build_array(
				jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000004', 'children', '[]'::jsonb),
				jsonb_build_object('id', 'd4000000-0000-4000-8000-000000000005', 'children', '[]'::jsonb)))),
	'source tree restored from the manifest (minus what stayed); in the destination, edited Notes takes Research''s place in the folder: '
		|| (SELECT private.organize_tree(doc_structure->'root')::text FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001'));
SELECT pg_temp.assert_true(
	(SELECT archived_at IS NULL AND merged_into_project_id IS NULL AND parent_project_id = 'c4000000-0000-4000-8000-000000000003'
		FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001')
	AND (SELECT entity_id = 'c4000000-0000-4000-8000-000000000001' FROM public.chat_sessions WHERE id = '84000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c4000000-0000-4000-8000-000000000001' FROM public.onto_task_assignees WHERE id = '74000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.onto_task_assignees WHERE id = '74000000-0000-4000-8000-000000000002')
	AND EXISTS (SELECT 1 FROM public.onto_project_members WHERE project_id = 'c4000000-0000-4000-8000-000000000002'
		AND actor_id = 'b4000000-0000-4000-8000-000000000002' AND removed_at IS NULL)
	AND (SELECT count(*) = 1 FROM public.queue_jobs WHERE metadata->>'kind' = 'onto_organize_task_sync'
		AND metadata->>'taskId' = 'e4000000-0000-4000-8000-000000000002' AND metadata->>'destinationProjectId' = 'c4000000-0000-4000-8000-000000000001')
	AND (SELECT unfolded_at IS NOT NULL FROM public.onto_project_fold_manifests WHERE id = 'f4000000-0000-4000-8000-0000000000f1'),
	'the source is live again under its hub; chats and assignees follow; the added member stays; the dated task is re-homed; the manifest is closed');
SELECT pg_temp.assert_true((SELECT (pg_temp.unfold_apply('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f1',
	value->>'confirmation_token')->>'replayed')::boolean FROM results WHERE key = 'u1'), 'an unfold retry replays its receipt');
SELECT pg_temp.assert_raises($q$SELECT pg_temp.unfold_apply('a4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-0000000000f1','other')$q$,
	'project_unfold_already_done');
SELECT pg_temp.as_user('a4000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.get_project_route_redirect('c4000000-0000-4000-8000-000000000001') IS NULL, 'an unfolded source no longer forwards');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 8. Size and time: a project shaped like DJ's largest (2026-10-01: 54 docs,
--    148 tasks, ~250 links, ~360 embeddings) folds and unfolds in well under
--    the 5 s lock timeout.

INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c4000000-0000-4000-8000-0000000000a1', 'Large', 'project.base', 'b4000000-0000-4000-8000-000000000001'),
	('c4000000-0000-4000-8000-0000000000a2', 'Large home', 'project.base', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, content, created_by)
SELECT ('d4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1', 'Doc ' || i,
	'document.default', 'ready', repeat('Body text for document ' || i || '. ', 200), 'b4000000-0000-4000-8000-000000000001'
FROM generate_series(1, 60) i;
UPDATE public.onto_projects SET doc_structure = jsonb_build_object('version', 1, 'root', (
	SELECT jsonb_agg(jsonb_build_object('id', ('d4a00000-0000-4000-8000-' || lpad(f::text, 12, '0')), 'title', 'Doc ' || f,
		'children', (SELECT jsonb_agg(jsonb_build_object('id', ('d4a00000-0000-4000-8000-' || lpad((10 + (f - 1) * 5 + c)::text, 12, '0')), 'children', '[]'::jsonb) ORDER BY c)
			FROM generate_series(1, 5) c)) ORDER BY f)
	FROM generate_series(1, 10) f))
WHERE id = 'c4000000-0000-4000-8000-0000000000a1';
INSERT INTO public.onto_tasks (id, project_id, title, created_by)
SELECT ('e4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1', 'Task ' || i, 'b4000000-0000-4000-8000-000000000001'
FROM generate_series(1, 150) i;
INSERT INTO public.onto_goals (id, project_id, name, type_key, created_by)
SELECT ('f4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1', 'Goal ' || i, 'goal.default', 'b4000000-0000-4000-8000-000000000001'
FROM generate_series(1, 10) i;
INSERT INTO public.onto_plans (id, project_id, name, type_key, created_by)
SELECT ('f4b00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1', 'Plan ' || i, 'plan.default', 'b4000000-0000-4000-8000-000000000001'
FROM generate_series(1, 10) i;
INSERT INTO public.onto_milestones (id, project_id, title, created_by)
SELECT ('f4c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1', 'Milestone ' || i, 'b4000000-0000-4000-8000-000000000001'
FROM generate_series(1, 30) i;
INSERT INTO public.onto_edges (project_id, src_kind, src_id, dst_kind, dst_id, rel)
SELECT 'c4000000-0000-4000-8000-0000000000a1'::uuid, 'plan', ('f4b00000-0000-4000-8000-' || lpad((1 + i % 10)::text, 12, '0'))::uuid,
	'task', ('e4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'has_task' FROM generate_series(1, 150) i
UNION ALL SELECT 'c4000000-0000-4000-8000-0000000000a1', 'goal', ('f4a00000-0000-4000-8000-' || lpad((1 + i % 10)::text, 12, '0'))::uuid,
	'milestone', ('f4c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'has_milestone' FROM generate_series(1, 30) i
UNION ALL SELECT 'c4000000-0000-4000-8000-0000000000a1', 'task', ('e4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
	'document', ('d4a00000-0000-4000-8000-' || lpad((1 + i % 60)::text, 12, '0'))::uuid, 'references' FROM generate_series(1, 70) i
UNION ALL SELECT 'c4000000-0000-4000-8000-0000000000a1', 'project', 'c4000000-0000-4000-8000-0000000000a1'::uuid,
	'goal', ('f4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'has' FROM generate_series(1, 10) i;
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, chunk_index, content_hash, content_text, embedding)
SELECT 'document', ('d4a00000-0000-4000-8000-' || lpad((1 + i % 60)::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1'::uuid, i / 60,
	'h' || i, 'chunk', array_fill(0.1::real, ARRAY[1536])::vector FROM generate_series(0, 179) i
UNION ALL SELECT 'task', ('e4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'c4000000-0000-4000-8000-0000000000a1', 0,
	'h' || i, 'task', array_fill(0.1::real, ARRAY[1536])::vector FROM generate_series(1, 150) i;
INSERT INTO public.onto_comments (project_id, entity_type, entity_id, body, created_by)
SELECT 'c4000000-0000-4000-8000-0000000000a1', 'document', ('d4a00000-0000-4000-8000-' || lpad((1 + i % 60)::text, 12, '0'))::uuid,
	'Comment ' || i, 'b4000000-0000-4000-8000-000000000001' FROM generate_series(1, 50) i;

-- Bounds: a folder too wide for the children index (idx_onto_documents_has_children
-- overflows near 60 direct children) or a fold too big for one short transaction is
-- blocked with a reason, and apply refuses it.
INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c4000000-0000-4000-8000-0000000000a3', 'Wide', 'project.base', 'b4000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, content, created_by)
SELECT gen_random_uuid(), 'c4000000-0000-4000-8000-0000000000a3', 'Loose ' || i, 'document.default', 'ready', 'x',
	'b4000000-0000-4000-8000-000000000001' FROM generate_series(1, 55) i;
INSERT INTO results VALUES ('wide_preview', pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-0000000000a3', 'c4000000-0000-4000-8000-0000000000a2'));
SELECT pg_temp.assert_true((SELECT pg_temp.blockers(value) = ARRAY['too_many_documents_in_one_folder']
		AND (value->'impact'->'limits'->>'widest_folder')::int = 55 FROM results WHERE key = 'wide_preview'),
	'a source whose top level would overflow one folder is blocked: ' || (SELECT (value->'impact'->'blockers')::text FROM results WHERE key = 'wide_preview'));
SELECT pg_temp.assert_raises(format($q$SELECT pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-0000000000a3','c4000000-0000-4000-8000-0000000000a2',%L,'f4000000-0000-4000-8000-0000000000f3')$q$,
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'wide_preview')), 'too_many_documents_in_one_folder');
SAVEPOINT too_big;
INSERT INTO public.onto_tasks (project_id, title, created_by)
SELECT 'c4000000-0000-4000-8000-0000000000a3', 'Bulk ' || i, 'b4000000-0000-4000-8000-000000000001' FROM generate_series(1, 1000) i;
SELECT pg_temp.assert_true((SELECT 'too_many_entities' = ANY(pg_temp.blockers(pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-0000000000a3', 'c4000000-0000-4000-8000-0000000000a2')))), 'a fold over 1000 entities is blocked');
ROLLBACK TO SAVEPOINT too_big;
SELECT pg_temp.assert_true((SELECT (value->'impact'->'limits'->>'widest_folder')::int = 10
		AND NOT ('too_many_documents_in_one_folder' = ANY(pg_temp.blockers(value)))
	FROM (SELECT pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-0000000000a1',
		'c4000000-0000-4000-8000-0000000000a2') AS value) x), 'a nested tree measures its widest folder, not its document count');

INSERT INTO results VALUES ('large_preview', pg_temp.fold_preview('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-0000000000a1', 'c4000000-0000-4000-8000-0000000000a2'));
INSERT INTO results VALUES ('large_fold', pg_temp.fold_apply('a4000000-0000-4000-8000-000000000001',
	'c4000000-0000-4000-8000-0000000000a1', 'c4000000-0000-4000-8000-0000000000a2',
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'large_preview'), 'f4000000-0000-4000-8000-0000000000f2'));
INSERT INTO results VALUES ('large_unfold', pg_temp.unfold_apply('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f2',
	pg_temp.unfold_preview('a4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-0000000000f2')->>'confirmation_token'));
SELECT pg_temp.assert_true(
	(SELECT (value->'moved'->>'onto_documents')::int = 60 AND (value->'moved'->>'onto_tasks')::int = 150
		AND (value->'moved'->>'onto_edges')::int = 260 AND (value->'moved'->>'onto_embeddings')::int = 330
		AND (value->>'duration_ms')::numeric < 5000 FROM results WHERE key = 'large_fold')
	AND (SELECT (value->'moved_back'->>'onto_documents')::int = 60 AND (value->'moved_back'->>'onto_tasks')::int = 150
		AND (value->'moved_back'->>'onto_edges')::int = 260 AND value->'staying' = '[]'::jsonb
		AND (value->>'duration_ms')::numeric < 5000 FROM results WHERE key = 'large_unfold')
	AND (SELECT private.organize_tree(doc_structure->'root') FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-0000000000a1')
		= (SELECT private.organize_tree(source_state->'doc_structure_root') FROM public.onto_project_fold_manifests WHERE id = 'f4000000-0000-4000-8000-0000000000f2')
	AND NOT EXISTS (SELECT 1 FROM public.onto_documents WHERE project_id = 'c4000000-0000-4000-8000-0000000000a2' AND deleted_at IS NULL),
	'a large fold and its unfold round-trip within the lock timeout: fold ' || (SELECT value->>'duration_ms' FROM results WHERE key = 'large_fold')
		|| ' ms, unfold ' || (SELECT value->>'duration_ms' FROM results WHERE key = 'large_unfold') || ' ms');

DO $$ BEGIN RAISE NOTICE 'project fold timing: large fold % ms, unfold % ms',
	(SELECT value->>'duration_ms' FROM pg_temp.results WHERE key = 'large_fold'),
	(SELECT value->>'duration_ms' FROM pg_temp.results WHERE key = 'large_unfold'); END $$;

-- ---------------------------------------------------------------------------
-- 9. Manifests go with either project, and after 30 days.

SAVEPOINT purge;
SELECT pg_temp.assert_true((SELECT (public.cleanup_privacy_project_fold_manifests(10)->>'fold_manifests_deleted')::int = 0), 'a fresh manifest is kept');
UPDATE public.onto_project_fold_manifests SET created_at = now() - interval '31 days' WHERE id = 'f4000000-0000-4000-8000-0000000000f1';
SELECT pg_temp.assert_true((SELECT (public.cleanup_privacy_project_fold_manifests(10)->>'fold_manifests_deleted')::int = 1), 'a 31-day-old manifest is purged');
ROLLBACK TO SAVEPOINT purge;
SAVEPOINT delete_destination;
DELETE FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.onto_project_fold_manifests WHERE id = 'f4000000-0000-4000-8000-0000000000f1')
	AND (SELECT merged_into_project_id IS NULL FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001'),
	'deleting the destination removes its manifests and clears the pointer');
ROLLBACK TO SAVEPOINT delete_destination;
SAVEPOINT delete_source;
DELETE FROM public.onto_projects WHERE id = 'c4000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.onto_project_fold_manifests WHERE id = 'f4000000-0000-4000-8000-0000000000f1'),
	'deleting the source removes its manifests');
ROLLBACK TO SAVEPOINT delete_source;

ROLLBACK;
