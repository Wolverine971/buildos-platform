-- supabase/migrations/20260130_235900_add_timing_metrics.sql
-- Create timing_metrics table for agentic chat latency tracking

create table if not exists timing_metrics (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	user_id uuid not null references users(id) on delete cascade,
	session_id uuid references agent_chat_sessions(id) on delete set null,
	context_type text,
	message_length integer,
	message_received_at timestamptz not null default now(),
	first_event_at timestamptz,
	first_response_at timestamptz,
	time_to_first_event_ms integer,
	time_to_first_response_ms integer,
	context_build_ms integer,
	tool_selection_ms integer,
	clarification_ms integer,
	planner_agent_id uuid references agents(id) on delete set null,
	agent_plan_id uuid references agent_plans(id) on delete set null,
	plan_created_at timestamptz,
	plan_creation_ms integer,
	plan_step_count integer,
	plan_execution_started_at timestamptz,
	plan_completed_at timestamptz,
	plan_execution_ms integer,
	plan_status text,
	metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_timing_metrics_user_created_at
	on timing_metrics(user_id, created_at desc);

create index if not exists idx_timing_metrics_session_created_at
	on timing_metrics(session_id, created_at desc);

create index if not exists idx_timing_metrics_plan
	on timing_metrics(agent_plan_id);

-- Keep updated_at fresh on updates
create trigger trg_timing_metrics_updated_at
before update on timing_metrics
for each row execute function set_updated_at();

comment on table timing_metrics is 'Timing metrics for agentic chat request latency breakdowns';
comment on column timing_metrics.metadata is 'JSON breakdown fields (e.g., stream_run_id, first_chunk_ms, retry_counts)';
