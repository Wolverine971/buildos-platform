-- supabase/tests/organize_atomic_moves.check.sql
-- Organize transaction assertions. Disposable rehearsal database only.
-- Run: pnpm db:rehearse supabase/migrations/20260930170110_organize_atomic_moves_and_journal.sql \
--        --check supabase/tests/organize_atomic_moves.check.sql --role-probe
-- DISPOSABLE DATABASE ONLY. All fixtures are invented; everything rolls back.

\set ON_ERROR_STOP on

-- The harness creates NOLOGIN stand-ins; mirror hosted service_role RLS bypass.
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

-- Runs p_sql and asserts it fails with p_expected in the message.
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
	SELECT set_config(
		'request.jwt.claims',
		jsonb_build_object('sub', p_user, 'role', 'authenticated')::text,
		true
	);
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.assert_raises(text, text),
	pg_temp.as_user(uuid) TO authenticated, service_role;

CREATE TEMP VIEW set_one_v AS SELECT value AS result FROM results WHERE key = 'set_one';
CREATE TEMP VIEW fam_child_v AS SELECT value AS f FROM results WHERE key = 'fam_child';
CREATE TEMP VIEW fam_hub_v AS SELECT value AS f FROM results WHERE key = 'fam_hub';
GRANT SELECT ON set_one_v, fam_child_v, fam_hub_v TO authenticated, service_role;

-- Inject a failure after the mover, when final trees are saved. The whole
-- transaction (entities, dependents, logs, jobs and journal) must roll back.
CREATE FUNCTION pg_temp.fail_organize_tree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('organize_test.fail_tree',true)='on' THEN RAISE EXCEPTION 'forced_tree_write_failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER organize_test_tree_failure BEFORE UPDATE OF doc_structure ON public.onto_projects
 FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_organize_tree();

