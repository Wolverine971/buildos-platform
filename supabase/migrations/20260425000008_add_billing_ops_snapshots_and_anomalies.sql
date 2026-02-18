-- supabase/migrations/20260425000008_add_billing_ops_snapshots_and_anomalies.sql
-- Billing ops monitoring:
-- - scheduled snapshots for trend analysis
-- - anomaly records + notification state

create table if not exists public.billing_ops_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null default (timezone('utc', now())::date),
  snapshot_at timestamptz not null default now(),
  window_days integer not null default 30,
  source text not null default 'cron',

  frozen_active_count integer not null default 0,
  total_accounts_count integer not null default 0,
  freeze_transitions_window_count integer not null default 0,
  manual_unfreeze_window_count integer not null default 0,
  pro_to_power_transition_window_count integer not null default 0,
  auto_pro_to_power_transition_window_count integer not null default 0,
  paid_account_count integer not null default 0,
  current_power_account_count integer not null default 0,

  manual_unfreeze_rate numeric(12,6) not null default 0,
  auto_pro_to_power_escalation_rate numeric(12,6) not null default 0,
  current_power_share numeric(12,6) not null default 0,
  frozen_account_share numeric(12,6) not null default 0,

  anomaly_count integer not null default 0,
  generated_alerts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_billing_ops_snapshots_window_days check (window_days >= 1 and window_days <= 180),
  constraint chk_billing_ops_snapshots_source check (source in ('cron', 'manual')),
  constraint uq_billing_ops_snapshots_snapshot_date_window unique (snapshot_date, window_days)
);

create index if not exists idx_billing_ops_snapshots_date
  on public.billing_ops_snapshots(snapshot_date desc);
create index if not exists idx_billing_ops_snapshots_window_date
  on public.billing_ops_snapshots(window_days, snapshot_date desc);

drop trigger if exists trg_billing_ops_snapshots_updated on public.billing_ops_snapshots;
create trigger trg_billing_ops_snapshots_updated
before update on public.billing_ops_snapshots
for each row execute function public.set_updated_at();

create table if not exists public.billing_ops_anomalies (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.billing_ops_snapshots(id) on delete cascade,
  snapshot_date date not null,
  window_days integer not null default 30,
  anomaly_key text not null,
  severity text not null,
  metric_name text not null,
  observed_value numeric(16,6) not null,
  baseline_value numeric(16,6) null,
  delta_value numeric(16,6) null,
  delta_ratio numeric(16,6) null,
  details jsonb not null default '{}'::jsonb,
  notified_at timestamptz null,
  notification_channels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_billing_ops_anomalies_window_days check (window_days >= 1 and window_days <= 180),
  constraint chk_billing_ops_anomalies_severity check (severity in ('info', 'warning', 'critical')),
  constraint uq_billing_ops_anomalies_snapshot_key unique (snapshot_id, anomaly_key)
);

create index if not exists idx_billing_ops_anomalies_date
  on public.billing_ops_anomalies(snapshot_date desc);
create index if not exists idx_billing_ops_anomalies_severity
  on public.billing_ops_anomalies(severity, created_at desc);
create index if not exists idx_billing_ops_anomalies_notified
  on public.billing_ops_anomalies(notified_at, created_at desc);

drop trigger if exists trg_billing_ops_anomalies_updated on public.billing_ops_anomalies;
create trigger trg_billing_ops_anomalies_updated
before update on public.billing_ops_anomalies
for each row execute function public.set_updated_at();

alter table public.billing_ops_snapshots enable row level security;
alter table public.billing_ops_anomalies enable row level security;

drop policy if exists "billing_ops_snapshots_select_admin" on public.billing_ops_snapshots;
create policy "billing_ops_snapshots_select_admin"
  on public.billing_ops_snapshots
  for select
  to authenticated
  using (is_admin());

drop policy if exists "billing_ops_snapshots_insert_admin" on public.billing_ops_snapshots;
create policy "billing_ops_snapshots_insert_admin"
  on public.billing_ops_snapshots
  for insert
  to authenticated
  with check (is_admin());

drop policy if exists "billing_ops_snapshots_update_admin" on public.billing_ops_snapshots;
create policy "billing_ops_snapshots_update_admin"
  on public.billing_ops_snapshots
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "billing_ops_anomalies_select_admin" on public.billing_ops_anomalies;
create policy "billing_ops_anomalies_select_admin"
  on public.billing_ops_anomalies
  for select
  to authenticated
  using (is_admin());

drop policy if exists "billing_ops_anomalies_insert_admin" on public.billing_ops_anomalies;
create policy "billing_ops_anomalies_insert_admin"
  on public.billing_ops_anomalies
  for insert
  to authenticated
  with check (is_admin());

drop policy if exists "billing_ops_anomalies_update_admin" on public.billing_ops_anomalies;
create policy "billing_ops_anomalies_update_admin"
  on public.billing_ops_anomalies
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());
