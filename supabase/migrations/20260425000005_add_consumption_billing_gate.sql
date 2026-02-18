-- supabase/migrations/20260425000005_add_consumption_billing_gate.sql
-- Usage-ladder billing foundation:
-- - billing account state
-- - credit ledger
-- - trigger evaluation function (projects OR credits)

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  billing_state text not null default 'explorer_active',
  billing_tier text not null default 'explorer',
  frozen_at timestamptz null,
  frozen_reason text null,
  cycle_start_at timestamptz null,
  cycle_end_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_billing_accounts_state check (
    billing_state in ('explorer_active', 'upgrade_required_frozen', 'pro_active', 'power_active')
  ),
  constraint chk_billing_accounts_tier check (
    billing_tier in ('explorer', 'pro', 'power')
  )
);

create table if not exists public.billing_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  credits_delta integer not null,
  source_type text not null,
  source_id text null,
  idempotency_key text null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chk_billing_credit_ledger_event_type check (
    event_type in ('grant', 'consume', 'adjust', 'expire')
  )
);

create index if not exists idx_billing_accounts_user_id on public.billing_accounts(user_id);
create index if not exists idx_billing_accounts_state on public.billing_accounts(billing_state);
create index if not exists idx_billing_credit_ledger_user_created
  on public.billing_credit_ledger(user_id, created_at desc);
create index if not exists idx_billing_credit_ledger_source
  on public.billing_credit_ledger(source_type, source_id);

drop trigger if exists trg_billing_accounts_updated on public.billing_accounts;
create trigger trg_billing_accounts_updated
before update on public.billing_accounts
for each row execute function public.set_updated_at();

alter table public.billing_accounts enable row level security;
alter table public.billing_credit_ledger enable row level security;

drop policy if exists "billing_accounts_select_own" on public.billing_accounts;
create policy "billing_accounts_select_own"
  on public.billing_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "billing_credit_ledger_select_own" on public.billing_credit_ledger;
create policy "billing_credit_ledger_select_own"
  on public.billing_credit_ledger
  for select
  to authenticated
  using (auth.uid() = user_id);

insert into public.billing_accounts (user_id, billing_state, billing_tier)
select u.id, 'explorer_active', 'explorer'
from public.users u
on conflict (user_id) do nothing;

create or replace function public.evaluate_user_consumption_gate(
  p_user_id uuid,
  p_project_limit integer default 5,
  p_credit_limit integer default 400
)
returns table (
  user_id uuid,
  billing_state text,
  billing_tier text,
  is_frozen boolean,
  project_count integer,
  lifetime_credits_used integer,
  trigger_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_count integer := 0;
  v_total_tokens bigint := 0;
  v_lifetime_credits integer := 0;
  v_has_paid_subscription boolean := false;
  v_state text := 'explorer_active';
  v_tier text := 'explorer';
  v_reason text := null;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.billing_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select ba.billing_state, ba.billing_tier
  into v_state, v_tier
  from public.billing_accounts ba
  where ba.user_id = p_user_id;

  -- Primary project count: active ontology project memberships for the current user.
  select count(distinct m.project_id)::int
  into v_project_count
  from public.onto_project_members m
  join public.onto_actors a on a.id = m.actor_id
  join public.onto_projects p on p.id = m.project_id
  where a.user_id = p_user_id
    and m.removed_at is null
    and p.deleted_at is null;

  -- Legacy fallback when ontology memberships are not populated yet.
  if v_project_count = 0 then
    select count(*)::int
    into v_project_count
    from public.projects p
    where p.user_id = p_user_id;
  end if;

  select coalesce(sum(l.total_tokens), 0)::bigint
  into v_total_tokens
  from public.llm_usage_logs l
  where l.user_id = p_user_id
    and coalesce(l.status, 'success') = 'success';

  v_lifetime_credits := ceil(v_total_tokens::numeric / 1000.0)::int;

  select exists(
    select 1
    from public.customer_subscriptions cs
    where cs.user_id = p_user_id
      and cs.status in ('active', 'trialing', 'past_due')
  )
  into v_has_paid_subscription;

  if v_has_paid_subscription then
    if v_state = 'upgrade_required_frozen' then
      update public.billing_accounts
      set billing_state = case when billing_tier = 'power' then 'power_active' else 'pro_active' end,
          billing_tier = case when billing_tier = 'explorer' then 'pro' else billing_tier end,
          frozen_at = null,
          frozen_reason = null,
          updated_at = now()
      where user_id = p_user_id;
    end if;
  else
    -- Founder decision: auto-enrollment trigger is OR (projects OR credits).
    if v_tier = 'explorer'
       and (v_project_count > p_project_limit or v_lifetime_credits >= p_credit_limit) then
      v_reason := case
        when v_project_count > p_project_limit and v_lifetime_credits >= p_credit_limit
          then 'projects_or_credits'
        when v_project_count > p_project_limit
          then 'projects'
        else 'credits'
      end;

      update public.billing_accounts
      set billing_state = 'upgrade_required_frozen',
          frozen_at = coalesce(frozen_at, now()),
          frozen_reason = v_reason,
          updated_at = now()
      where user_id = p_user_id;
    end if;
  end if;

  return query
  select
    ba.user_id,
    ba.billing_state,
    ba.billing_tier,
    (ba.billing_state = 'upgrade_required_frozen') as is_frozen,
    v_project_count,
    v_lifetime_credits,
    ba.frozen_reason
  from public.billing_accounts ba
  where ba.user_id = p_user_id;
end;
$$;

grant execute on function public.evaluate_user_consumption_gate(uuid, integer, integer)
  to authenticated, service_role;

