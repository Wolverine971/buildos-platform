-- supabase/migrations/20260428000013_add_agent_call_tool_executions.sql
create table if not exists public.agent_call_tool_executions (
	id uuid primary key default gen_random_uuid(),
	agent_call_session_id uuid not null references public.agent_call_sessions(id) on delete cascade,
	external_agent_caller_id uuid not null references public.external_agent_callers(id) on delete cascade,
	user_id uuid not null,
	op text not null,
	idempotency_key text null,
	status text not null check (status in ('pending', 'succeeded', 'failed')),
	args jsonb not null default '{}'::jsonb,
	response_payload jsonb null,
	error_payload jsonb null,
	entity_kind text null,
	entity_id uuid null,
	started_at timestamptz not null default now(),
	completed_at timestamptz null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists agent_call_tool_executions_call_idx
	on public.agent_call_tool_executions(agent_call_session_id, created_at desc);

create index if not exists agent_call_tool_executions_caller_idx
	on public.agent_call_tool_executions(external_agent_caller_id, created_at desc);

create unique index if not exists agent_call_tool_executions_active_idempotency_idx
	on public.agent_call_tool_executions(external_agent_caller_id, op, idempotency_key)
	where idempotency_key is not null and status in ('pending', 'succeeded');
