-- supabase/tests/fixtures/agentic_chat_materialized_context_cache_base.sql
create role anon;
create role authenticated;
create role service_role;

create schema auth;
create schema private;

create function auth.uid()
returns uuid
language sql
stable
as $$
	select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.jwt()
returns jsonb
language sql
stable
as $$
	select coalesce(
		nullif(current_setting('request.jwt.claims', true), '')::jsonb,
		'{}'::jsonb
	)
$$;

create table public.users (
	id uuid primary key,
	name text,
	email text
);

create table public.onto_actors (
	id uuid primary key,
	user_id uuid references public.users(id) on delete cascade,
	name text
);

create table public.onto_projects (
	id uuid primary key,
	created_by uuid not null references public.onto_actors(id),
	name text not null,
	deleted_at timestamptz
);

create table public.onto_project_members (
	id uuid primary key,
	project_id uuid not null references public.onto_projects(id) on delete cascade,
	actor_id uuid not null references public.onto_actors(id) on delete cascade,
	access text not null default 'read',
	removed_at timestamptz
);

do $$
declare
	v_table text;
begin
	foreach v_table in array array[
		'onto_goals',
		'onto_milestones',
		'onto_plans',
		'onto_tasks',
		'onto_documents',
		'onto_events',
		'onto_project_logs',
		'onto_edges',
		'onto_risks',
		'onto_requirements'
	]
	loop
		execute format(
			'create table public.%I (id uuid primary key, project_id uuid not null references public.onto_projects(id) on delete cascade, name text, updated_at timestamptz not null default now())',
			v_table
		);
	end loop;
end;
$$;

create table public.agentic_chat_prepared_prompts (
	id uuid primary key,
	user_id uuid not null references public.users(id) on delete cascade,
	context_type text not null,
	project_id uuid,
	consumed_at timestamptz,
	expires_at timestamptz not null,
	created_at timestamptz not null default now()
);

create table public.chat_prompt_snapshots (
	id uuid primary key,
	rendered_dump_text text,
	created_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

create function public.cleanup_expired_agentic_chat_prepared_prompts()
returns integer
language plpgsql
as $$
declare
	v_deleted integer;
begin
	delete from public.agentic_chat_prepared_prompts
	where expires_at < now() - interval '10 minutes';
	get diagnostics v_deleted = row_count;
	return v_deleted;
end;
$$;

create function public.actor_has_project_member_access(
	p_actor_id uuid,
	p_project_id uuid,
	p_required_access text default 'read'
)
returns boolean
language sql
stable
as $$
	select exists (
		select 1
		from public.onto_projects projects
		where projects.id = p_project_id
			and projects.deleted_at is null
			and (
				projects.created_by = p_actor_id
				or exists (
					select 1
					from public.onto_project_members members
					where members.project_id = projects.id
						and members.actor_id = p_actor_id
						and members.removed_at is null
				)
			)
	)
$$;

create function public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text default 'read'
)
returns boolean
language sql
stable
as $$
	select public.actor_has_project_member_access(
		(
			select actors.id
			from public.onto_actors actors
			where actors.user_id = auth.uid()
			limit 1
		),
		p_project_id,
		p_required_access
	)
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on function public.actor_has_project_member_access(uuid, uuid, text)
	to service_role;
grant execute on function public.current_actor_has_project_member_access(uuid, text)
	to authenticated, service_role;

