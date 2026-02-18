-- supabase/migrations/20260425000006_add_billing_state_transition_audit.sql
-- Billing transition audit timeline + admin controls for consumption gating.

create table if not exists public.billing_state_transitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  from_billing_state text null,
  to_billing_state text not null,
  from_billing_tier text null,
  to_billing_tier text not null,
  from_frozen_reason text null,
  to_frozen_reason text null,
  changed_by_user_id uuid null references public.users(id) on delete set null,
  change_source text not null default 'system',
  created_at timestamptz not null default now(),
  constraint chk_billing_state_transitions_from_state check (
    from_billing_state is null
    or from_billing_state in ('explorer_active', 'upgrade_required_frozen', 'pro_active', 'power_active')
  ),
  constraint chk_billing_state_transitions_to_state check (
    to_billing_state in ('explorer_active', 'upgrade_required_frozen', 'pro_active', 'power_active')
  ),
  constraint chk_billing_state_transitions_from_tier check (
    from_billing_tier is null
    or from_billing_tier in ('explorer', 'pro', 'power')
  ),
  constraint chk_billing_state_transitions_to_tier check (
    to_billing_tier in ('explorer', 'pro', 'power')
  )
);

create index if not exists idx_billing_state_transitions_user_created
  on public.billing_state_transitions(user_id, created_at desc);
create index if not exists idx_billing_state_transitions_created
  on public.billing_state_transitions(created_at desc);

create or replace function public.log_billing_account_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_source text := 'system';
begin
  if v_actor_id is not null then
    if is_admin() then
      v_source := 'admin';
    elsif v_actor_id = new.user_id then
      v_source := 'user';
    else
      v_source := 'authenticated';
    end if;
  end if;

  if tg_op = 'INSERT' then
    insert into public.billing_state_transitions (
      user_id,
      from_billing_state,
      to_billing_state,
      from_billing_tier,
      to_billing_tier,
      from_frozen_reason,
      to_frozen_reason,
      changed_by_user_id,
      change_source
    ) values (
      new.user_id,
      null,
      new.billing_state,
      null,
      new.billing_tier,
      null,
      new.frozen_reason,
      v_actor_id,
      v_source
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.billing_state is distinct from new.billing_state
       or old.billing_tier is distinct from new.billing_tier
       or old.frozen_reason is distinct from new.frozen_reason then
      insert into public.billing_state_transitions (
        user_id,
        from_billing_state,
        to_billing_state,
        from_billing_tier,
        to_billing_tier,
        from_frozen_reason,
        to_frozen_reason,
        changed_by_user_id,
        change_source
      ) values (
        new.user_id,
        old.billing_state,
        new.billing_state,
        old.billing_tier,
        new.billing_tier,
        old.frozen_reason,
        new.frozen_reason,
        v_actor_id,
        v_source
      );
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_billing_account_transitions on public.billing_accounts;
create trigger trg_billing_account_transitions
after insert or update on public.billing_accounts
for each row execute function public.log_billing_account_transition();

-- Backfill one baseline transition row for existing accounts that have no history yet.
insert into public.billing_state_transitions (
  user_id,
  from_billing_state,
  to_billing_state,
  from_billing_tier,
  to_billing_tier,
  from_frozen_reason,
  to_frozen_reason,
  changed_by_user_id,
  change_source,
  created_at
)
select
  ba.user_id,
  null,
  ba.billing_state,
  null,
  ba.billing_tier,
  null,
  ba.frozen_reason,
  null,
  'migration',
  ba.created_at
from public.billing_accounts ba
where not exists (
  select 1
  from public.billing_state_transitions bst
  where bst.user_id = ba.user_id
);

alter table public.billing_state_transitions enable row level security;

drop policy if exists "billing_state_transitions_select_own" on public.billing_state_transitions;
create policy "billing_state_transitions_select_own"
  on public.billing_state_transitions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "billing_state_transitions_select_admin" on public.billing_state_transitions;
create policy "billing_state_transitions_select_admin"
  on public.billing_state_transitions
  for select
  to authenticated
  using (is_admin());

drop policy if exists "billing_accounts_select_admin" on public.billing_accounts;
create policy "billing_accounts_select_admin"
  on public.billing_accounts
  for select
  to authenticated
  using (is_admin());

drop policy if exists "billing_accounts_update_admin" on public.billing_accounts;
create policy "billing_accounts_update_admin"
  on public.billing_accounts
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "billing_accounts_insert_admin" on public.billing_accounts;
create policy "billing_accounts_insert_admin"
  on public.billing_accounts
  for insert
  to authenticated
  with check (is_admin());

drop policy if exists "billing_credit_ledger_select_admin" on public.billing_credit_ledger;
create policy "billing_credit_ledger_select_admin"
  on public.billing_credit_ledger
  for select
  to authenticated
  using (is_admin());
