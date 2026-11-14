-- supabase/migrations/20261109180053_google_agent_oauth_isolation.sql
-- Agent grants supplement existing human grants. No existing token is rewritten.
begin;
set local lock_timeout = '5s';

create table public.google_agent_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_kind text not null check (connection_kind in ('gmail', 'calendar', 'calendar_legacy')),
  connection_id uuid not null,
  provider_account_id text not null,
  oauth_client_id text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  granted_scopes text[] not null,
  status text not null default 'active' check (status in ('active', 'reconnect_required')),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connection_kind, connection_id)
);
create index google_agent_grants_connection_idx on public.google_agent_grants(connection_kind, connection_id);
alter table public.google_agent_grants enable row level security;
revoke all on public.google_agent_grants from public, anon, authenticated;
grant all on public.google_agent_grants to service_role;
create policy google_agent_grants_service on public.google_agent_grants
  for all to service_role using (true) with check (true);

create table public.google_agent_oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  connection_kind text not null check (connection_kind in ('gmail', 'calendar', 'calendar_legacy')),
  connection_id uuid not null,
  provider_account_id text not null,
  oauth_client_id text not null,
  redirect_uri text not null,
  nonce text not null,
  code_verifier text not null,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index google_agent_oauth_states_user_idx on public.google_agent_oauth_states(user_id);
create index google_agent_oauth_states_expiry_idx on public.google_agent_oauth_states(expires_at);
alter table public.google_agent_oauth_states enable row level security;
revoke all on public.google_agent_oauth_states from public, anon, authenticated;
grant all on public.google_agent_oauth_states to service_role;
create policy google_agent_states_service on public.google_agent_oauth_states
  for all to service_role using (true) with check (true);

-- Atomically claim state once. Keep the row until save/expiry so disabling agent
-- access also cancels a callback that is exchanging its authorization code.
create function public.consume_google_agent_oauth_state(p_state_hash text, p_user_id uuid)
returns setof public.google_agent_oauth_states
language sql security invoker set search_path = pg_catalog, public
as $$
  update public.google_agent_oauth_states set consumed_at = now()
  where state_hash = p_state_hash and user_id = p_user_id and expires_at > now() and consumed_at is null
  returning *;
$$;
revoke all on function public.consume_google_agent_oauth_state(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_google_agent_oauth_state(text, uuid) to service_role;

create function public.save_google_agent_grant(
  p_state_hash text, p_user_id uuid, p_access_token_ciphertext text,
  p_refresh_token_ciphertext text, p_access_token_expires_at timestamptz,
  p_refresh_token_expires_at timestamptz, p_granted_scopes text[]
)
returns void language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare s public.google_agent_oauth_states;
begin
  select * into s from public.google_agent_oauth_states
  where state_hash = p_state_hash and user_id = p_user_id
    and consumed_at is not null and expires_at > now() for update;
  if not found then raise exception 'google_agent_consent_cancelled'; end if;
  insert into public.google_agent_grants (
    user_id, connection_kind, connection_id, provider_account_id, oauth_client_id,
    access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at,
    refresh_token_expires_at, granted_scopes
  ) values (
    s.user_id, s.connection_kind, s.connection_id, s.provider_account_id, s.oauth_client_id,
    p_access_token_ciphertext, p_refresh_token_ciphertext, p_access_token_expires_at,
    p_refresh_token_expires_at, p_granted_scopes
  ) on conflict (user_id, connection_kind, connection_id) do update set
    provider_account_id = excluded.provider_account_id, oauth_client_id = excluded.oauth_client_id,
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token_expires_at = excluded.refresh_token_expires_at,
    granted_scopes = excluded.granted_scopes, status = 'active', revision = gen_random_uuid(), updated_at = now();
  delete from public.google_agent_oauth_states where state_hash = s.state_hash;
end;
$$;
revoke all on function public.save_google_agent_grant(text, uuid, text, text, timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.save_google_agent_grant(text, uuid, text, text, timestamptz, timestamptz, text[]) to service_role;

-- Keep ownership and identity invariant even when consent races a disconnect.
create function public.validate_google_agent_connection()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public
as $$
begin
  if new.connection_kind = 'gmail' then
    perform 1 from public.user_email_connections
    where id = new.connection_id and user_id = new.user_id
      and provider = 'google_gmail' and provider_account_id = new.provider_account_id
      and deleted_at is null and status <> 'disabled' and read_enabled
    for share;
  elsif new.connection_kind = 'calendar' then
    perform 1 from public.user_calendar_connections
    where id = new.connection_id and user_id = new.user_id
      and provider = 'google_calendar' and provider_account_id = new.provider_account_id
      and deleted_at is null and status <> 'disabled'
    for share;
  else
    perform 1 from public.user_calendar_tokens
    where user_id = new.user_id and new.connection_id = new.user_id
      and google_user_id = new.provider_account_id
    for share;
  end if;
  if not found then raise exception 'google_agent_connection_not_found'; end if;
  return new;
end;
$$;
revoke all on function public.validate_google_agent_connection() from public, anon, authenticated;
grant execute on function public.validate_google_agent_connection() to service_role;
create trigger validate_google_agent_grant before insert or update on public.google_agent_grants
for each row execute function public.validate_google_agent_connection();
create trigger validate_google_agent_state before insert on public.google_agent_oauth_states
for each row execute function public.validate_google_agent_connection();

-- Human disconnect/identity replacement invalidates companion grants and in-flight
-- consent. No Google revocation here: it can affect other clients in the same project.
create function public.purge_google_agent_connection()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_kind text := tg_argv[0]; v_id uuid; v_purge boolean := tg_op = 'DELETE';
begin
  if v_kind = 'calendar_legacy' then
    v_id := old.user_id;
    if tg_op = 'UPDATE' then
      v_purge := new.google_user_id is distinct from old.google_user_id or new.user_id is distinct from old.user_id;
    end if;
  else
    v_id := old.id;
    if tg_op = 'UPDATE' then
      v_purge := new.deleted_at is not null or new.status = 'disabled'
        or new.provider_account_id is distinct from old.provider_account_id
        or new.user_id is distinct from old.user_id;
      if v_kind = 'gmail' then v_purge := v_purge or not new.read_enabled; end if;
    end if;
  end if;
  if v_purge then
    delete from public.google_agent_grants where user_id = old.user_id and connection_kind = v_kind and connection_id = v_id;
    delete from public.google_agent_oauth_states where user_id = old.user_id and connection_kind = v_kind and connection_id = v_id;
  end if;
  return null;
end;
$$;
revoke all on function public.purge_google_agent_connection() from public, anon, authenticated;
grant execute on function public.purge_google_agent_connection() to service_role;
create trigger purge_gmail_agent_grant after update or delete on public.user_email_connections
for each row execute function public.purge_google_agent_connection('gmail');
create trigger purge_calendar_agent_grant after update or delete on public.user_calendar_connections
for each row execute function public.purge_google_agent_connection('calendar');
create trigger purge_legacy_calendar_agent_grant after update or delete on public.user_calendar_tokens
for each row execute function public.purge_google_agent_connection('calendar_legacy');
commit;
