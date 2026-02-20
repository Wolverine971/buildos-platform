-- supabase/migrations/20260426000002_add_onto_task_assignees.sql
-- Adds first-class task assignment storage aligned with project membership RLS.

create table if not exists public.onto_task_assignees (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.onto_projects(id) on delete cascade,
	task_id uuid not null references public.onto_tasks(id) on delete cascade,
	assignee_actor_id uuid not null references public.onto_actors(id) on delete cascade,
	assigned_by_actor_id uuid not null references public.onto_actors(id) on delete restrict,
	source text not null default 'manual',
	created_at timestamptz not null default now(),
	constraint onto_task_assignees_unique_task_actor unique (task_id, assignee_actor_id),
	constraint onto_task_assignees_source_check check (source in ('manual', 'agent', 'import'))
);

create index if not exists idx_onto_task_assignees_task
	on public.onto_task_assignees(task_id);

create index if not exists idx_onto_task_assignees_assignee
	on public.onto_task_assignees(assignee_actor_id, created_at desc);

create index if not exists idx_onto_task_assignees_project_assignee
	on public.onto_task_assignees(project_id, assignee_actor_id);

alter table public.onto_task_assignees enable row level security;

drop policy if exists task_assignees_select_member on public.onto_task_assignees;
create policy "task_assignees_select_member"
	on public.onto_task_assignees for select
	using (current_actor_has_project_access(project_id, 'read'));

drop policy if exists task_assignees_insert_member on public.onto_task_assignees;
create policy "task_assignees_insert_member"
	on public.onto_task_assignees for insert
	with check (
		current_actor_has_project_access(project_id, 'write')
		and assigned_by_actor_id = current_actor_id()
	);

drop policy if exists task_assignees_delete_member on public.onto_task_assignees;
create policy "task_assignees_delete_member"
	on public.onto_task_assignees for delete
	using (current_actor_has_project_access(project_id, 'write'));

drop policy if exists task_assignees_service_role on public.onto_task_assignees;
create policy "task_assignees_service_role"
	on public.onto_task_assignees for all
	using (auth.role() = 'service_role')
	with check (auth.role() = 'service_role');

