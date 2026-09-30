-- supabase/tests/20260930212000_organize_hardening.check.sql
-- Rehearsal check for 20260930212000_organize_hardening.sql.
-- Run (after the applied organize files the snapshot lacks):
--   pnpm db:rehearse supabase/migrations/20260930170110_organize_atomic_moves_and_journal.sql \
--     supabase/migrations/20260930210000_organize_guard_lock_order.sql \
--     supabase/migrations/20260930211000_project_hierarchy_attach_detach.sql \
--     supabase/migrations/20260930212000_organize_hardening.sql \
--     --check supabase/tests/20260930212000_organize_hardening.check.sql --role-probe
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

-- Organize preview token for the stored plan, as the service role.
CREATE OR REPLACE FUNCTION pg_temp.preview_token() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_organize_preview('a2000000-0000-4000-8000-000000000001',
		(SELECT value FROM results WHERE key = 'plan'))->>'confirmation_token';
	RESET ROLE;
	RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.project_xmax() RETURNS jsonb LANGUAGE sql AS $$
	SELECT jsonb_agg(xmax::text ORDER BY id) FROM public.onto_projects
	WHERE id IN ('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002');
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.assert_raises(text, text),
	pg_temp.as_user(uuid) TO authenticated, service_role;

-- Users: A owns Source (S) and Dest (D). M is added to S mid-test. X is the
-- account-deletion subject.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
FROM (VALUES
	('a2000000-0000-4000-8000-000000000001'::uuid, 'harden-a@example.test'),
	('a2000000-0000-4000-8000-000000000002'::uuid, 'harden-m@example.test'),
	('a2000000-0000-4000-8000-000000000003'::uuid, 'harden-x@example.test')
) AS v(id, email)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users WHERE email LIKE 'harden-%@example.test'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT v.id, v.user_id, 'human', v.name
FROM (VALUES
	('b2000000-0000-4000-8000-000000000001'::uuid, 'a2000000-0000-4000-8000-000000000001'::uuid, 'A'),
	('b2000000-0000-4000-8000-000000000002'::uuid, 'a2000000-0000-4000-8000-000000000002'::uuid, 'M'),
	('b2000000-0000-4000-8000-000000000003'::uuid, 'a2000000-0000-4000-8000-000000000003'::uuid, 'X')
) AS v(id, user_id, name)
WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors AS a WHERE a.user_id = v.user_id);
INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c2000000-0000-4000-8000-000000000001', 'Source', 'project.base', 'b2000000-0000-4000-8000-000000000001'),
	('c2000000-0000-4000-8000-000000000002', 'Dest', 'project.base', 'b2000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_documents (id, project_id, title, type_key, created_by) VALUES
	('d2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Folder F', 'document.base', 'b2000000-0000-4000-8000-000000000001'),
	('d2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Child G', 'document.base', 'b2000000-0000-4000-8000-000000000001'),
	('d2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'Stay H', 'document.base', 'b2000000-0000-4000-8000-000000000001'),
	('d2000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000002', 'Target T', 'document.base', 'b2000000-0000-4000-8000-000000000001');
UPDATE public.onto_projects SET doc_structure = '{"version":1,"meta":{"keep":true},"root":[{"id":"d2000000-0000-4000-8000-000000000001","children":[{"id":"d2000000-0000-4000-8000-000000000002"}]},{"id":"d2000000-0000-4000-8000-000000000003"}]}'
WHERE id = 'c2000000-0000-4000-8000-000000000001';
UPDATE public.onto_projects SET doc_structure = '{"version":1,"root":[{"id":"d2000000-0000-4000-8000-000000000004"}]}'
WHERE id = 'c2000000-0000-4000-8000-000000000002';
INSERT INTO public.onto_tasks (id, project_id, title, start_at, created_by) VALUES
	('e2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Dated K1', now() + interval '2 days', 'b2000000-0000-4000-8000-000000000001'),
	('e2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Unrelated K2', NULL, 'b2000000-0000-4000-8000-000000000001'),
	('e2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'Dated K3', now() + interval '3 days', 'b2000000-0000-4000-8000-000000000001'),
	('e2000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000001', 'Dated K4', now() + interval '4 days', 'b2000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000003', 'references'),
	('f2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'task', 'e2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000002', 'references');
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, body, created_by) VALUES
	('12000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000002', 'On the moving child', 'b2000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_assets (id, project_id, storage_path, content_type, file_size_bytes, created_by) VALUES
	('22000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000001/original.png', 'image/png', 100, 'b2000000-0000-4000-8000-000000000001'),
	('22000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000002/original.png', 'image/png', 100, 'b2000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_asset_links (project_id, asset_id, entity_kind, entity_id, created_by) VALUES
	('c2000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001'),
	('c2000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'document', 'd2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, content_hash, content_text, embedding) VALUES
	('document', 'd2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'hash-1', 'child', array_fill(0.1::real, ARRAY[1536])::vector);
INSERT INTO public.onto_events (id, project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, created_by) VALUES
	('32000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'task', 'e2000000-0000-4000-8000-000000000001', 'event.task_work', 'K1 work block', now() + interval '2 days', 'b2000000-0000-4000-8000-000000000001');
UPDATE private.organize_rollout SET calendar_sync_ready = true, asset_access_ready = true WHERE singleton;

-- F (with child G) goes under T in Dest; K1 goes to Dest.
INSERT INTO results VALUES ('plan', jsonb_build_object(
	'projects', (SELECT jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at) ORDER BY id) FROM public.onto_projects
		WHERE id IN ('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002')),
	'moves', '[{"kind":"document","id":"d2000000-0000-4000-8000-000000000001","project_id":"c2000000-0000-4000-8000-000000000001","destination_project_id":"c2000000-0000-4000-8000-000000000002","parent_id":"d2000000-0000-4000-8000-000000000004","position":0},{"kind":"task","id":"e2000000-0000-4000-8000-000000000001","project_id":"c2000000-0000-4000-8000-000000000001","destination_project_id":"c2000000-0000-4000-8000-000000000002","parent_id":null,"position":0}]'::jsonb,
	'trees', '[{"project_id":"c2000000-0000-4000-8000-000000000001","root":[{"id":"d2000000-0000-4000-8000-000000000003","title":"Stay H"}]},{"project_id":"c2000000-0000-4000-8000-000000000002","root":[{"id":"d2000000-0000-4000-8000-000000000004","title":"Target T","children":[{"id":"d2000000-0000-4000-8000-000000000001","title":"Folder F","children":[{"id":"d2000000-0000-4000-8000-000000000002","title":"Child G"}]}]}]}]'::jsonb
));

-- 1. Preview takes no project row locks. A row lock taken inside a savepoint
--    changes the row's xmax; the control proves the probe sees a real lock.
INSERT INTO results VALUES ('xmax_before', pg_temp.project_xmax());
SAVEPOINT preview_probe;
SELECT pg_temp.preview_token();
SELECT pg_temp.assert_true(pg_temp.project_xmax() = (SELECT value FROM results WHERE key = 'xmax_before'),
	'preview leaves project rows unlocked');
ROLLBACK TO SAVEPOINT preview_probe;
SAVEPOINT lock_control;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT public.onto_lock_projects_for_write(ARRAY['c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002']::uuid[]);
RESET ROLE;
SELECT pg_temp.assert_true(pg_temp.project_xmax() IS DISTINCT FROM (SELECT value FROM results WHERE key = 'xmax_before'),
	'control: a FOR UPDATE lock is visible to the probe');
ROLLBACK TO SAVEPOINT lock_control;

-- 2. The token ignores writes the move does not touch.
INSERT INTO results VALUES ('token', to_jsonb(pg_temp.preview_token()));
UPDATE public.onto_embeddings SET content_hash = 'hash-2', updated_at = now() + interval '1 minute'
WHERE entity_id = 'd2000000-0000-4000-8000-000000000002';
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, chunk_index, content_hash, content_text, embedding) VALUES
	('document', 'd2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 1, 'hash-3', 'child 2', array_fill(0.2::real, ARRAY[1536])::vector);
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) = (SELECT value FROM results WHERE key = 'token'),
	'embedding upsert on a moved doc leaves the token unchanged');
INSERT INTO public.onto_comment_read_states (project_id, entity_type, entity_id, root_id, actor_id, last_read_at, last_read_comment_id) VALUES
	('c2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', now(), '12000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) = (SELECT value FROM results WHERE key = 'token'),
	'comment read state leaves the token unchanged');
UPDATE public.onto_tasks SET title = 'Unrelated K2 edited', description = 'edited' WHERE id = 'e2000000-0000-4000-8000-000000000002';
INSERT INTO public.onto_comments (project_id, entity_type, entity_id, body, created_by) VALUES
	('c2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000003', 'On a doc that stays', 'b2000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) = (SELECT value FROM results WHERE key = 'token'),
	'unrelated task edit and a comment on an unmoved doc leave the token unchanged');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('c2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'viewer', 'read');
UPDATE public.onto_projects SET name = 'Source renamed', next_step_short = 'Next', props = props || '{"note":1}'::jsonb
WHERE id = 'c2000000-0000-4000-8000-000000000001';
UPDATE public.onto_events SET sync_status = 'synced', last_synced_at = now(), sync_error = NULL
WHERE id = '32000000-0000-4000-8000-000000000001';
UPDATE results SET value = jsonb_set(value, '{projects}', (SELECT jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at) ORDER BY id)
	FROM public.onto_projects WHERE id IN ('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002')))
WHERE key = 'plan';
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) = (SELECT value FROM results WHERE key = 'token'),
	'member change, project rename/props and calendar sync status leave the token unchanged');

