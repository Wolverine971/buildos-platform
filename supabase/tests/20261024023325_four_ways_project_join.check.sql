-- supabase/tests/20261024023325_four_ways_project_join.check.sql
-- Task 143. Invented fixtures in a disposable database; all changes roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;
CREATE FUNCTION pg_temp.t143_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('f1430000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.t143_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'task143: %', message; END IF; END $$;
CREATE FUNCTION pg_temp.t143_as(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',pg_temp.t143_id(n))::text,true);
 PERFORM set_config('request.jwt.claim.sub',pg_temp.t143_id(n)::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.t143_id(integer), pg_temp.t143_assert(boolean,text), pg_temp.t143_as(integer) TO authenticated, anon;
INSERT INTO auth.users(id,email) SELECT pg_temp.t143_id(n),'join143.'||n||'@example.com' FROM generate_series(1,12) n;
INSERT INTO public.users(id,email,name) SELECT pg_temp.t143_id(n),'join143.'||n||'@example.com','Joiner '||n FROM generate_series(1,12) n ON CONFLICT DO NOTHING;
INSERT INTO public.onto_actors(id,kind,name,email,user_id) SELECT pg_temp.t143_id(n+20),'human','Joiner '||n,'join143.'||n||'@example.com',pg_temp.t143_id(n) FROM generate_series(1,12) n ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects(id,name,type_key,created_by,state_key) SELECT pg_temp.t143_id(n),'Project '||n,'project.default',pg_temp.t143_id(21),'active' FROM generate_series(101,106) n;
INSERT INTO public.onto_project_members(project_id,actor_id,role_key,access,agent_access) SELECT pg_temp.t143_id(n),pg_temp.t143_id(21),'owner','admin','write' FROM generate_series(101,106) n ON CONFLICT DO NOTHING;
INSERT INTO public.user_notification_preferences(user_id,in_app_enabled,push_enabled,email_enabled)
VALUES(pg_temp.t143_id(1),true,false,false) ON CONFLICT(user_id) DO UPDATE SET in_app_enabled=true,push_enabled=false,email_enabled=false;
CREATE FUNCTION pg_temp.t143_invite(i integer, u integer, p integer, role text DEFAULT 'editor', agents text DEFAULT 'read') RETURNS void LANGUAGE sql AS $$
 INSERT INTO public.onto_project_invites(id,project_id,invitee_email,invitee_user_id,role_key,access,agent_access,token_hash,invited_by_actor_id,status,expires_at)
 VALUES(pg_temp.t143_id(i),pg_temp.t143_id(p),'join143.'||u||'@example.com',pg_temp.t143_id(u),role,CASE WHEN role='editor' THEN 'write' ELSE 'read' END,agents,lpad(i::text,64,'0'),pg_temp.t143_id(21),'pending',now()+interval '7 days')
$$;
CREATE FUNCTION pg_temp.t143_request(i integer, u integer, kind text DEFAULT 'access', p integer DEFAULT NULL, role text DEFAULT 'viewer', agents text DEFAULT 'read', items jsonb DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO public.people_requests(id,from_user_id,to_user_id,kind,project_id,project_hint,role_requested,agent_access_requested,requested_items)
 VALUES(pg_temp.t143_id(i),pg_temp.t143_id(u),pg_temp.t143_id(1),kind,pg_temp.t143_id(p),'Project 101',role,agents,items)
$$;
CREATE TEMP TABLE t143_results(key text PRIMARY KEY, value jsonb);
GRANT ALL ON t143_results TO authenticated;

-- Direct acceptance: default Read, named result, atomic owner queue, opt-out preserved.
SELECT pg_temp.t143_invite(201,2,101);
UPDATE public.onto_project_invites SET status='declined', declined_at=now() WHERE id=pg_temp.t143_id(201);
SELECT pg_temp.t143_invite(202,2,101,'viewer','off');
INSERT INTO public.notification_subscriptions(user_id,event_type,is_active,created_by) VALUES(pg_temp.t143_id(2),'project.activity.batched',false,pg_temp.t143_id(2)) ON CONFLICT(user_id,event_type) DO UPDATE SET is_active=false;
SELECT pg_temp.t143_as(2);
SET LOCAL ROLE authenticated;
INSERT INTO t143_results SELECT 'direct',to_jsonb(r) FROM public.accept_project_invite_by_id(pg_temp.t143_id(201)) r;
SELECT pg_temp.t143_assert((SELECT value @> '{"status":"joined","role_key":"editor","agent_access":"read","project_name":"Project 101"}' FROM t143_results WHERE key='direct'),'direct result/default');
SELECT pg_temp.t143_assert((SELECT status='already_member' FROM public.accept_project_invite_by_id(pg_temp.t143_id(201))),'retry already member');
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='revoked' FROM public.onto_project_invites WHERE id=pg_temp.t143_id(202)),'competing invitation retired');
SELECT pg_temp.t143_assert((SELECT NOT is_active FROM public.notification_subscriptions WHERE user_id=pg_temp.t143_id(2) AND event_type='project.activity.batched'),'join preserves global opt-out');
SELECT pg_temp.t143_assert((SELECT count(*)=1 FROM public.notification_events WHERE event_type='project.invite.accepted' AND actor_user_id=pg_temp.t143_id(2)),'exactly one owner join event');
SELECT pg_temp.t143_assert((SELECT count(*)=1 FROM public.notification_deliveries d JOIN public.notification_events e ON e.id=d.event_id WHERE e.event_type='project.invite.accepted' AND e.actor_user_id=pg_temp.t143_id(2) AND d.channel='in_app' AND d.status='pending'),'delivery queued durably with existing channel preference');
SELECT pg_temp.t143_assert((SELECT NOT push_enabled AND NOT email_enabled FROM public.user_notification_preferences WHERE user_id=pg_temp.t143_id(1)),'channel preferences untouched');
SELECT public.queue_project_activity_notification_batch(pg_temp.t143_id(101),pg_temp.t143_id(1),pg_temp.t143_id(21),'task','updated');
SELECT pg_temp.t143_assert((SELECT NOT is_active FROM public.notification_subscriptions WHERE user_id=pg_temp.t143_id(2) AND event_type='project.activity.batched'),'batch preserves opt-out');
SELECT pg_temp.t143_assert(NOT EXISTS(SELECT 1 FROM public.project_notification_batches WHERE recipient_user_id=pg_temp.t143_id(2)),'batch skips inactive subscriber');

-- Legacy acceptance cannot downgrade newer permissions or apply the stale agent setting.
UPDATE public.onto_project_members SET agent_access='off' WHERE project_id=pg_temp.t143_id(101) AND actor_id=pg_temp.t143_id(22);
SELECT pg_temp.t143_as(2);
SET LOCAL ROLE authenticated;
SELECT public.accept_project_invite(lpad('202',64,'0'),pg_temp.t143_id(22),'join143.2@example.com');
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT role_key='editor' AND agent_access='off' FROM public.onto_project_members WHERE project_id=pg_temp.t143_id(101) AND actor_id=pg_temp.t143_id(22)),'legacy stale invite preserves actual permissions');

