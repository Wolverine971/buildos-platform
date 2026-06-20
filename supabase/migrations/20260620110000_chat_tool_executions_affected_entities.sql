-- supabase/migrations/20260620110000_chat_tool_executions_affected_entities.sql
-- Persist user-facing entity refs touched by tool executions.
-- This keeps Steps / Tools / Changes reliable after reload without having to
-- infer every affected entity from tool-specific args/results later.

alter table public.chat_tool_executions
  add column if not exists affected_entities jsonb not null default '[]'::jsonb;

comment on column public.chat_tool_executions.affected_entities is
  'Array of user-facing entity refs affected by this tool execution. Shape: [{kind,id,title?,projectId?,url?,operation?}]. Populated best-effort at tool execution write time and enriched on read.';