-- 3. A new relationship on a moved task changes what the move detaches.
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('f2000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000001', 'task', 'e2000000-0000-4000-8000-000000000001', 'document', 'd2000000-0000-4000-8000-000000000003', 'references');
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) <> (SELECT value FROM results WHERE key = 'token'),
	'a new edge on a moved task changes the token');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_apply_atomic('a2000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value#>>'{}' FROM results WHERE key='token'),'42000000-0000-4000-8000-000000000009')$q$,
	'organize_stale_preview');
RESET ROLE;
DELETE FROM public.onto_edges WHERE id = 'f2000000-0000-4000-8000-000000000009';
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) = (SELECT value FROM results WHERE key = 'token'),
	'the token is deterministic once the edge is gone');
-- A change to a moved doc's dependents still invalidates (as in 20260930170110).
UPDATE public.onto_comments SET body = 'Edited on the moving child' WHERE id = '12000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(to_jsonb(pg_temp.preview_token()) <> (SELECT value FROM results WHERE key = 'token'),
	'editing a comment on a moved doc changes the token');
UPDATE results SET value = to_jsonb(pg_temp.preview_token()) WHERE key = 'token';

-- 4. The confirmed token applies after more unrelated writes (no loop).
UPDATE public.onto_embeddings SET content_hash = 'hash-4' WHERE entity_id = 'd2000000-0000-4000-8000-000000000002' AND chunk_index = 0;
UPDATE public.onto_tasks SET title = 'Unrelated K2 again' WHERE id = 'e2000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
INSERT INTO results VALUES ('applied', public.onto_organize_apply_atomic('a2000000-0000-4000-8000-000000000001',
	(SELECT value FROM results WHERE key = 'plan'), (SELECT value#>>'{}' FROM results WHERE key = 'token'),
	'42000000-0000-4000-8000-000000000001'));
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value->>'status' = 'applied' FROM results WHERE key = 'applied'), 'apply succeeds with the confirmed token');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM public.onto_embeddings WHERE entity_id = 'd2000000-0000-4000-8000-000000000002' AND project_id = 'c2000000-0000-4000-8000-000000000002')
	AND (SELECT project_id = 'c2000000-0000-4000-8000-000000000002' FROM public.onto_comment_read_states WHERE entity_id = 'd2000000-0000-4000-8000-000000000002')
	AND (SELECT count(*) = 1 FROM public.onto_comments WHERE entity_id = 'd2000000-0000-4000-8000-000000000003' AND project_id = 'c2000000-0000-4000-8000-000000000001'),
	'scoped dependent updates move embeddings/read states of moved docs and leave others');

