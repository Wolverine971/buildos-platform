-- supabase/migrations/20260804035100_chat_tool_execution_provider_call_identity.sql
-- Legacy SSE and worker telemetry share the provider/orchestrator tool-call ID
-- as their durable identity. sequence_index remains useful for display
-- ordering, but it must not be used to correlate incremental and final rows:
-- partial persistence and callback ordering can change ordinals without
-- changing the logical tool call.
--
-- The worker ledger and legacy SSE use this same identity and index. The
-- non-partial index intentionally retains standard PostgreSQL NULL behavior
-- (legacy NULL rows do not conflict) while allowing PostgREST to infer the
-- conflict target used by legacy SSE.

alter table public.chat_tool_executions
  add column if not exists provider_tool_call_id text;

comment on column public.chat_tool_executions.provider_tool_call_id is
  'Stable provider/orchestrator tool-call ID. Used with turn_run_id to correlate incremental crash-recovery telemetry with end-of-turn persistence; sequence_index is ordering only.';

alter table public.chat_tool_executions
  add constraint chk_chat_tool_executions_provider_call_id
  check (
    provider_tool_call_id is null
    or (
      provider_tool_call_id = btrim(provider_tool_call_id)
      and provider_tool_call_id <> ''
      and length(provider_tool_call_id) <= 512
    )
  );

create unique index if not exists uq_chat_tool_executions_turn_provider_call
  on public.chat_tool_executions (turn_run_id, provider_tool_call_id);
