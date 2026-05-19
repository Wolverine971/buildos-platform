-- supabase/migrations/20260519000000_add_domain_research_queue.sql
-- First-class BuildOS queue for domain, work capability, skill, micro-skill,
-- and resource research. Chat turns write demand signals into session metadata;
-- admins or scheduled jobs promote repeated demand into this bounded queue.

begin;

create table if not exists public.domain_research_queue (
	id uuid primary key default gen_random_uuid(),
	queue_key text not null unique,
	kind text not null check (
		kind in ('domain', 'work_capability', 'skill', 'micro_skill', 'resource')
	),
	status text not null default 'queued' check (
		status in (
			'queued',
			'researching',
			'draft_ready',
			'reviewing',
			'approved',
			'rejected',
			'archived'
		)
	),
	priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
	domain_ids text[] not null default '{}',
	work_capability_id text,
	parent_skill_id text,
	missing_skill_id text,
	missing_resource_id text,
	user_need text not null,
	summary text not null,
	evidence jsonb not null default '[]'::jsonb,
	source_session_ids uuid[] not null default '{}',
	source_user_count integer not null default 0 check (source_user_count >= 0),
	occurrences integer not null default 1 check (occurrences > 0),
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	claimed_at timestamptz,
	claimed_by text,
	completed_at timestamptz,
	budget jsonb not null default '{}'::jsonb,
	result jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	constraint domain_research_queue_evidence_array
		check (jsonb_typeof(evidence) = 'array'),
	constraint domain_research_queue_budget_object
		check (jsonb_typeof(budget) = 'object'),
	constraint domain_research_queue_result_object
		check (result is null or jsonb_typeof(result) = 'object'),
	constraint domain_research_queue_skill_target
		check (kind <> 'skill' or missing_skill_id is not null),
	constraint domain_research_queue_resource_target
		check (kind <> 'resource' or missing_resource_id is not null),
	constraint domain_research_queue_work_capability_target
		check (kind <> 'work_capability' or work_capability_id is not null)
);

create index if not exists idx_domain_research_queue_status_priority_seen
	on public.domain_research_queue(status, priority, last_seen_at desc);

create index if not exists idx_domain_research_queue_domain_ids
	on public.domain_research_queue using gin(domain_ids);

create index if not exists idx_domain_research_queue_work_capability
	on public.domain_research_queue(work_capability_id)
	where work_capability_id is not null;

create index if not exists idx_domain_research_queue_missing_skill
	on public.domain_research_queue(missing_skill_id)
	where missing_skill_id is not null;

create index if not exists idx_domain_research_queue_missing_resource
	on public.domain_research_queue(missing_resource_id)
	where missing_resource_id is not null;

create index if not exists idx_domain_research_queue_claimed
	on public.domain_research_queue(status, claimed_at)
	where claimed_at is not null;

drop trigger if exists trg_domain_research_queue_updated_at
	on public.domain_research_queue;

create trigger trg_domain_research_queue_updated_at
	before update on public.domain_research_queue
	for each row
	execute function public.set_updated_at();

alter table public.domain_research_queue enable row level security;

drop policy if exists "domain_research_queue_admin_select" on public.domain_research_queue;
create policy "domain_research_queue_admin_select"
	on public.domain_research_queue
	for select
	to authenticated
	using (is_admin());

drop policy if exists "domain_research_queue_admin_insert" on public.domain_research_queue;
create policy "domain_research_queue_admin_insert"
	on public.domain_research_queue
	for insert
	to authenticated
	with check (is_admin());

drop policy if exists "domain_research_queue_admin_update" on public.domain_research_queue;
create policy "domain_research_queue_admin_update"
	on public.domain_research_queue
	for update
	to authenticated
	using (is_admin())
	with check (is_admin());

drop policy if exists "domain_research_queue_service_role" on public.domain_research_queue;
create policy "domain_research_queue_service_role"
	on public.domain_research_queue
	for all
	using (auth.role() = 'service_role')
	with check (auth.role() = 'service_role');

comment on table public.domain_research_queue is
	'BuildOS-owned asynchronous research queue for domain, work capability, skill, micro-skill, and resource coverage gaps.';

comment on column public.domain_research_queue.queue_key is
	'Stable idempotency key for repeated demand signals, such as skill:youtube_channel_diagnostics.';

comment on column public.domain_research_queue.evidence is
	'Bounded provenance records explaining where the research demand came from.';

comment on column public.domain_research_queue.budget is
	'Required source, token, depth, and wall-clock budget for any later research worker.';

commit;
