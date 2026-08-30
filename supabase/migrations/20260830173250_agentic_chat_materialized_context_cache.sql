-- supabase/migrations/20260830173250_agentic_chat_materialized_context_cache.sql
-- Durable, scope-aware context snapshots for Agentic Chat prewarm.
--
-- Prepared prompts remain short-lived, session/history-bound, and one-time.
-- This cache holds only the expensive project/global context snapshot and is
-- invalidated transactionally whenever a source ontology row changes.

create schema if not exists private;

create table if not exists private.agentic_chat_project_context_versions (
	project_id uuid primary key references public.onto_projects(id) on delete cascade,
	version bigint not null default 1 check (version > 0),
	changed_at timestamptz not null default now()
);

revoke all on table private.agentic_chat_project_context_versions
	from public, anon, authenticated;
grant all on table private.agentic_chat_project_context_versions to service_role;

insert into private.agentic_chat_project_context_versions (project_id, version, changed_at)
select projects.id, 1, now()
from public.onto_projects projects
on conflict (project_id) do nothing;

create table if not exists public.agentic_chat_context_snapshots (
	user_id uuid not null references public.users(id) on delete cascade,
	cache_key text not null,
	context_type text not null,
	entity_id uuid,
	project_id uuid,
	project_focus jsonb,
	context_cache_version integer not null,
	invalidation_token text not null,
	context_payload jsonb not null,
	context_payload_sha256 text not null,
	expires_at timestamptz not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, cache_key),
	constraint chk_agentic_chat_context_snapshot_cache_key
		check (length(cache_key) between 1 and 500),
	constraint chk_agentic_chat_context_snapshot_token
		check (length(invalidation_token) between 1 and 500),
	constraint chk_agentic_chat_context_snapshot_sha256
		check (context_payload_sha256 ~ '^[0-9a-f]{64}$'),
	constraint chk_agentic_chat_context_snapshot_expiry
		check (expires_at > created_at)
);

create index if not exists idx_agentic_chat_context_snapshots_project
	on public.agentic_chat_context_snapshots(project_id, user_id)
	where project_id is not null;

create index if not exists idx_agentic_chat_context_snapshots_expiry
	on public.agentic_chat_context_snapshots(expires_at);

drop trigger if exists trg_agentic_chat_context_snapshots_updated
	on public.agentic_chat_context_snapshots;
create trigger trg_agentic_chat_context_snapshots_updated
before update on public.agentic_chat_context_snapshots
for each row execute function public.set_updated_at();

alter table public.agentic_chat_context_snapshots enable row level security;
revoke all on table public.agentic_chat_context_snapshots
	from public, anon, authenticated;
grant all on table public.agentic_chat_context_snapshots to service_role;

comment on table public.agentic_chat_context_snapshots is
	'Service-owned materialized project/global Agentic Chat context. Rows are version-checked and never exposed to browser roles.';

alter table public.agentic_chat_prepared_prompts
	add column if not exists context_invalidation_token text;