-- 5. Tree writes are versioned like any other tree change.
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM public.onto_project_structure_history
		WHERE project_id IN ('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002')
			AND change_type = 'move' AND version = 2 AND changed_by = 'b2000000-0000-4000-8000-000000000001'),
	'each rewritten tree gets a history row'
);
SELECT pg_temp.assert_true(
	(SELECT doc_structure->'meta' = '{"keep":true}'::jsonb AND (doc_structure->>'version')::int = 2
		AND doc_structure->'root' = '[{"id":"d2000000-0000-4000-8000-000000000003","title":"Stay H"}]'::jsonb
		FROM public.onto_projects WHERE id = 'c2000000-0000-4000-8000-000000000001'),
	'source tree keeps other top-level keys and bumps its version'
);
SELECT pg_temp.assert_true(
	(SELECT d.doc_structure = h.doc_structure
		FROM public.onto_projects d JOIN public.onto_project_structure_history h ON h.project_id = d.id AND h.version = 2
		WHERE d.id = 'c2000000-0000-4000-8000-000000000002'),
	'history holds the tree Organize wrote'
);
SELECT pg_temp.assert_true(
	(SELECT children = '{"children":[{"id":"d2000000-0000-4000-8000-000000000001","order":0}]}'::jsonb
		FROM public.onto_documents WHERE id = 'd2000000-0000-4000-8000-000000000004'),
	'the new parent document child cache is updated'
);

