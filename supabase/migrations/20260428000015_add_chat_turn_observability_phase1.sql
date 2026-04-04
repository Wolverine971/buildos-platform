-- supabase/migrations/20260428000015_add_chat_turn_observability_phase1.sql
-- FastChat prompt observability phase 1:
-- - first-class per-turn runs
-- - prompt snapshots
-- - append-only turn events
-- - correlation fields for tool executions and timing metrics

create table if not exists public.chat_turn_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  stream_run_id text not null,
  client_turn_id text null,
  source text not null default 'live_ui',
  context_type text not null,
  entity_id uuid null,
  project_id uuid null,
  gateway_enabled boolean not null default false,
  request_message text not null,
  user_message_id uuid null references public.chat_messages(id) on delete set null,
  assistant_message_id uuid null references public.chat_messages(id) on delete set null,
  status text not null default 'running',
  finished_reason text null,
  tool_round_count integer not null default 0,
  tool_call_count integer not null default 0,
  validation_failure_count integer not null default 0,
  llm_pass_count integer not null default 0,
  first_lane text null,
  first_help_path text null,
  first_skill_path text null,
  first_canonical_op text null,
  history_strategy text null,
  history_compressed boolean null,
  raw_history_count integer null,
  history_for_model_count integer null,
  cache_source text null,
  cache_age_seconds numeric null,
  request_prewarmed_context boolean null,
  prompt_snapshot_id uuid null,
  timing_metric_id uuid null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_chat_turn_runs_stream_run_id unique (stream_run_id),
  constraint chk_chat_turn_runs_status check (status in ('running', 'completed', 'failed', 'cancelled')),
  constraint chk_chat_turn_runs_counts check (
    tool_round_count >= 0 and
    tool_call_count >= 0 and
    validation_failure_count >= 0 and
    llm_pass_count >= 0
  )
);

create index if not exists idx_chat_turn_runs_session_created
  on public.chat_turn_runs(session_id, created_at desc);
create index if not exists idx_chat_turn_runs_context_created
  on public.chat_turn_runs(context_type, created_at desc);
create index if not exists idx_chat_turn_runs_status_created
  on public.chat_turn_runs(status, created_at desc);
create index if not exists idx_chat_turn_runs_first_op_created
  on public.chat_turn_runs(first_canonical_op, created_at desc);
create index if not exists idx_chat_turn_runs_first_skill_created
  on public.chat_turn_runs(first_skill_path, created_at desc);

drop trigger if exists trg_chat_turn_runs_updated on public.chat_turn_runs;
create trigger trg_chat_turn_runs_updated
before update on public.chat_turn_runs
for each row execute function public.set_updated_at();

create table if not exists public.chat_prompt_snapshots (
  id uuid primary key default gen_random_uuid(),
  turn_run_id uuid not null unique references public.chat_turn_runs(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_version text not null,
  system_prompt text not null,
  model_messages jsonb not null default '[]'::jsonb,
  tool_definitions jsonb null,
  request_payload jsonb null,
  prompt_sections jsonb null,
  context_payload jsonb null,
  rendered_dump_text text null,
  system_prompt_sha256 text not null,
  messages_sha256 text not null,
  tools_sha256 text null,
  system_prompt_chars integer not null,
  message_chars integer not null,
  approx_prompt_tokens integer null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_prompt_snapshots_session_created
  on public.chat_prompt_snapshots(session_id, created_at desc);
create index if not exists idx_chat_prompt_snapshots_user_created
  on public.chat_prompt_snapshots(user_id, created_at desc);

create table if not exists public.chat_turn_events (
  id uuid primary key default gen_random_uuid(),
  turn_run_id uuid not null references public.chat_turn_runs(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  stream_run_id text not null,
  sequence_index integer not null,
  phase text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint uq_chat_turn_events_sequence unique (turn_run_id, sequence_index),
  constraint chk_chat_turn_events_sequence check (sequence_index >= 1)
);

create index if not exists idx_chat_turn_events_run_sequence
  on public.chat_turn_events(turn_run_id, sequence_index);
create index if not exists idx_chat_turn_events_stream_created
  on public.chat_turn_events(stream_run_id, created_at desc);
create index if not exists idx_chat_turn_events_type_created
  on public.chat_turn_events(event_type, created_at desc);

alter table public.chat_tool_executions
  add column if not exists turn_run_id uuid null references public.chat_turn_runs(id) on delete set null,
  add column if not exists stream_run_id text null,
  add column if not exists client_turn_id text null,
  add column if not exists gateway_op text null,
  add column if not exists help_path text null,
  add column if not exists sequence_index integer null;

create index if not exists idx_chat_tool_executions_turn_run_id
  on public.chat_tool_executions(turn_run_id);
create index if not exists idx_chat_tool_executions_stream_run_id
  on public.chat_tool_executions(stream_run_id);

alter table public.timing_metrics
  add column if not exists turn_run_id uuid null references public.chat_turn_runs(id) on delete set null;

create index if not exists idx_timing_metrics_turn_run_id
  on public.timing_metrics(turn_run_id);

alter table public.chat_turn_runs enable row level security;
alter table public.chat_prompt_snapshots enable row level security;
alter table public.chat_turn_events enable row level security;

drop policy if exists "chat_turn_runs_user_insert" on public.chat_turn_runs;
create policy "chat_turn_runs_user_insert"
  on public.chat_turn_runs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "chat_turn_runs_user_update" on public.chat_turn_runs;
create policy "chat_turn_runs_user_update"
  on public.chat_turn_runs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chat_turn_runs_admin_select" on public.chat_turn_runs;
create policy "chat_turn_runs_admin_select"
  on public.chat_turn_runs
  for select
  to authenticated
  using (is_admin());

drop policy if exists "chat_turn_runs_service_role" on public.chat_turn_runs;
create policy "chat_turn_runs_service_role"
  on public.chat_turn_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "chat_prompt_snapshots_user_insert" on public.chat_prompt_snapshots;
create policy "chat_prompt_snapshots_user_insert"
  on public.chat_prompt_snapshots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "chat_prompt_snapshots_admin_select" on public.chat_prompt_snapshots;
create policy "chat_prompt_snapshots_admin_select"
  on public.chat_prompt_snapshots
  for select
  to authenticated
  using (is_admin());

drop policy if exists "chat_prompt_snapshots_service_role" on public.chat_prompt_snapshots;
create policy "chat_prompt_snapshots_service_role"
  on public.chat_prompt_snapshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "chat_turn_events_user_insert" on public.chat_turn_events;
create policy "chat_turn_events_user_insert"
  on public.chat_turn_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "chat_turn_events_admin_select" on public.chat_turn_events;
create policy "chat_turn_events_admin_select"
  on public.chat_turn_events
  for select
  to authenticated
  using (is_admin());

drop policy if exists "chat_turn_events_service_role" on public.chat_turn_events;
create policy "chat_turn_events_service_role"
  on public.chat_turn_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
