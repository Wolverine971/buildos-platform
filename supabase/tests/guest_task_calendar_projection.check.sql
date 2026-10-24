-- supabase/tests/guest_task_calendar_projection.check.sql
-- Tasker 144: run on the disposable rehearsal database, never production.
DO $$
DECLARE
  v_owner uuid := 'a1440000-0000-4000-8000-000000000001';
  v_guest uuid := 'a1440000-0000-4000-8000-000000000002';
  v_owner_actor uuid;
  v_guest_actor uuid;
  v_project uuid := 'a1440000-0000-4000-8000-000000000003';
  v_task uuid := 'a1440000-0000-4000-8000-000000000004';
  v_event uuid := 'a1440000-0000-4000-8000-000000000005';
  v_props jsonb;
  v_rejected boolean;
BEGIN
  INSERT INTO auth.users(id,email) VALUES (v_owner,'calendar-owner@example.com'),(v_guest,'calendar-guest@example.com');
  INSERT INTO public.users(id,email) VALUES (v_owner,'calendar-owner@example.com'),(v_guest,'calendar-guest@example.com') ON CONFLICT DO NOTHING;
  INSERT INTO public.onto_actors(kind,name,user_id) VALUES ('human','Calendar owner',v_owner),('human','Calendar guest',v_guest) ON CONFLICT DO NOTHING;
  SELECT id INTO v_owner_actor FROM public.onto_actors WHERE user_id=v_owner;
  SELECT id INTO v_guest_actor FROM public.onto_actors WHERE user_id=v_guest;
  INSERT INTO public.onto_projects(id,name,type_key,created_by,state_key) VALUES (v_project,'Guest calendar guard','project.default',v_owner_actor,'active');
  INSERT INTO public.onto_project_members(project_id,actor_id,role_key,access) VALUES
    (v_project,v_owner_actor,'owner','admin'),(v_project,v_guest_actor,'editor','write') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.onto_tasks(id,project_id,title,created_by,props) VALUES
    (v_task,v_project,'Guest task',v_guest_actor,jsonb_build_object('guest_agent_calendar_user_id',v_guest));

  -- Replacing all props cannot clear the recipient, including through a definer RPC.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_owner)::text,true);
  UPDATE public.onto_tasks SET props='{"label":"retained"}' WHERE id=v_task RETURNING props INTO v_props;
  ASSERT v_props->>'guest_agent_calendar_user_id'=v_guest::text, 'task pin removed';
  UPDATE public.onto_tasks SET props=jsonb_build_object('guest_agent_calendar_user_id',v_owner) WHERE id=v_task RETURNING props INTO v_props;
  ASSERT v_props->>'guest_agent_calendar_user_id'=v_guest::text, 'task pin reassigned';

  v_rejected := false;
  BEGIN
    INSERT INTO public.onto_tasks(project_id,title,created_by,props) VALUES
      (v_project,'Spoofed recipient',v_owner_actor,jsonb_build_object('guest_agent_calendar_user_id',v_owner));
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
  END;
  ASSERT v_rejected, 'authenticated caller could manufacture a pin';

  -- Exercise the real client role as well as the definer-RPC JWT boundary above.
  SET LOCAL ROLE authenticated;
  UPDATE public.onto_tasks SET props='{"label":"client edit"}' WHERE id=v_task RETURNING props INTO v_props;
  ASSERT v_props->>'guest_agent_calendar_user_id'=v_guest::text, 'client update lost pin';

  INSERT INTO public.onto_events(id,project_id,title,type_key,start_at,created_by,owner_entity_type,owner_entity_id,props)
    VALUES (v_event,v_project,'Guest event','event.task_work',now(),v_owner_actor,'task',v_task,
      jsonb_build_object('guest_agent_calendar_user_id',v_owner)) RETURNING props INTO v_props;
  ASSERT v_props->>'guest_agent_calendar_user_id'=v_guest::text, 'event did not inherit task pin';
  UPDATE public.onto_events SET props='{}' WHERE id=v_event RETURNING props INTO v_props;
  ASSERT v_props->>'guest_agent_calendar_user_id'=v_guest::text, 'event pin removed';
  UPDATE public.onto_tasks SET deleted_at=now(), archived_at=now() WHERE id=v_task;
  UPDATE public.onto_events SET deleted_at=now(),props='{}' WHERE id=v_event RETURNING props INTO v_props;
  ASSERT v_props->>'guest_agent_calendar_user_id'=v_guest::text, 'archive cleanup lost pin';

  INSERT INTO public.onto_events(project_id,title,type_key,start_at,created_by,owner_entity_type,owner_entity_id,props)
    VALUES (v_project,'Unrelated event','event.general',now(),v_owner_actor,'project',v_project,
      jsonb_build_object('guest_agent_calendar_user_id',v_guest)) RETURNING props INTO v_props;
  ASSERT NOT (v_props ? 'guest_agent_calendar_user_id'), 'event caller could manufacture a pin';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_rejected := false;
  BEGIN
    INSERT INTO public.onto_tasks(project_id,title,created_by,props) VALUES
      (v_project,'Wrong creator',v_owner_actor,jsonb_build_object('guest_agent_calendar_user_id',v_guest));
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  ASSERT v_rejected, 'pin did not match creator';
  RAISE NOTICE 'guest task calendar projection checks passed';
END $$;
