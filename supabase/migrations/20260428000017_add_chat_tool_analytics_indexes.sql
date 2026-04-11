-- supabase/migrations/20260428000017_add_chat_tool_analytics_indexes.sql
-- Support admin tool analytics filters and timeframe scans.

create index if not exists idx_chat_tool_executions_created_at
  on public.chat_tool_executions(created_at desc);

create index if not exists idx_chat_tool_executions_tool_created
  on public.chat_tool_executions(tool_name, created_at desc);

create index if not exists idx_chat_tool_executions_category_created
  on public.chat_tool_executions(tool_category, created_at desc);

create index if not exists idx_chat_tool_executions_success_created
  on public.chat_tool_executions(success, created_at desc);

create index if not exists idx_chat_tool_executions_gateway_op_created
  on public.chat_tool_executions(gateway_op, created_at desc)
  where gateway_op is not null;

create index if not exists idx_chat_tool_executions_help_path_created
  on public.chat_tool_executions(help_path, created_at desc)
  where help_path is not null;