-- Link join leaves a broad owner-scoped request open, uses Viewer/Read and seeds activity.
SELECT pg_temp.t143_request(301,3);
SELECT pg_temp.t143_invite(203,3,101);
SELECT pg_temp.t143_as(1);
SET LOCAL ROLE authenticated;
SELECT public.create_project_invite_link(pg_temp.t143_id(101),pg_temp.t143_id(401),repeat('a',64));
RESET ROLE;
SELECT pg_temp.t143_as(3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t143_assert(public.accept_project_invite_link(repeat('a',64)) @> '{"status":"joined","role_key":"viewer","agent_access":"read"}', 'link defaults');
SELECT pg_temp.t143_assert(public.accept_project_invite_link(repeat('a',64))->>'status'='already_member','link repeat');
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='pending' FROM public.people_requests WHERE id=pg_temp.t143_id(301)),'unassociated broad request stays open despite matching prose');
SELECT pg_temp.t143_assert((SELECT status='revoked' FROM public.onto_project_invites WHERE id=pg_temp.t143_id(203)),'link settles direct invite');
SELECT pg_temp.t143_assert((SELECT is_active FROM public.notification_subscriptions WHERE user_id=pg_temp.t143_id(3) AND event_type='project.activity.batched'),'enabled activity seeded');
SELECT pg_temp.t143_assert((SELECT join_count=1 FROM public.onto_project_invite_links WHERE id=pg_temp.t143_id(401)),'link counted once');