-- 6. Legacy task move: a confirmed token survives unrelated writes; a new
--    relationship on the task asks again.
SELECT pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO results VALUES ('legacy_preview', public.onto_task_move_atomic('e2000000-0000-4000-8000-000000000003',
	'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002'));
INSERT INTO results VALUES ('legacy_preview_k4', public.onto_task_move_atomic('e2000000-0000-4000-8000-000000000004',
	'c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002'));
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value->>'status' = 'confirmation_required' FROM results WHERE key = 'legacy_preview'),
	'dated legacy move asks for confirmation');
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, content_hash, content_text, embedding) VALUES
	('task', 'e2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'k3', 'k3', array_fill(0.3::real, ARRAY[1536])::vector);
UPDATE public.onto_tasks SET title = 'Unrelated K2 third' WHERE id = 'e2000000-0000-4000-8000-000000000002';
UPDATE public.onto_projects SET description = 'changed' WHERE id = 'c2000000-0000-4000-8000-000000000002';
INSERT INTO public.onto_edges (project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('c2000000-0000-4000-8000-000000000001', 'task', 'e2000000-0000-4000-8000-000000000004', 'document', 'd2000000-0000-4000-8000-000000000003', 'references');
SELECT pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.onto_task_move_atomic('e2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001',
		'c2000000-0000-4000-8000-000000000002', (SELECT value->>'confirmation_token' FROM results WHERE key = 'legacy_preview'))->>'status' = 'moved',
	'confirmed legacy move applies despite unrelated writes'
);
SELECT pg_temp.assert_true(
	public.onto_task_move_atomic('e2000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000001',
		'c2000000-0000-4000-8000-000000000002', (SELECT value->>'confirmation_token' FROM results WHERE key = 'legacy_preview_k4'))->>'status' = 'confirmation_required',
	'a new relationship on the task invalidates its confirmation'
);
RESET ROLE;

-- 7. Calendar leases: the same job reclaims, another job waits.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(public.claim_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001'), 'first attempt claims');
SELECT pg_temp.assert_true(public.claim_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001'), 'a retry of the same job reclaims its crashed lease');
SELECT pg_temp.assert_true(NOT public.claim_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002'), 'a different job is refused');
SELECT public.release_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true(NOT public.claim_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002'), 'a different job cannot release it');
SELECT public.release_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(public.claim_organize_calendar_sync('e2000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002'), 'released lease goes to the next job');
RESET ROLE;

-- 8. Privacy purge keeps a moved asset's file with its asset.
--    Z moved to Dest but its file stays under Source's path; Y stayed in Source.
SELECT pg_temp.assert_true(
	(SELECT project_id = 'c2000000-0000-4000-8000-000000000002' AND storage_project_id = 'c2000000-0000-4000-8000-000000000001'
		FROM public.onto_assets WHERE id = '22000000-0000-4000-8000-000000000001'),
	'fixture: Z moved with its document'
);
INSERT INTO storage.buckets (id, name) VALUES ('onto-assets', 'onto-assets') ON CONFLICT DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES
	('onto-assets', 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000001/original.png'),
	('onto-assets', 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000002/original.png'),
	('onto-assets', 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-0000000000ff/original.png');
UPDATE public.onto_projects SET deleted_at = now() - interval '31 days' WHERE id = 'c2000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT array_agg(object_name ORDER BY object_name) FROM public.list_privacy_deleted_asset_objects(1000)
		WHERE object_name LIKE 'projects/c2000000-%')
	= ARRAY[
		'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000002/original.png',
		'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-0000000000ff/original.png'
	],
	'expired project path lists its own and orphan files, not the moved asset''s file'
);
SELECT pg_temp.assert_true(
	(SELECT (public.cleanup_privacy_deleted_projects(25)->>'projects_deleted')::int = 0),
	'the expired project waits while its own files remain'
);
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE name IN (
	'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000002/original.png',
	'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-0000000000ff/original.png');
SELECT set_config('storage.allow_delete_query', 'false', true);
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.onto_organize_batches WHERE id = '42000000-0000-4000-8000-000000000001'),
	'fixture: the journal holds the batch');
-- (Separate statements: a query does not see what a function it calls changed.)
SELECT pg_temp.assert_true(
	(SELECT (public.cleanup_privacy_deleted_projects(25)->>'projects_deleted')::int = 1),
	'a moved asset''s file does not hold the source project back'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'c2000000-0000-4000-8000-000000000001'),
	'the source project is purged'
);
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000001/%')
	AND EXISTS (SELECT 1 FROM public.onto_assets WHERE id = '22000000-0000-4000-8000-000000000001' AND deleted_at IS NULL),
	'the moved asset and its file survive the source purge'
);
-- 9. The purged project's journal entries are gone.
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.onto_organize_batches
	WHERE project_ids @> ARRAY['c2000000-0000-4000-8000-000000000001'::uuid]),
	'deleting a project removes journal batches that reference it');
