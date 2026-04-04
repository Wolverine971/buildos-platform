-- supabase/migrations/20260428000016_add_chat_prompt_eval_tables.sql
-- Prompt eval storage for FastChat turn-run acceptance checks.

create table if not exists public.chat_prompt_eval_runs (
  id uuid primary key default gen_random_uuid(),
  turn_run_id uuid not null references public.chat_turn_runs(id) on delete cascade,
  scenario_slug text not null,
  scenario_version text not null,
  runner_type text not null default 'admin_manual',
  status text not null,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint chk_chat_prompt_eval_runs_status check (status in ('passed', 'failed', 'error'))
);

create index if not exists idx_chat_prompt_eval_runs_turn_run_created
  on public.chat_prompt_eval_runs(turn_run_id, created_at desc);
create index if not exists idx_chat_prompt_eval_runs_scenario_created
  on public.chat_prompt_eval_runs(scenario_slug, created_at desc);
create index if not exists idx_chat_prompt_eval_runs_status_created
  on public.chat_prompt_eval_runs(status, created_at desc);

create table if not exists public.chat_prompt_eval_assertions (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid not null references public.chat_prompt_eval_runs(id) on delete cascade,
  assertion_key text not null,
  status text not null,
  expected jsonb null,
  actual jsonb null,
  details text null,
  created_at timestamptz not null default now(),

  constraint chk_chat_prompt_eval_assertions_status check (status in ('passed', 'failed', 'skipped'))
);

create index if not exists idx_chat_prompt_eval_assertions_eval_run
  on public.chat_prompt_eval_assertions(eval_run_id, created_at asc);
create index if not exists idx_chat_prompt_eval_assertions_status_created
  on public.chat_prompt_eval_assertions(status, created_at desc);

alter table public.chat_prompt_eval_runs enable row level security;
alter table public.chat_prompt_eval_assertions enable row level security;

drop policy if exists "chat_prompt_eval_runs_admin_select" on public.chat_prompt_eval_runs;
create policy "chat_prompt_eval_runs_admin_select"
  on public.chat_prompt_eval_runs
  for select
  to authenticated
  using (is_admin());

drop policy if exists "chat_prompt_eval_runs_admin_insert" on public.chat_prompt_eval_runs;
create policy "chat_prompt_eval_runs_admin_insert"
  on public.chat_prompt_eval_runs
  for insert
  to authenticated
  with check (is_admin());

drop policy if exists "chat_prompt_eval_runs_admin_update" on public.chat_prompt_eval_runs;
create policy "chat_prompt_eval_runs_admin_update"
  on public.chat_prompt_eval_runs
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "chat_prompt_eval_runs_service_role" on public.chat_prompt_eval_runs;
create policy "chat_prompt_eval_runs_service_role"
  on public.chat_prompt_eval_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "chat_prompt_eval_assertions_admin_select" on public.chat_prompt_eval_assertions;
create policy "chat_prompt_eval_assertions_admin_select"
  on public.chat_prompt_eval_assertions
  for select
  to authenticated
  using (is_admin());

drop policy if exists "chat_prompt_eval_assertions_admin_insert" on public.chat_prompt_eval_assertions;
create policy "chat_prompt_eval_assertions_admin_insert"
  on public.chat_prompt_eval_assertions
  for insert
  to authenticated
  with check (is_admin());

drop policy if exists "chat_prompt_eval_assertions_admin_update" on public.chat_prompt_eval_assertions;
create policy "chat_prompt_eval_assertions_admin_update"
  on public.chat_prompt_eval_assertions
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "chat_prompt_eval_assertions_service_role" on public.chat_prompt_eval_assertions;
create policy "chat_prompt_eval_assertions_service_role"
  on public.chat_prompt_eval_assertions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
