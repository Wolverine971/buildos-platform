-- supabase/migrations/20251108_create_agent_template_creation_requests.sql

create table if not exists public.agent_template_creation_requests (
	id uuid primary key default uuid_generate_v4(),
	request_id text not null unique,
	session_id uuid references public.chat_sessions(id) on delete set null,
	user_id uuid references auth.users(id) on delete set null,
	realm text not null,
	status text not null default 'queued',
	braindump text,
	template_hints jsonb,
	deliverables jsonb,
	facets jsonb,
	missing_information jsonb,
	template_summary jsonb,
	result_template_id uuid references public.onto_templates(id) on delete set null,
	error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists agent_template_creation_requests_status_idx
	on public.agent_template_creation_requests (status);

create index if not exists agent_template_creation_requests_user_idx
	on public.agent_template_creation_requests (user_id);

create trigger agent_template_creation_requests_set_updated_at
	before update on public.agent_template_creation_requests
	for each row
	execute function set_updated_at();