-- When the destination expires, the moved file goes first, then the project.
UPDATE public.onto_projects SET deleted_at = now() - interval '31 days' WHERE id = 'c2000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.list_privacy_deleted_asset_objects(1000)
		WHERE object_name = 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000001/original.png'),
	'a moved asset''s file is listed once its current project expires'
);
SELECT pg_temp.assert_true(
	(SELECT (public.cleanup_privacy_deleted_projects(25)->>'projects_deleted')::int = 0),
	'the destination waits until the moved file is gone (no orphaned file)'
);
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE name = 'projects/c2000000-0000-4000-8000-000000000001/assets/22000000-0000-4000-8000-000000000001/original.png';
SELECT set_config('storage.allow_delete_query', 'false', true);
SELECT pg_temp.assert_true(
	(SELECT (public.cleanup_privacy_deleted_projects(25)->>'projects_deleted')::int = 1),
	'then the destination is purged'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'c2000000-0000-4000-8000-000000000002')
	AND NOT EXISTS (SELECT 1 FROM public.onto_assets WHERE id = '22000000-0000-4000-8000-000000000001'),
	'the destination and the moved asset row are gone, with no file left behind'
);

-- 10. Account deletion removes the person's Organize batches: its user_id
--     sweep covers the table, and deleting the users row cascades.
--     (finalize_account_deletion_database itself cannot run here: it sets a
--     human actor's user_id to NULL, which chk_actor_identity rejects.)
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM pg_attribute
		WHERE attrelid = 'public.onto_organize_batches'::regclass AND attname = 'user_id'
			AND atttypid = 'uuid'::regtype AND NOT attisdropped
	)
	AND position('onto_organize_batches' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.finalize_account_deletion_database(uuid)'::regprocedure)) = 0
	AND position('attribute.attname = ''user_id''' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.finalize_account_deletion_database(uuid)'::regprocedure)) > 0,
	'the account purge sweeps every public table with a user_id column, which includes the journal'
);
SELECT pg_temp.assert_true(
	(SELECT confdeltype = 'c' FROM pg_constraint
		WHERE conrelid = 'public.onto_organize_batches'::regclass AND contype = 'f'
			AND confrelid = 'public.users'::regclass),
	'journal rows cascade from public.users'
);
INSERT INTO public.onto_organize_batches (id, user_id, project_ids, request_hash, plan, manifest, effects, receipt) VALUES
	('42000000-0000-4000-8000-0000000000aa', 'a2000000-0000-4000-8000-000000000003', ARRAY[gen_random_uuid()], 'h', '{}', '[]', '[]', '{}');
DELETE FROM public.onto_organize_batches WHERE user_id = 'a2000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.onto_organize_batches WHERE user_id = 'a2000000-0000-4000-8000-000000000003'),
	'the sweep statement removes the user''s journal batches');

-- 11. Grants.
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'private.organize_fingerprint(uuid[],jsonb,uuid[])', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.organize_write_tree(uuid,jsonb,uuid)', 'EXECUTE')
	AND has_function_privilege('service_role', 'private.organize_prepare(uuid,jsonb,uuid,boolean)', 'EXECUTE')
	AND has_function_privilege('service_role', 'private.organize_authorize(uuid,uuid[],uuid,boolean)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.claim_organize_calendar_sync(uuid,uuid)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.organize_forget_deleted_projects()', 'EXECUTE'),
	'grants: helpers are server-only'
);

ROLLBACK;