create or replace function private.invalidate_agentic_chat_global_context(
	p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if p_user_id is null then
		return;
	end if;

	delete from public.agentic_chat_context_snapshots snapshots
	where snapshots.user_id = p_user_id
		and snapshots.context_type = 'global';

	-- Prepared rows are one-time latency artifacts. Deleting only unconsumed
	-- rows makes invalidation atomic without mutating retained turn lineage.
	delete from public.agentic_chat_prepared_prompts prompts
	where prompts.user_id = p_user_id
		and prompts.context_type = 'global'
		and prompts.consumed_at is null;
end;
$$;

create or replace function private.invalidate_agentic_chat_project_context(
	p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_affected_user_id uuid;
begin
	if p_project_id is null then
		return;
	end if;

	insert into private.agentic_chat_project_context_versions (
		project_id,
		version,
		changed_at
	)
	select projects.id, 1, clock_timestamp()
	from public.onto_projects projects
	where projects.id = p_project_id
	on conflict (project_id) do update
	set version = private.agentic_chat_project_context_versions.version + 1,
		changed_at = excluded.changed_at;

	delete from public.agentic_chat_context_snapshots snapshots
	where snapshots.project_id = p_project_id;

	delete from public.agentic_chat_prepared_prompts prompts
	where prompts.project_id = p_project_id
		and prompts.consumed_at is null;

	-- Global context includes every project the actor owns or actively belongs
	-- to, so a project mutation must invalidate every affected user's snapshot.
	for v_affected_user_id in
		select actors.user_id
		from public.onto_projects projects
		join public.onto_actors actors on actors.id = projects.created_by
		where projects.id = p_project_id
			and actors.user_id is not null
		union
		select actors.user_id
		from public.onto_project_members members
		join public.onto_actors actors on actors.id = members.actor_id
		where members.project_id = p_project_id
			and members.removed_at is null
			and actors.user_id is not null
	loop
		perform private.invalidate_agentic_chat_global_context(v_affected_user_id);
	end loop;
end;
$$;

revoke all on function private.invalidate_agentic_chat_global_context(uuid)
	from public, anon, authenticated;
revoke all on function private.invalidate_agentic_chat_project_context(uuid)
	from public, anon, authenticated;

create or replace function private.trigger_invalidate_agentic_chat_project_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
	v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
	v_new_project_id uuid;
	v_old_project_id uuid;
	v_new_actor_id uuid;
	v_old_actor_id uuid;
	v_actor_user_id uuid;
begin
	if tg_table_name = 'onto_projects' then
		v_new_project_id := nullif(v_new->>'id', '')::uuid;
		v_old_project_id := nullif(v_old->>'id', '')::uuid;
		v_new_actor_id := nullif(v_new->>'created_by', '')::uuid;
		v_old_actor_id := nullif(v_old->>'created_by', '')::uuid;
	else
		v_new_project_id := nullif(v_new->>'project_id', '')::uuid;
		v_old_project_id := nullif(v_old->>'project_id', '')::uuid;
		if tg_table_name = 'onto_project_members' then
			v_new_actor_id := nullif(v_new->>'actor_id', '')::uuid;
			v_old_actor_id := nullif(v_old->>'actor_id', '')::uuid;
		end if;
	end if;

	if v_old_project_id is not null then
		perform private.invalidate_agentic_chat_project_context(v_old_project_id);
	end if;
	if v_new_project_id is not null and v_new_project_id is distinct from v_old_project_id then
		perform private.invalidate_agentic_chat_project_context(v_new_project_id);
	end if;

	-- Membership removals, hard project deletes, and ownership transfers can
	-- remove the relationship before the shared invalidator scans it. Resolve
	-- the actor identities carried by OLD/NEW and invalidate those users too.
	if v_old_actor_id is not null then
		select actors.user_id into v_actor_user_id
		from public.onto_actors actors
		where actors.id = v_old_actor_id;
		perform private.invalidate_agentic_chat_global_context(v_actor_user_id);
	end if;
	if v_new_actor_id is not null and v_new_actor_id is distinct from v_old_actor_id then
		select actors.user_id into v_actor_user_id
		from public.onto_actors actors
		where actors.id = v_new_actor_id;
		perform private.invalidate_agentic_chat_global_context(v_actor_user_id);
	end if;

	return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.trigger_invalidate_agentic_chat_project_context()
	from public, anon, authenticated;

create or replace function private.trigger_invalidate_agentic_chat_actor_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
	v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
	v_actor_id uuid := coalesce(
		nullif(v_new->>'id', '')::uuid,
		nullif(v_old->>'id', '')::uuid
	);
	v_project_id uuid;
begin
	for v_project_id in
		select projects.id
		from public.onto_projects projects
		where projects.created_by = v_actor_id
		union
		select members.project_id
		from public.onto_project_members members
		where members.actor_id = v_actor_id
	loop
		perform private.invalidate_agentic_chat_project_context(v_project_id);
	end loop;
	perform private.invalidate_agentic_chat_global_context(
		nullif(v_old->>'user_id', '')::uuid
	);
	perform private.invalidate_agentic_chat_global_context(
		nullif(v_new->>'user_id', '')::uuid
	);
	return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.trigger_invalidate_agentic_chat_actor_context()
	from public, anon, authenticated;

do $$
declare
	v_table_name text;
begin
	foreach v_table_name in array array[
		'onto_projects',
		'onto_goals',
		'onto_milestones',
		'onto_plans',
		'onto_tasks',
		'onto_documents',
		'onto_events',
		'onto_project_members',
		'onto_project_logs',
		'onto_edges',
		'onto_risks',
		'onto_requirements'
	]
	loop
		execute format(
			'drop trigger if exists trg_agentic_chat_context_invalidation on public.%I',
			v_table_name
		);
		execute format(
			'create trigger trg_agentic_chat_context_invalidation after insert or update or delete on public.%I for each row execute function private.trigger_invalidate_agentic_chat_project_context()',
			v_table_name
		);
	end loop;
end;
$$;

drop trigger if exists trg_agentic_chat_actor_context_invalidation on public.onto_actors;
create trigger trg_agentic_chat_actor_context_invalidation
after update or delete on public.onto_actors
for each row execute function private.trigger_invalidate_agentic_chat_actor_context();

create or replace function public.get_agentic_chat_context_invalidation_token(
	p_context_type text,
	p_user_id uuid,
	p_project_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_authenticated_user_id uuid := (select auth.uid());
	v_role text := coalesce((select auth.jwt()->>'role'), '');
	v_user_id uuid;
	v_actor_id uuid;
	v_project_version bigint;
	v_global_digest text;
begin
	if v_authenticated_user_id is not null then
		v_user_id := v_authenticated_user_id;
	elsif v_role = 'service_role' then
		v_user_id := p_user_id;
	else
		return null;
	end if;

	if v_user_id is null then
		return null;
	end if;

	select actors.id
	into v_actor_id
	from public.onto_actors actors
	where actors.user_id = v_user_id
	limit 1;

	if p_context_type = 'global' then
		select md5(
			coalesce(
				string_agg(
					projects.id::text || ':' || coalesce(versions.version, 1)::text,
					',' order by projects.id
				),
				'empty'
			)
		)
		into v_global_digest
		from public.onto_projects projects
		left join private.agentic_chat_project_context_versions versions
			on versions.project_id = projects.id
		where (
				projects.created_by = v_actor_id
				or exists (
					select 1
					from public.onto_project_members members
					where members.project_id = projects.id
						and members.actor_id = v_actor_id
						and members.removed_at is null
				)
			)
			and projects.deleted_at is null;

		return 'global:v1:' || coalesce(v_global_digest, md5('empty'));
	end if;

	if p_context_type in ('project', 'ontology') and p_project_id is not null then
		if v_role = 'service_role'
			and not public.actor_has_project_member_access(v_actor_id, p_project_id, 'read') then
			return null;
		end if;
		if v_role <> 'service_role'
			and not public.current_actor_has_project_member_access(p_project_id, 'read') then
			return null;
		end if;

		select coalesce(versions.version, 1)
		into v_project_version
		from public.onto_projects projects
		left join private.agentic_chat_project_context_versions versions
			on versions.project_id = projects.id
		where projects.id = p_project_id
			and projects.deleted_at is null;

		if v_project_version is null then
			return null;
		end if;
		return 'project:v1:' || p_project_id::text || ':' || v_project_version::text;
	end if;

	return null;
end;
$$;

revoke all on function public.get_agentic_chat_context_invalidation_token(text, uuid, uuid)
	from public, anon;
grant execute on function public.get_agentic_chat_context_invalidation_token(text, uuid, uuid)
	to authenticated, service_role;

comment on function public.get_agentic_chat_context_invalidation_token(text, uuid, uuid) is
	'Returns the authenticated project/global context generation used to validate materialized Agentic Chat context snapshots.';

create or replace function public.cleanup_expired_agentic_chat_context_snapshots()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_deleted integer;
begin
	delete from public.agentic_chat_context_snapshots
	where expires_at < now() - interval '10 minutes';
	get diagnostics v_deleted = row_count;
	return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_agentic_chat_context_snapshots()
	from public, anon, authenticated;
grant execute on function public.cleanup_expired_agentic_chat_context_snapshots()
	to service_role;

create or replace function public.cleanup_agentic_chat_prompt_artifacts(
	p_prompt_snapshot_retention_days integer default 14,
	p_rendered_dump_retention_days integer default 2,
	p_batch_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_prepared_deleted integer := 0;
	v_context_snapshots_deleted integer := 0;
	v_snapshot_deleted integer := 0;
	v_rendered_dump_cleared integer := 0;
	v_snapshot_retention_days integer := greatest(coalesce(p_prompt_snapshot_retention_days, 14), 1);
	v_rendered_dump_retention_days integer := greatest(coalesce(p_rendered_dump_retention_days, 2), 1);
	v_batch_size integer := greatest(least(coalesce(p_batch_size, 1000), 10000), 1);
begin
	v_prepared_deleted := public.cleanup_expired_agentic_chat_prepared_prompts();
	v_context_snapshots_deleted := public.cleanup_expired_agentic_chat_context_snapshots();

	with stale_dumps as (
		select id
		from public.chat_prompt_snapshots
		where rendered_dump_text is not null
			and created_at < now() - make_interval(days => v_rendered_dump_retention_days)
		order by created_at asc
		limit v_batch_size
	)
	update public.chat_prompt_snapshots snapshots
	set rendered_dump_text = null
	where snapshots.id in (select id from stale_dumps);
	get diagnostics v_rendered_dump_cleared = row_count;

	with stale_snapshots as (
		select id
		from public.chat_prompt_snapshots
		where created_at < now() - make_interval(days => v_snapshot_retention_days)
		order by created_at asc
		limit v_batch_size
	)
	delete from public.chat_prompt_snapshots snapshots
	where snapshots.id in (select id from stale_snapshots);
	get diagnostics v_snapshot_deleted = row_count;

	return jsonb_build_object(
		'prepared_prompts_deleted', v_prepared_deleted,
		'context_snapshots_deleted', v_context_snapshots_deleted,
		'prompt_snapshots_deleted', v_snapshot_deleted,
		'rendered_dumps_cleared', v_rendered_dump_cleared,
		'prompt_snapshot_retention_days', v_snapshot_retention_days,
		'rendered_dump_retention_days', v_rendered_dump_retention_days,
		'batch_size', v_batch_size
	);
end;
$$;

revoke all on function public.cleanup_agentic_chat_prompt_artifacts(integer, integer, integer)
	from public, anon, authenticated;
grant execute on function public.cleanup_agentic_chat_prompt_artifacts(integer, integer, integer)
	to service_role;
