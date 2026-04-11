-- supabase/migrations/20260428000021_add_llm_usage_turn_attribution.sql
-- Link LLM usage rows to first-class FastChat turn observability.

alter table public.llm_usage_logs
  add column if not exists turn_run_id uuid null references public.chat_turn_runs(id) on delete set null,
  add column if not exists stream_run_id text null,
  add column if not exists client_turn_id text null;

create index if not exists idx_llm_usage_logs_turn_run_created
  on public.llm_usage_logs(turn_run_id, created_at desc)
  where turn_run_id is not null;

create index if not exists idx_llm_usage_logs_chat_session_created
  on public.llm_usage_logs(chat_session_id, created_at desc)
  where chat_session_id is not null;

create index if not exists idx_llm_usage_logs_stream_run_created
  on public.llm_usage_logs(stream_run_id, created_at desc)
  where stream_run_id is not null;

create index if not exists idx_llm_usage_logs_client_turn_created
  on public.llm_usage_logs(client_turn_id, created_at desc)
  where client_turn_id is not null;