-- Users: A owns everything; B is a read-only collaborator on Client One only.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
	('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hierarchy-a@example.test', '', now(), now(), now()),
	('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hierarchy-b@example.test', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email) VALUES
	('a0000000-0000-4000-8000-000000000001', 'hierarchy-a@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'hierarchy-b@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT v.id, v.user_id, 'human', v.name
FROM (VALUES
	('b0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, 'A'),
	('b0000000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid, 'B')
) AS v(id, user_id, name)
WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors AS a WHERE a.user_id = v.user_id);
INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c0000000-0000-4000-8000-000000000001', 'Hub', 'project.business.consulting', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000002', 'Client One', 'project.web.client', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000003', 'Client Two', 'project.web.client', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000004', 'Other', 'project.base', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000005', 'Doomed hub', 'project.base', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000006', 'Orphan', 'project.base', 'b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'viewer', 'read');

INSERT INTO public.onto_documents(id,project_id,title,type_key,created_by) VALUES
('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Folder','document.base','b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Child','document.base','b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','Stay','document.base','b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000002','Destination','document.base','b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000001','START HERE','document.context.project','b0000000-0000-4000-8000-000000000001');
UPDATE public.onto_projects SET doc_structure='{"version":1,"root":[{"id":"d0000000-0000-4000-8000-000000000001","children":[{"id":"d0000000-0000-4000-8000-000000000002"}]},{"id":"d0000000-0000-4000-8000-000000000003"},{"id":"d0000000-0000-4000-8000-000000000005"}]}'
WHERE id='c0000000-0000-4000-8000-000000000001';
INSERT INTO public.onto_tasks(id,project_id,title,start_at,created_by) VALUES
('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Dated task',now()+interval '2 days','b0000000-0000-4000-8000-000000000001'),
('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Other task',NULL,'b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_edges(id,project_id,src_kind,src_id,dst_kind,dst_id,rel) VALUES
('f0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000002','references'),
('f0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000003','references'),
('f0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','task','e0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000002','references');
INSERT INTO public.onto_comments(id,project_id,entity_type,entity_id,body,created_by) VALUES
('10000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000002','Keep this comment','b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_assets(id,project_id,storage_path,content_type,file_size_bytes,created_by) VALUES
('20000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','projects/c0000000-0000-4000-8000-000000000001/assets/20000000-0000-4000-8000-000000000001/original.png','image/png',100,'b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_asset_links(project_id,asset_id,entity_kind,entity_id,created_by) VALUES
('c0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001'),
('c0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_public_pages(project_id,document_id,slug,title,created_by,updated_by,status,published_content) VALUES
('c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','organize-test-page','Published child','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','published','Unchanged publication');
INSERT INTO public.onto_embeddings(entity_type,entity_id,project_id,content_hash,content_text,embedding) VALUES
('document','d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','hash','child',array_fill(0.1::real,ARRAY[1536])::vector);
INSERT INTO public.onto_events(id,project_id,owner_entity_type,owner_entity_id,type_key,title,start_at,created_by) VALUES
('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','task','e0000000-0000-4000-8000-000000000001','event.task_work','Old calendar event',now()+interval '2 days','b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_task_assignees(project_id,task_id,assignee_actor_id,assigned_by_actor_id) VALUES
('c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001');

-- Compile a realistic two-pane plan, with a subtree and a task sharing a link.
INSERT INTO results VALUES('plan',jsonb_build_object(
'projects',(SELECT jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) ORDER BY id) FROM public.onto_projects WHERE id IN ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002')),
'moves','[{"kind":"document","id":"d0000000-0000-4000-8000-000000000001","project_id":"c0000000-0000-4000-8000-000000000001","destination_project_id":"c0000000-0000-4000-8000-000000000002","parent_id":null,"position":1},{"kind":"task","id":"e0000000-0000-4000-8000-000000000001","project_id":"c0000000-0000-4000-8000-000000000001","destination_project_id":"c0000000-0000-4000-8000-000000000002","parent_id":null,"position":0}]'::jsonb,
 'trees','[{"project_id":"c0000000-0000-4000-8000-000000000001","root":[{"id":"d0000000-0000-4000-8000-000000000003"},{"id":"d0000000-0000-4000-8000-000000000005"}]},{"project_id":"c0000000-0000-4000-8000-000000000002","root":[{"id":"d0000000-0000-4000-8000-000000000004"},{"id":"d0000000-0000-4000-8000-000000000001","children":[{"id":"d0000000-0000-4000-8000-000000000002"}]}]}]'::jsonb));
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_preview('a0000000-0000-4000-8000-000000000002',(SELECT value FROM results WHERE key='plan'))$q$,'organize_access_denied');
-- Production starts with incompatible move types disabled. Exercise the real
-- default before enabling them only inside this disposable test transaction.
INSERT INTO results VALUES('gated_preview',public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan')));
SELECT pg_temp.assert_true((SELECT value->'impact'->0->'blockers' ? 'calendar_sync_not_deployed' FROM results WHERE key='gated_preview'),'scheduled moves wait for worker deployment');
SELECT pg_temp.assert_true((SELECT value->'impact'->0->'blockers' ? 'asset_access_not_deployed' FROM results WHERE key='gated_preview'),'asset moves wait for web deployment');
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='gated_preview'),'40000000-0000-4000-8000-000000000099')$q$,'organize_blocked');
SELECT pg_temp.assert_raises($q$UPDATE private.organize_rollout SET calendar_sync_ready=true$q$,'permission denied');
RESET ROLE;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.onto_task_move_atomic('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002')->>'blocker'='calendar_sync_not_deployed','existing task RPC respects calendar rollout');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.queue_jobs WHERE metadata->>'kind'='onto_organize_task_sync'),'gated moves enqueue no unsupported jobs');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000001' FROM public.onto_tasks WHERE id='e0000000-0000-4000-8000-000000000001'),'gated moves leave ownership unchanged');
UPDATE private.organize_rollout SET calendar_sync_ready=true,asset_access_ready=true WHERE singleton;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
-- Pending proposals and shared attachments fail before any write.
INSERT INTO public.onto_document_proposals(project_id,document_id,created_by_actor_id,instruction,patch,patch_hash,base_content_hash,result_content_hash)
VALUES('c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','Edit child',
jsonb_build_object('schema_version',1,'project_id','c0000000-0000-4000-8000-000000000001','document_id','d0000000-0000-4000-8000-000000000002','patch_hash',repeat('a',64),'base_content_hash',repeat('b',64)),repeat('a',64),repeat('b',64),repeat('c',64));
SELECT pg_temp.assert_true(public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'))->'impact'->0->'blockers' ? 'pending_document_proposal','pending proposal blocks');
DELETE FROM public.onto_document_proposals;
INSERT INTO public.onto_asset_links(project_id,asset_id,entity_kind,entity_id,created_by) VALUES
('c0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'))->'impact'->0->'blockers' ? 'shared_asset_requires_joint_move','shared attachment blocks');
DELETE FROM public.onto_asset_links WHERE entity_id='d0000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',jsonb_set((SELECT value FROM results WHERE key='plan'),'{moves,0,id}','"d0000000-0000-4000-8000-000000000005"'))$q$,'organize_protected_document');
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',jsonb_set((SELECT value FROM results WHERE key='plan'),'{moves,1,id}','"e0000000-0000-4000-8000-000000000099"'))$q$,'organize_invalid_move');
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',jsonb_set((SELECT value FROM results WHERE key='plan'),'{trees,0,root}','[]'))$q$,'organize_tree_mismatch');
INSERT INTO results VALUES('preview',public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan')));
SELECT pg_temp.assert_true((SELECT value->'impact'->0->>'relationships_to_detach'='1' FROM results WHERE key='preview'),'only the link to the nonmoving doc detaches');
SELECT pg_temp.assert_true((SELECT value->'impact'->0->>'relationships_to_move'='2' FROM results WHERE key='preview'),'internal task/document link follows across separate UI steps');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000001' FROM public.onto_documents WHERE id='d0000000-0000-4000-8000-000000000002'),'preview writes nothing');
-- A dependent edit invalidates the token even though no entity updated_at changed.
UPDATE public.onto_comments SET body='New comment text' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='preview'),'40000000-0000-4000-8000-000000000001')$q$,'organize_stale_preview');
UPDATE results SET value=public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan')) WHERE key='preview';
SELECT set_config('organize_test.fail_tree','on',true);
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='preview'),'40000000-0000-4000-8000-000000000001')$q$,'forced_tree_write_failure');
SELECT set_config('organize_test.fail_tree','off',true);
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000001' FROM public.onto_assets WHERE id='20000000-0000-4000-8000-000000000001'),'late failure rolls back asset ownership');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000001' FROM public.onto_tasks WHERE id='e0000000-0000-4000-8000-000000000001'),'late failure rolls back task ownership');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.onto_organize_batches),'late failure leaves no journal entry');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.queue_jobs WHERE metadata->>'kind'='onto_organize_task_sync'),'late failure leaves no calendar work');
INSERT INTO results VALUES('applied',public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='preview'),'40000000-0000-4000-8000-000000000001'));
SELECT pg_temp.assert_true((SELECT value->>'status'='applied' FROM results WHERE key='applied'),'batch applies');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000002' FROM public.onto_documents WHERE id='d0000000-0000-4000-8000-000000000002'),'subtree ownership follows');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000002' AND body='New comment text' FROM public.onto_comments WHERE id='10000000-0000-4000-8000-000000000001'),'comments follow unchanged');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000002' AND storage_project_id='c0000000-0000-4000-8000-000000000001' FROM public.onto_assets WHERE id='20000000-0000-4000-8000-000000000001'),'asset logical owner follows, physical owner remains');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.onto_asset_links WHERE project_id='c0000000-0000-4000-8000-000000000002'),'asset links follow');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000002' AND slug='organize-test-page' AND published_content='Unchanged publication' FROM public.onto_public_pages WHERE document_id='d0000000-0000-4000-8000-000000000002'),'publication URL and content survive');
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000002' FROM public.onto_embeddings WHERE entity_id='d0000000-0000-4000-8000-000000000002'),'embeddings follow');
SELECT pg_temp.assert_true((SELECT deleted_at IS NOT NULL FROM public.onto_events WHERE id='30000000-0000-4000-8000-000000000001'),'old event retires without dropping its external mapping');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.queue_jobs WHERE metadata->>'kind'='onto_organize_task_sync'),'calendar reconciliation durably queued');
SELECT pg_temp.assert_true(public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='preview'),'40000000-0000-4000-8000-000000000001')->>'replayed'='true','lost-response replay succeeds');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.queue_jobs WHERE metadata->>'kind'='onto_organize_task_sync'),'retry does not enqueue duplicate work');
SELECT pg_temp.assert_raises($q$UPDATE public.onto_documents SET project_id='c0000000-0000-4000-8000-000000000001' WHERE id='d0000000-0000-4000-8000-000000000002'$q$,'organize_use_atomic_mover');
SELECT pg_temp.assert_raises($q$UPDATE public.onto_assets SET storage_project_id='c0000000-0000-4000-8000-000000000002' WHERE id='20000000-0000-4000-8000-000000000001'$q$,'immutable');
SELECT pg_temp.assert_raises($q$INSERT INTO public.onto_edges(project_id,src_kind,src_id,dst_kind,dst_id,rel) VALUES('c0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000001','document','d0000000-0000-4000-8000-000000000003','references')$q$,'organize_dependent_project_mismatch');
RESET ROLE;
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.onto_organize_apply_atomic(uuid,jsonb,text,uuid,uuid)','EXECUTE'),'batch apply is server-only');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.onto_organize_preview(uuid,jsonb,uuid)','EXECUTE'),'preview is server-only');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.onto_organize_batches','SELECT'),'journal cannot leak through direct REST reads');

