-- supabase/migrations/20260617000000_search_tool_telemetry.sql
-- Agentic chat search telemetry.
-- The agent's search tools were only observable via the opaque `result` JSON blob,
-- whose shape differs per tool (results/tasks/projects/documents/...). That made the
-- single most important search-quality signal — "what fraction of searches return
-- nothing?" — impossible to query cheaply, and a zero-result search caused by a
-- brittle matcher looked identical to a legitimately empty one.
--
-- These two columns surface search outcomes as first-class, queryable fields. They are
-- populated only for search tools (NULL for every other tool execution) so analytics
-- can filter on `result_count IS NOT NULL` to isolate searches.

alter table chat_tool_executions
  add column if not exists result_count integer,
  add column if not exists zero_result boolean;

comment on column chat_tool_executions.result_count is
  'Number of rows a search tool returned (NULL for non-search tools). Populated by ChatToolExecutor from the tool result; lets analytics measure result counts without parsing the per-tool result blob.';

comment on column chat_tool_executions.zero_result is
  'True when a search tool returned zero rows (NULL for non-search tools). The primary search-failure signal — a high zero-result rate for a query pattern means search is not serving the agent.';

-- Partial index over search executions only. Keeps the index small and makes
-- zero-result-rate / per-tool aggregation queries fast.
create index if not exists idx_chat_tool_executions_search_telemetry
  on chat_tool_executions (tool_name, zero_result, created_at)
  where result_count is not null;
