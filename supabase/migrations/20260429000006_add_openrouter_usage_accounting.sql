-- supabase/migrations/20260429000006_add_openrouter_usage_accounting.sql
-- Track OpenRouter-native accounting fields alongside BuildOS request attribution.

alter table public.llm_usage_logs
  add column if not exists reasoning_tokens integer not null default 0,
  add column if not exists cached_prompt_tokens integer not null default 0,
  add column if not exists cache_write_tokens integer not null default 0,
  add column if not exists openrouter_usage_cost_usd numeric(12, 8) null,
  add column if not exists openrouter_byok boolean null,
  add column if not exists openrouter_upstream_inference_cost_usd numeric(12, 8) null;

create index if not exists idx_llm_usage_logs_openrouter_request_id
  on public.llm_usage_logs(openrouter_request_id)
  where openrouter_request_id is not null;

create index if not exists idx_llm_usage_logs_reasoning_created
  on public.llm_usage_logs(created_at desc)
  where reasoning_tokens > 0;