-- Undo is another atomic batch, with current-state trees and safe restoration.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO results VALUES('undo_plan',jsonb_build_object(
'projects',(SELECT jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) ORDER BY id) FROM public.onto_projects WHERE id IN ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002')),
'moves','[{"kind":"task","id":"e0000000-0000-4000-8000-000000000001","project_id":"c0000000-0000-4000-8000-000000000002","destination_project_id":"c0000000-0000-4000-8000-000000000001","parent_id":null,"position":0},{"kind":"document","id":"d0000000-0000-4000-8000-000000000001","project_id":"c0000000-0000-4000-8000-000000000002","destination_project_id":"c0000000-0000-4000-8000-000000000001","parent_id":null,"position":0}]'::jsonb,
 'trees','[{"project_id":"c0000000-0000-4000-8000-000000000001","root":[{"id":"d0000000-0000-4000-8000-000000000001","children":[{"id":"d0000000-0000-4000-8000-000000000002"}]},{"id":"d0000000-0000-4000-8000-000000000003"},{"id":"d0000000-0000-4000-8000-000000000005"}]},{"project_id":"c0000000-0000-4000-8000-000000000002","root":[{"id":"d0000000-0000-4000-8000-000000000004"}]}]'::jsonb));
INSERT INTO results VALUES('undo_preview',public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='undo_plan'),'40000000-0000-4000-8000-000000000001'));
INSERT INTO results VALUES('undo',public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='undo_plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='undo_preview'),'40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001'));
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000001' FROM public.onto_documents WHERE id='d0000000-0000-4000-8000-000000000002'),'undo returns the subtree');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.onto_edges WHERE id='f0000000-0000-4000-8000-000000000002'),'undo restores the detached link');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.onto_organize_batches WHERE inverse_of='40000000-0000-4000-8000-000000000001'),'undo is journaled');
SELECT pg_temp.assert_raises($q$SELECT public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='undo_plan'),'40000000-0000-4000-8000-000000000001')$q$,'organize_already_undone');
-- Undoing that inverse redoes the original move.
UPDATE results SET value=jsonb_set(value,'{projects}',(SELECT jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) ORDER BY id) FROM public.onto_projects WHERE id IN ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002'))) WHERE key='plan';
INSERT INTO results VALUES('redo_preview',public.onto_organize_preview('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),'40000000-0000-4000-8000-000000000002'));
INSERT INTO results VALUES('redo',public.onto_organize_apply_atomic('a0000000-0000-4000-8000-000000000001',(SELECT value FROM results WHERE key='plan'),(SELECT value->>'confirmation_token' FROM results WHERE key='redo_preview'),'40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true((SELECT project_id='c0000000-0000-4000-8000-000000000002' FROM public.onto_tasks WHERE id='e0000000-0000-4000-8000-000000000001'),'redo returns task to destination');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.onto_edges WHERE id='f0000000-0000-4000-8000-000000000002'),'redo detaches the same incompatible link');
RESET ROLE;

-- Calendar retry leases cannot be stolen or released by another attempt.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(public.claim_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001'),'first calendar attempt claims lease');
SELECT pg_temp.assert_true(NOT public.claim_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002'),'overlapping attempt cannot claim');
SELECT public.release_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true(NOT public.claim_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002'),'wrong token cannot release');
SELECT public.release_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(public.claim_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002'),'released lease can be retried');
SELECT public.release_organize_calendar_sync('e0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
RESET ROLE;

-- Storage policy access follows the new logical project, even at the old path.
INSERT INTO storage.buckets(id,name) VALUES('onto-assets','onto-assets') ON CONFLICT DO NOTHING;
INSERT INTO storage.objects(bucket_id,name) VALUES('onto-assets','projects/c0000000-0000-4000-8000-000000000001/assets/20000000-0000-4000-8000-000000000001/original.png');
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects),'destination-only member reads the moved object');
RESET ROLE;
UPDATE public.onto_project_members SET project_id='c0000000-0000-4000-8000-000000000001' WHERE actor_id='b0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects),'source-only member loses object access after the move');
RESET ROLE;
-- Legacy task RPC stays compatible and shares this mover. Clean moves keep
-- their immediate behavior; scheduled moves require an impact confirmation.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO results VALUES('legacy_clean',public.onto_task_move_atomic('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true((SELECT value->>'status'='moved' AND value->'applied'->>'activity_logged'='true' FROM results WHERE key='legacy_clean'),'legacy clean move uses new mover');
SELECT pg_temp.assert_true(public.onto_task_move_atomic('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002')->>'status'='already_moved','legacy retry remains idempotent');
INSERT INTO results VALUES('legacy_dated_preview',public.onto_task_move_atomic('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001'));
SELECT pg_temp.assert_true((SELECT value->>'status'='confirmation_required' FROM results WHERE key='legacy_dated_preview'),'dated task receives a preview');
SELECT pg_temp.assert_true(public.onto_task_move_atomic('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',(SELECT value->>'confirmation_token' FROM results WHERE key='legacy_dated_preview'))->>'status'='moved','confirmed dated task moves');
SELECT pg_temp.assert_true(public.get_document_route_location('d0000000-0000-4000-8000-000000000002')->>'project_id'='c0000000-0000-4000-8000-000000000002','document location resolves its new project');
RESET ROLE;
UPDATE public.onto_projects SET archived_at=now() WHERE id='c0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.onto_task_move_atomic('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001')->>'status'='moved','legacy recovery from an archived source still works');
RESET ROLE;
UPDATE public.onto_projects SET archived_at=NULL,created_by='b0000000-0000-4000-8000-000000000002' WHERE id='c0000000-0000-4000-8000-000000000002';
DELETE FROM public.onto_project_members WHERE project_id='c0000000-0000-4000-8000-000000000002' AND actor_id='b0000000-0000-4000-8000-000000000001';
UPDATE storage.objects SET owner_id='a0000000-0000-4000-8000-000000000001' WHERE bucket_id='onto-assets';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.list_account_deletion_storage_objects('a0000000-0000-4000-8000-000000000001') WHERE bucket_id='onto-assets'),'deleting original uploader cannot delete the transferred asset');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.list_account_deletion_storage_objects('a0000000-0000-4000-8000-000000000002') WHERE bucket_id='onto-assets'),'new owner deletion includes the asset at its original path');
ROLLBACK;
