-- supabase/tests/google_agent_oauth_isolation.check.sql
-- Disposable rehearsal only. Prove ownership, consent cancellation and preservation.
begin;
do $$
declare
  u uuid := 'a9110000-0000-4000-8000-000000000001';
  other_user uuid := 'a9110000-0000-4000-8000-000000000002';
  gmail uuid := 'a9110000-0000-4000-8000-000000000003';
  calendar uuid := 'a9110000-0000-4000-8000-000000000004';
  k text; c uuid; n integer; rejected boolean;
begin
  insert into auth.users(id,email) values (u,'agent-isolation@example.com'),(other_user,'other-agent@example.com');
  insert into public.users(id,email) values (u,'agent-isolation@example.com'),(other_user,'other-agent@example.com') on conflict do nothing;
  insert into public.user_email_connections(id,user_id,provider_account_id,email_address,account_label)
    values (gmail,u,'subject','agent-isolation@example.com','Mail');
  insert into public.email_connection_credentials(connection_id,grant_kind,oauth_client_kind,access_token_ciphertext,refresh_token_ciphertext)
    values (gmail,'read','gmail_read','enc:gmail:v1.original-access','enc:gmail:v1.original-refresh');
  insert into public.user_calendar_connections(id,user_id,provider_account_id,email_address,account_label)
    values (calendar,u,'subject','agent-isolation@example.com','Calendar');
  insert into public.calendar_connection_credentials(connection_id,access_token_ciphertext,refresh_token_ciphertext)
    values (calendar,'enc:calendar:v1.original-access','enc:calendar:v1.original-refresh');
  insert into public.user_calendar_tokens(user_id,google_user_id,access_token,refresh_token)
    values (u,'subject','legacy-original-access','legacy-original-refresh');

  assert not has_table_privilege('authenticated','public.google_agent_grants','SELECT,INSERT,UPDATE,DELETE');
  assert not has_table_privilege('anon','public.google_agent_oauth_states','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege('authenticated','public.consume_google_agent_oauth_state(text,uuid)','EXECUTE');
  set local role service_role;
  foreach k in array array['gmail','calendar','calendar_legacy'] loop
    c := case k when 'gmail' then gmail when 'calendar' then calendar else u end;
    insert into public.google_agent_oauth_states(state_hash,user_id,connection_kind,connection_id,provider_account_id,oauth_client_id,redirect_uri,nonce,code_verifier,expires_at)
      values (k,u,k,c,'subject','agent-client','https://build-os.com/auth/google/agent/callback','nonce','verifier',now()+interval '10 minutes');
    select count(*) into n from public.consume_google_agent_oauth_state(k,other_user);
    assert n=0, 'foreign user claimed state';
    select count(*) into n from public.consume_google_agent_oauth_state(k,u);
    assert n=1, 'state not claimable';
    select count(*) into n from public.consume_google_agent_oauth_state(k,u);
    assert n=0, 'state replay succeeded';
    perform public.save_google_agent_grant(k,u,'enc:google-agent:v1.access','enc:google-agent:v1.refresh',now()+interval '1 hour',null,array['scope']);
    assert exists(select 1 from public.google_agent_grants where user_id=u and connection_kind=k);
    assert not exists(select 1 from public.google_agent_oauth_states where state_hash=k);

    rejected := false;
    begin
      update public.google_agent_grants set user_id=other_user where user_id=u and connection_kind=k;
    exception when raise_exception then rejected := true;
    end;
    assert rejected, 'grant accepted another owner';
    rejected := false;
    begin
      update public.google_agent_grants set provider_account_id='wrong-subject' where user_id=u and connection_kind=k;
    exception when raise_exception then rejected := true;
    end;
    assert rejected, 'grant accepted another Google identity';
  end loop;

  assert (select refresh_token_ciphertext='enc:gmail:v1.original-refresh' from public.email_connection_credentials where connection_id=gmail), 'human Gmail token changed';
  assert (select refresh_token_ciphertext='enc:calendar:v1.original-refresh' from public.calendar_connection_credentials where connection_id=calendar), 'human Calendar token changed';
  assert (select refresh_token='legacy-original-refresh' from public.user_calendar_tokens where user_id=u), 'legacy human token changed';

  -- A callback already exchanging its code cannot resurrect disabled agent access.
  insert into public.google_agent_oauth_states(state_hash,user_id,connection_kind,connection_id,provider_account_id,oauth_client_id,redirect_uri,nonce,code_verifier,consumed_at,expires_at)
    values ('cancelled',u,'gmail',gmail,'subject','agent-client','https://build-os.com/auth/google/agent/callback','nonce','verifier',now(),now()+interval '10 minutes');
  delete from public.google_agent_oauth_states where state_hash='cancelled';
  delete from public.google_agent_grants where user_id=u and connection_kind='gmail';
  rejected := false;
  begin
    perform public.save_google_agent_grant('cancelled',u,'access','refresh',null,null,array['scope']);
  exception when raise_exception then rejected := true;
  end;
  assert rejected, 'cancelled callback resurrected agent access';
  assert (select status='active' from public.user_email_connections where id=gmail), 'disabling agent changed human connection';

  -- Human disconnect and identity replacement purge all companion credentials.
  update public.user_calendar_connections set deleted_at=now() where id=calendar;
  assert not exists(select 1 from public.google_agent_grants where connection_kind='calendar' and user_id=u);
  update public.user_calendar_tokens set google_user_id='replacement' where user_id=u;
  assert not exists(select 1 from public.google_agent_grants where connection_kind='calendar_legacy' and user_id=u);
  insert into public.google_agent_oauth_states(state_hash,user_id,connection_kind,connection_id,provider_account_id,oauth_client_id,redirect_uri,nonce,code_verifier,expires_at)
    values ('disable-human',u,'gmail',gmail,'subject','agent-client','https://build-os.com/auth/google/agent/callback','nonce','verifier',now()+interval '10 minutes');
  update public.user_email_connections set read_enabled=false where id=gmail;
  assert not exists(select 1 from public.google_agent_oauth_states where state_hash='disable-human');
  reset role;
end $$;
rollback;
