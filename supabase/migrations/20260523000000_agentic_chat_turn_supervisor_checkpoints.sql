-- supabase/migrations/20260523000000_agentic_chat_turn_supervisor_checkpoints.sql
-- Agentic Chat Turn Supervisor checkpoints
-- Durable semantic checkpoints for supervisor interruptions and next-turn resume.

create table if not exists public.chat_turn_checkpoints (
  id uuid primary key default gen_random_uuid(),
  turn_run_id uuid not null references public.chat_turn_runs(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  resume_turn_run_id uuid null references public.chat_turn_runs(id) on delete set null,
  checkpoint_type text not null,
  status text not null default 'active',
  reason text not null,
  digest jsonb not null default '{}'::jsonb,
  resume_context jsonb not null default '{}'::jsonb,
  supervisor_decision jsonb not null default '{}'::jsonb,
  question text null,
  resume_started_at timestamptz null,
  resumed_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_chat_turn_checkpoints_status
    check (status in ('active', 'resuming', 'resumed', 'expired', 'cancelled')),
  constraint chk_chat_turn_checkpoints_type
    check (length(trim(checkpoint_type)) > 0),
  constraint chk_chat_turn_checkpoints_reason
    check (length(trim(reason)) > 0)
);

create index if not exists idx_chat_turn_checkpoints_session_status_created
  on public.chat_turn_checkpoints(session_id, status, created_at desc);

create index if not exists idx_chat_turn_checkpoints_turn_run_created
  on public.chat_turn_checkpoints(turn_run_id, created_at desc);

create index if not exists idx_chat_turn_checkpoints_resume_turn_run
  on public.chat_turn_checkpoints(resume_turn_run_id)
  where resume_turn_run_id is not null;

create index if not exists idx_chat_turn_checkpoints_stale_resuming
  on public.chat_turn_checkpoints(status, resume_started_at)
  where status = 'resuming';

drop trigger if exists trg_chat_turn_checkpoints_updated on public.chat_turn_checkpoints;
create trigger trg_chat_turn_checkpoints_updated
before update on public.chat_turn_checkpoints
for each row execute function public.set_updated_at();

alter table public.chat_turn_checkpoints enable row level security;

drop policy if exists "chat_turn_checkpoints_user_insert" on public.chat_turn_checkpoints;
create policy "chat_turn_checkpoints_user_insert"
  on public.chat_turn_checkpoints
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "chat_turn_checkpoints_user_select" on public.chat_turn_checkpoints;
create policy "chat_turn_checkpoints_user_select"
  on public.chat_turn_checkpoints
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "chat_turn_checkpoints_user_update" on public.chat_turn_checkpoints;
create policy "chat_turn_checkpoints_user_update"
  on public.chat_turn_checkpoints
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chat_turn_checkpoints_admin_select" on public.chat_turn_checkpoints;
create policy "chat_turn_checkpoints_admin_select"
  on public.chat_turn_checkpoints
  for select
  to authenticated
  using (is_admin());

drop policy if exists "chat_turn_checkpoints_service_role" on public.chat_turn_checkpoints;
create policy "chat_turn_checkpoints_service_role"
  on public.chat_turn_checkpoints
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
