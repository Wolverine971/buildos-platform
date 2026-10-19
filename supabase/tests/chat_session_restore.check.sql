-- supabase/tests/chat_session_restore.check.sql
-- Free local rehearsal fixtures only. Roll back before the standing checks.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = notice;
-- The schema harness copies role names, not attributes. Model Supabase's
-- service_role BYPASSRLS locally; the transaction rolls this attribute back.
ALTER ROLE service_role BYPASSRLS;
INSERT INTO auth.users(id,email) VALUES ('ae100000-0000-4000-8000-000000000001','restore-fixture@example.com');
INSERT INTO public.users(id,email) VALUES ('ae100000-0000-4000-8000-000000000001','restore-fixture@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.chat_sessions(id,user_id,context_type,status) VALUES
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','global','active');
CREATE FUNCTION pg_temp.mid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('ae300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
INSERT INTO public.chat_messages(id,session_id,user_id,role,content,created_at,metadata)
 SELECT pg_temp.mid(n),'ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001',
 'user','Fixture ' || n, '2026-10-18T00:00:00Z'::timestamptz + n * interval '1 second', '{}'::jsonb
 FROM generate_series(1,400) n;
INSERT INTO public.chat_turn_runs(id,session_id,user_id,stream_run_id,client_turn_id,context_type,request_message,status,correlation_id,user_message_id)
 VALUES ('ae400000-0000-4000-8000-000000000001','ae200000-0000-4000-8000-000000000001',
 'ae100000-0000-4000-8000-000000000001','fixture-stream','fixture-client','global',repeat('Fixture ',10000),'running',
 'ae500000-0000-4000-8000-000000000001',pg_temp.mid(400));
INSERT INTO public.chat_tool_executions(id,session_id,message_id,tool_name,arguments,result,success,created_at)
 VALUES ('ae600000-0000-4000-8000-000000000001','ae200000-0000-4000-8000-000000000001',pg_temp.mid(1),
 'get_onto_project_graph','{}',jsonb_build_object('project',jsonb_build_object('id','p','name','Fixture project','description',repeat('x',330000))),true,'2026-10-18T00:00:01Z');
INSERT INTO public.chat_turn_events(id,turn_run_id,session_id,user_id,stream_run_id,event_type,phase,payload,sequence_index)
 VALUES ('ae700000-0000-4000-8000-000000000001','ae400000-0000-4000-8000-000000000001',
 'ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','fixture-stream','turn_phase','planning','{"message":"Planning"}',1);

-- Test the real role boundary: the ordinary owner cannot read private rows or
-- invoke the privileged reader. The server can read only the specified owner.
SELECT set_config('request.jwt.claim.sub','ae100000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.chat_turn_runs WHERE id='ae400000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'fixture owner unexpectedly has admin access'; END IF;
 IF has_function_privilege(current_user,'public.get_chat_session_restore_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'private RPC exposed'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE v jsonb; BEGIN
 v := public.get_chat_session_restore_v1('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001');
 IF length(v#>>'{turnRuns,0,request_message}') > 1000 THEN RAISE EXCEPTION 'duplicate request body not bounded'; END IF;
 IF v->>'truncated' <> 'false' OR jsonb_array_length(v->'messages') <> 400 THEN RAISE EXCEPTION 'exact limit incorrectly truncated'; END IF;
 IF v#>>'{turnRuns,0,status}' <> 'running' OR jsonb_array_length(v->'turnEvents') <> 1 THEN RAISE EXCEPTION 'owned private state missing: runs %, events %, role %',v->'turnRuns',v->'turnEvents',current_user; END IF;
 IF octet_length((v->'toolExecutions')::text) > 12000 THEN RAISE EXCEPTION 'graph not compacted'; END IF;
 IF v#>>'{toolExecutions,0,result,project,name}' <> 'Fixture project' THEN RAISE EXCEPTION 'display identity lost'; END IF;
 IF public.get_chat_session_restore_v1('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'foreign session leaked'; END IF;
 RAISE NOTICE 'Large graph: 330000 raw bytes -> % projected tool bytes',octet_length((v->'toolExecutions')::text);
END $$;
RESET ROLE;

-- A VOLATILE sibling commits changes during the calling statement. The STABLE
-- reader must retain the statement's MVCC snapshot, just as with a concurrent
-- worker commit. A later call must see both the terminal row and its reply.
CREATE FUNCTION pg_temp.finish_turn() RETURNS integer LANGUAGE plpgsql VOLATILE AS $$ BEGIN
 INSERT INTO public.chat_messages(id,session_id,user_id,role,content,created_at)
 VALUES(pg_temp.mid(401),'ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','assistant','Finished','2026-10-18T00:06:41Z');
 UPDATE public.chat_turn_runs SET status='completed', assistant_message_id=pg_temp.mid(401), finished_at=now()
 WHERE id='ae400000-0000-4000-8000-000000000001';
 RETURN 1;
END $$;
CREATE TEMP TABLE during_finish AS
 WITH commit_reply AS MATERIALIZED (SELECT pg_temp.finish_turn())
 SELECT public.get_chat_session_restore_v1('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001') AS snapshot FROM commit_reply;
DO $$ DECLARE v jsonb; BEGIN
 SELECT snapshot INTO v FROM during_finish;
 IF v#>>'{turnRuns,0,status}' <> 'running' OR v->>'truncated' <> 'false' THEN RAISE EXCEPTION 'mixed MVCC snapshot'; END IF;
 v := public.get_chat_session_restore_v1('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001');
 IF v#>>'{turnRuns,0,status}' <> 'completed' OR v#>>'{messages,399,content}' <> 'Finished' THEN RAISE EXCEPTION 'terminal snapshot missing reply'; END IF;
 IF v->>'truncated' <> 'true' OR jsonb_array_length(v->'toolExecutions') <> 0 THEN RAISE EXCEPTION 'history windows diverged'; END IF;
END $$;

-- Activity caps belong to this window and must be reported independently of
-- the message cap. Stable tie-breaking keeps the newest 1000 executions.
INSERT INTO public.chat_tool_executions(session_id,turn_run_id,tool_name,arguments,result,success,created_at)
 SELECT 'ae200000-0000-4000-8000-000000000001','ae400000-0000-4000-8000-000000000001',
 'list_onto_tasks','{}','{"tasks":[]}',true,'2026-10-18T00:06:40Z'::timestamptz + n * interval '1 microsecond'
 FROM generate_series(1,1001) n;
INSERT INTO public.chat_turn_events(turn_run_id,session_id,user_id,stream_run_id,event_type,phase,payload,sequence_index)
 SELECT 'ae400000-0000-4000-8000-000000000001','ae200000-0000-4000-8000-000000000001',
 'ae100000-0000-4000-8000-000000000001','fixture-stream','turn_phase','planning','{"message":"Planning"}',n
 FROM generate_series(2,1002) n;
DO $$ DECLARE v jsonb; BEGIN
 v := public.get_chat_session_restore_v1('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001');
 IF jsonb_array_length(v->'toolExecutions') <> 1000 OR jsonb_array_length(v->'turnEvents') <> 1000
    OR v#>>'{historyWindow,toolsTruncated}' <> 'true' OR v#>>'{historyWindow,eventsTruncated}' <> 'true'
 THEN RAISE EXCEPTION 'activity caps not enforced/reported'; END IF;
END $$;

-- The attachment reader runs as the signed-in user and cannot serve another
-- user's frozen metadata. Temporary uploads need no project/asset access.
INSERT INTO public.chat_message_attachments(session_id,user_id,message_id,attachment_kind,media_type,metadata)
 VALUES('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001',pg_temp.mid(400),
 'temporary_file','image','{"temporary_attachment_id":"fixture-upload","file_name":"fixture.png"}');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(public.get_chat_restore_attachments_v1('ae200000-0000-4000-8000-000000000001',ARRAY['ae300000-0000-4000-8000-000000000400'::uuid])) <> 1 THEN RAISE EXCEPTION 'owned attachment missing'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','ae100000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF jsonb_array_length(public.get_chat_restore_attachments_v1('ae200000-0000-4000-8000-000000000001',ARRAY['ae300000-0000-4000-8000-000000000400'::uuid])) > 0 THEN RAISE EXCEPTION 'foreign attachment leaked'; END IF;
END $$;
RESET ROLE;

-- Full OCR never crosses the restore connection, and asset access remains
-- user-scoped even though lifecycle reads use the server role.
SELECT set_config('request.jwt.claim.sub','ae100000-0000-4000-8000-000000000001',true);
DO $$ DECLARE a uuid; BEGIN
 INSERT INTO public.onto_actors(id,kind,name,user_id) VALUES('ae800000-0000-4000-8000-000000000001','human','Restore fixture','ae100000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
 SELECT id INTO a FROM public.onto_actors WHERE user_id='ae100000-0000-4000-8000-000000000001';
 INSERT INTO public.onto_projects(id,name,type_key,created_by,state_key)
 VALUES('ae900000-0000-4000-8000-000000000001','Restore fixture','project.default',a,'active');
 INSERT INTO public.onto_project_members(project_id,actor_id,role_key,access)
 VALUES('ae900000-0000-4000-8000-000000000001',a,'owner','admin') ON CONFLICT DO NOTHING;
 INSERT INTO public.onto_assets(id,project_id,storage_project_id,storage_path,content_type,file_size_bytes,created_by,extracted_text,extraction_summary)
 VALUES('aea00000-0000-4000-8000-000000000001','ae900000-0000-4000-8000-000000000001','ae900000-0000-4000-8000-000000000001','projects/ae900000-0000-4000-8000-000000000001/assets/aea00000-0000-4000-8000-000000000001/original.png','image/png',100,a,repeat('ocr ',20000),repeat('summary ',2000));
 INSERT INTO public.chat_message_attachments(session_id,user_id,message_id,attachment_kind,media_type,asset_id,project_id,display_order)
 VALUES('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001',pg_temp.mid(400),'onto_asset','image','aea00000-0000-4000-8000-000000000001','ae900000-0000-4000-8000-000000000001',1);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v jsonb; BEGIN
 SELECT r INTO v FROM jsonb_array_elements(public.get_chat_restore_attachments_v1('ae200000-0000-4000-8000-000000000001',ARRAY['ae300000-0000-4000-8000-000000000400'::uuid])) r WHERE r->>'attachment_kind'='onto_asset';
 IF length(v#>>'{asset,extracted_text}') IS DISTINCT FROM 1600 OR length(v#>>'{asset,extraction_summary}') IS DISTINCT FROM 700 THEN RAISE EXCEPTION 'OCR projection not bounded or inaccessible: %',v; END IF;
END $$;
RESET ROLE;

-- Executable receipts must be byte-for-byte unchanged, even when surrounding
-- document bodies or graph data exceed the preview budget and at legacy nesting.
DO $$ DECLARE v jsonb; receipt jsonb; proposal jsonb; BEGIN
 receipt := jsonb_build_object('version',1,'revert_patch',jsonb_build_object('text',repeat('undo',6000)));
 v := jsonb_build_object('result',jsonb_build_object('document_change',receipt,'table_change',receipt,'content',repeat('body',90000)));
 v := public.chat_restore_display_json_v1(v);
 IF v#>'{result,document_change}' <> receipt OR v#>'{result,table_change}' <> receipt THEN RAISE EXCEPTION 'undo receipt corrupted'; END IF;
 proposal := jsonb_build_object('card_rail','proposal_v1','client_action',jsonb_build_object('payload',repeat('action',4000)));
 IF public.chat_restore_display_json_v1(jsonb_build_object('data',proposal)) -> 'data' <> proposal THEN RAISE EXCEPTION 'proposal corrupted'; END IF;
 IF (SELECT provolatile FROM pg_proc WHERE oid='public.get_chat_session_restore_v1(uuid,uuid)'::regprocedure) <> 's' THEN RAISE EXCEPTION 'reader no longer stable'; END IF;
END $$;
ROLLBACK;