-- Approval uses joiner's effective setting (the owner's opposite override is irrelevant).
UPDATE public.onto_projects SET props=jsonb_build_object('notifications',jsonb_build_object('shared_project_activity',jsonb_build_object('enabled_by_default',true,'member_overrides',jsonb_build_object(pg_temp.t143_id(24)::text,false,pg_temp.t143_id(21)::text,true)))) WHERE id=pg_temp.t143_id(102);
SELECT pg_temp.t143_request(302,4);
SELECT pg_temp.t143_invite(204,4,102,'editor','write');
SELECT pg_temp.t143_as(1);
SET LOCAL ROLE authenticated;
INSERT INTO t143_results SELECT 'approval',public.decide_people_request(pg_temp.t143_id(302),'approve',jsonb_build_array(jsonb_build_object('project_id',pg_temp.t143_id(102),'role','viewer','agent_access','off')));
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT value->'projects'->0->>'status'='joined' FROM t143_results WHERE key='approval'),'approval reports membership transition');
SELECT pg_temp.t143_assert(NOT EXISTS(SELECT 1 FROM public.notification_subscriptions WHERE user_id=pg_temp.t143_id(4) AND event_type='project.activity.batched'),'joiner override off respected during owner approval');
SELECT pg_temp.t143_assert(NOT EXISTS(SELECT 1 FROM public.notification_events WHERE event_type='project.invite.accepted' AND actor_user_id=pg_temp.t143_id(4)),'owner approval produces no redundant owner notice');
SELECT pg_temp.t143_assert((SELECT action_url='/projects/'||pg_temp.t143_id(102)::text||'?joined=1' FROM public.user_notifications WHERE user_id=pg_temp.t143_id(4) AND event_type='people.request.approved'),'single approval opens project arrival');
SELECT pg_temp.t143_as(4);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t143_assert((SELECT status='already_member' AND role_key='viewer' AND agent_access='off' FROM public.accept_project_invite_by_id(pg_temp.t143_id(204))),'invite after approval preserves newer permissions');
SELECT pg_temp.t143_assert((public.list_people_requests()->'outgoing'->0->'projects'->0->>'project_name')='Project 102','outgoing approval links authorized project');
RESET ROLE;

-- Former members ask through a link; an owner invitation can directly restore them.
INSERT INTO public.onto_project_members(project_id,actor_id,role_key,access,agent_access,removed_at) VALUES(pg_temp.t143_id(101),pg_temp.t143_id(25),'viewer','read','read',now());
SELECT pg_temp.t143_as(5);
SET LOCAL ROLE authenticated;
INSERT INTO t143_results SELECT 'rejoin', public.accept_project_invite_link(repeat('a',64));
SELECT pg_temp.t143_assert((SELECT value->>'status'='rejoin_requested' FROM t143_results WHERE key='rejoin'),'former member must ask');
RESET ROLE;
SELECT pg_temp.t143_invite(205,5,101,'viewer','read');
SELECT pg_temp.t143_as(5);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t143_assert((SELECT status='rejoined' FROM public.accept_project_invite_by_id(pg_temp.t143_id(205))),'owner invite restores former member');
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='canceled' AND settled_elsewhere FROM public.people_requests WHERE id=(SELECT (value->>'request_id')::uuid FROM t143_results WHERE key='rejoin')),'matching rejoin settled honestly');

-- A Viewer join cannot settle a request for editing/agent Write. Partial settlement retains all other items.
SELECT pg_temp.t143_request(303,6,'upgrade',103,'viewer','read',jsonb_build_array(jsonb_build_object('project_id',pg_temp.t143_id(103),'need','edit','caller_ids','[]'::jsonb)));
SELECT pg_temp.t143_invite(206,6,103,'viewer','read');
UPDATE public.onto_projects SET props='{"notifications":{"shared_project_activity":{"enabled_by_default":false}}}' WHERE id=pg_temp.t143_id(103);
SELECT pg_temp.t143_as(6);
SET LOCAL ROLE authenticated;
SELECT public.accept_project_invite_by_id(pg_temp.t143_id(206));
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='pending' AND NOT settled_elsewhere FROM public.people_requests WHERE id=pg_temp.t143_id(303)),'viewer does not satisfy edit/Write');
SELECT pg_temp.t143_assert(NOT EXISTS(SELECT 1 FROM public.notification_subscriptions WHERE user_id=pg_temp.t143_id(6) AND event_type='project.activity.batched'),'disabled project does not seed activity');
SELECT pg_temp.t143_request(304,7,'upgrade',104,'viewer','read',jsonb_build_array(jsonb_build_object('project_id',pg_temp.t143_id(104),'need','agents_read','caller_ids','[]'::jsonb),jsonb_build_object('project_id',pg_temp.t143_id(105),'need','agents_write','caller_ids','[]'::jsonb)));
SELECT pg_temp.t143_invite(207,7,104,'viewer','read');
SELECT pg_temp.t143_as(7);
SET LOCAL ROLE authenticated;
SELECT public.accept_project_invite_by_id(pg_temp.t143_id(207));
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='pending' AND settled_elsewhere AND jsonb_array_length(requested_items)=1 AND requested_items->0->>'project_id'=pg_temp.t143_id(105)::text AND jsonb_array_length(decision)=1 FROM public.people_requests WHERE id=pg_temp.t143_id(304)),'partial upgrade retains unsatisfied item and records settled item');
SELECT pg_temp.t143_invite(208,7,105,'editor','write');
SELECT pg_temp.t143_as(7);
SET LOCAL ROLE authenticated;
SELECT public.accept_project_invite_by_id(pg_temp.t143_id(208));
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='canceled' AND settled_elsewhere AND jsonb_array_length(decision)=2 FROM public.people_requests WHERE id=pg_temp.t143_id(304)),'all satisfied upgrade items close without owner approval or connection grant');

-- Rejoin approval cannot be redirected to a different project, including through a direct RPC call.
SELECT pg_temp.t143_request(305,8,'rejoin',101);
SELECT pg_temp.t143_as(1);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.decide_people_request(pg_temp.t143_id(305),'approve',jsonb_build_array(jsonb_build_object('project_id',pg_temp.t143_id(102))));
 RAISE EXCEPTION 'task143: accepted wrong rejoin project';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
RESET ROLE;
SELECT pg_temp.t143_assert((SELECT status='pending' FROM public.people_requests WHERE id=pg_temp.t143_id(305)),'bad rejoin grant rolled back');

-- Recoverable declines still work. Authenticated nonrecipients and anonymous callers cannot accept.
SELECT pg_temp.t143_invite(209,9,106);
UPDATE public.onto_project_invites SET status='declined',declined_at=now()-interval '1 hour' WHERE id=pg_temp.t143_id(209);
SELECT pg_temp.t143_as(10);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.accept_project_invite_by_id(pg_temp.t143_id(209));
 RAISE EXCEPTION 'task143: another user accepted invite';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SELECT pg_temp.t143_as(9);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t143_assert((SELECT agent_access='read' FROM public.list_pending_project_invites() WHERE invite_id=pg_temp.t143_id(209)),'list preview contains agent access');
SELECT pg_temp.t143_assert((SELECT status='joined' FROM public.accept_project_invite_by_id(pg_temp.t143_id(209))),'declined invite recoverable');
RESET ROLE;
SELECT pg_temp.t143_assert(NOT has_function_privilege('authenticated','private.finish_project_join(uuid,uuid,text,boolean,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.accept_project_invite_by_id(uuid)','EXECUTE'),'internal completion helper and public mutations protected');

-- The legacy entry point still provisions a first-time actor before matching their email.
DELETE FROM public.onto_actors WHERE id=pg_temp.t143_id(31);
SELECT pg_temp.t143_invite(210,11,106,'viewer','read');
SELECT pg_temp.t143_as(11);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t143_assert((SELECT role_key='viewer' FROM public.accept_project_invite(lpad('210',64,'0'),NULL,'join143.11@example.com')),'legacy acceptance provisions an actor');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
SELECT pg_temp.t143_assert((SELECT invitee_email IS NULL AND agent_access='read' FROM public.get_project_invite_preview(lpad('209',64,'0'))),'anonymous preview hides email and includes permission');
RESET ROLE;
ROLLBACK;
