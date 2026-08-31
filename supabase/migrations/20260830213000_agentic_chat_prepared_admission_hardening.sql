-- supabase/migrations/20260830213000_agentic_chat_prepared_admission_hardening.sql
-- Prepared-admission lease hardening (tasker/75 audit follow-up).
--
-- 1. Explicit history cutoff: prepared rows now record when their history
--    snapshot was loaded. The old guards compared against the row's own
--    created_at, which is later than the history load, so a message persisted
--    during prompt assembly could silently escape both the inspection RPC and
--    the artifact-insert trigger. Both guards now use
--    coalesce(history_cutoff_at, created_at), keeping older rows valid.
--    (Residual: sub-clock-skew commit-visibility races remain and still fail
--    closed only at the serialized admission boundary.)
--
-- 2. Statement-level invalidation triggers: the per-row triggers ran the full
--    invalidation (version-row upsert with its row lock, snapshot/prepared
--    deletes, and a per-member global fan-out) once per modified row, so a
--    bulk write amplified O(rows x members) and two concurrent multi-row
--    writers on one project could deadlock through the shared version row.
--    Statement-level triggers with transition tables invalidate each distinct
--    project exactly once per statement.
--
-- Known non-coverage (intentional): users.timezone feeds the context payload
-- but has no invalidation trigger; staleness is bounded by the snapshot TTL
-- (default 15 minutes) and the 90-second prepared-prompt TTL.

alter table public.agentic_chat_prepared_prompts
	add column if not exists history_cutoff_at timestamptz;

comment on column public.agentic_chat_prepared_prompts.history_cutoff_at is
	'Moment the history snapshot was loaded. History-currency guards compare message created_at against coalesce(history_cutoff_at, created_at).';

create or replace function public.inspect_agentic_chat_prepared_admission(
	p_user_id uuid,
	p_prepared_prompt_id uuid,
	p_nonce_sha256 text,
	p_session_id uuid,
	p_context_type text,
	p_entity_id uuid default null,
	p_project_id uuid default null,
	p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
	v_request_role text;
	v_prepared public.agentic_chat_prepared_prompts%rowtype;
	v_session public.chat_sessions%rowtype;
	v_actor_id uuid;
	v_actual_context_token text;
begin
	v_request_role := coalesce(
		nullif(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	if v_request_role <> 'service_role' then
		raise exception 'agentic_chat_prepared_admission_service_role_required'
			using errcode = '42501';
	end if;

	if p_user_id is null
		or p_prepared_prompt_id is null
		or p_session_id is null
		or p_context_type not in ('global', 'project', 'ontology')
		or p_nonce_sha256 is null
		or p_nonce_sha256 !~ '^[0-9a-f]{64}$'
		or p_now is null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'invalid_request');
	end if;

	select prepared.*
	into v_prepared
	from public.agentic_chat_prepared_prompts prepared
	where prepared.id = p_prepared_prompt_id;
	if not found then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'not_found');
	end if;

	if v_prepared.nonce_sha256 is distinct from p_nonce_sha256 then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'nonce_mismatch');
	end if;
	if v_prepared.consumed_at is not null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'consumed');
	end if;
	if v_prepared.expires_at <= p_now then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'expired');
	end if;
	if v_prepared.user_id is distinct from p_user_id
		or v_prepared.session_id is distinct from p_session_id
		or v_prepared.context_type is distinct from p_context_type
		or v_prepared.entity_id is distinct from p_entity_id
		or v_prepared.project_id is distinct from p_project_id then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'scope_mismatch');
	end if;

	select sessions.*
	into v_session
	from public.chat_sessions sessions
	where sessions.id = p_session_id
		and sessions.user_id = p_user_id;
	if not found
		or v_session.context_type is distinct from p_context_type
		or v_session.entity_id is distinct from p_entity_id then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'session_mismatch');
	end if;

	select actors.id
	into v_actor_id
	from public.onto_actors actors
	where actors.user_id = p_user_id
	limit 1;
	if v_actor_id is null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'access_revoked');
	end if;
	if p_context_type in ('project', 'ontology') and (
		p_project_id is null
		or not public.actor_has_project_member_access(v_actor_id, p_project_id, 'read')
	) then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'access_revoked');
	end if;

	if v_prepared.context_invalidation_token is null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'missing_context_generation');
	end if;
	v_actual_context_token := public.get_agentic_chat_context_invalidation_token(
		p_context_type,
		p_user_id,
		p_project_id
	);
	if v_actual_context_token is null
		or v_actual_context_token is distinct from v_prepared.context_invalidation_token then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'stale_context');
	end if;

	-- history_cutoff_at is when the history snapshot was loaded; the row's own
	-- created_at is later, so it alone would miss messages persisted during
	-- prompt assembly.
	if exists (
		select 1
		from public.chat_messages messages
		where messages.session_id = p_session_id
			and messages.user_id = p_user_id
			and messages.created_at
				> coalesce(v_prepared.history_cutoff_at, v_prepared.created_at)
	) then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'stale_history');
	end if;

	-- The normal checkpoint path performs lifecycle recovery before freezing a
	-- resume snapshot. Keep that path authoritative whenever any active/resuming
	-- checkpoint could require recovery or message augmentation.
	if exists (
		select 1
		from public.chat_turn_checkpoints checkpoints
		where checkpoints.session_id = p_session_id
			and checkpoints.user_id = p_user_id
			and checkpoints.status in ('active', 'resuming')
	) then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'checkpoint_required');
	end if;

	return jsonb_build_object(
		'outcome', 'hit',
		'prepared_prompt', to_jsonb(v_prepared),
		'session', to_jsonb(v_session),
		'validated_at', p_now
	);
end;
$function$;

create or replace function public.validate_agentic_chat_prepared_history_currency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_history_cutoff_at timestamptz;
begin
	if new.history_source <> 'prepared_prompt' then
		return new;
	end if;

	if new.source_prepared_prompt_id is null then
		raise exception 'agentic_chat_input_prepared_history_lineage_missing';
	end if;

	select coalesce(prepared.history_cutoff_at, prepared.created_at)
	into v_history_cutoff_at
	from public.agentic_chat_prepared_prompts as prepared
	where prepared.id = new.source_prepared_prompt_id
		and prepared.session_id = new.session_id
		and prepared.user_id = new.user_id;

	if not found then
		raise exception 'agentic_chat_input_prepared_history_scope_mismatch';
	end if;

	if exists (
		select 1
		from public.chat_messages as message
		where message.session_id = new.session_id
			and message.user_id = new.user_id
			and message.created_at > v_history_cutoff_at
	) then
		raise exception 'agentic_chat_input_prepared_history_stale';
	end if;

	return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Statement-level context invalidation.
-- ---------------------------------------------------------------------------

create or replace function private.invalidate_agentic_chat_global_context_for_actor(
	p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_user_id uuid;
begin
	if p_actor_id is null then
		return;
	end if;
	select actors.user_id
	into v_user_id
	from public.onto_actors actors
	where actors.id = p_actor_id;
	perform private.invalidate_agentic_chat_global_context(v_user_id);
end;
$$;

revoke all on function private.invalidate_agentic_chat_global_context_for_actor(uuid)
	from public, anon, authenticated;

-- Shape: tables that carry a plain project_id column.
create or replace function private.trigger_agentic_chat_project_scope_stmt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_project_id uuid;
begin
	if tg_op = 'INSERT' then
		for v_project_id in
			select distinct rows.project_id from new_rows rows
			where rows.project_id is not null
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
	elsif tg_op = 'DELETE' then
		for v_project_id in
			select distinct rows.project_id from old_rows rows
			where rows.project_id is not null
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
	else
		for v_project_id in
			select rows.project_id from old_rows rows where rows.project_id is not null
			union
			select rows.project_id from new_rows rows where rows.project_id is not null
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
	end if;
	return null;
end;
$$;

-- Shape: onto_projects (project id = id, owner actor = created_by). The
-- created_by arm stays because hard deletes and ownership transfers remove
-- the relationship before the shared invalidator can scan it.
create or replace function private.trigger_agentic_chat_projects_stmt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_project_id uuid;
	v_actor_id uuid;
begin
	if tg_op = 'INSERT' then
		for v_project_id in select distinct rows.id from new_rows rows loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
		for v_actor_id in
			select distinct rows.created_by from new_rows rows
			where rows.created_by is not null
		loop
			perform private.invalidate_agentic_chat_global_context_for_actor(v_actor_id);
		end loop;
	elsif tg_op = 'DELETE' then
		for v_project_id in select distinct rows.id from old_rows rows loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
		for v_actor_id in
			select distinct rows.created_by from old_rows rows
			where rows.created_by is not null
		loop
			perform private.invalidate_agentic_chat_global_context_for_actor(v_actor_id);
		end loop;
	else
		for v_project_id in
			select rows.id from old_rows rows
			union
			select rows.id from new_rows rows
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
		for v_actor_id in
			select rows.created_by from old_rows rows where rows.created_by is not null
			union
			select rows.created_by from new_rows rows where rows.created_by is not null
		loop
			perform private.invalidate_agentic_chat_global_context_for_actor(v_actor_id);
		end loop;
	end if;
	return null;
end;
$$;

-- Shape: onto_project_members (project_id + actor_id). The actor arm keeps
-- removed/added members' global context correct even though the shared
-- invalidator only scans current members.
create or replace function private.trigger_agentic_chat_members_stmt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_project_id uuid;
	v_actor_id uuid;
begin
	if tg_op = 'INSERT' then
		for v_project_id in
			select distinct rows.project_id from new_rows rows
			where rows.project_id is not null
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
		for v_actor_id in
			select distinct rows.actor_id from new_rows rows
			where rows.actor_id is not null
		loop
			perform private.invalidate_agentic_chat_global_context_for_actor(v_actor_id);
		end loop;
	elsif tg_op = 'DELETE' then
		for v_project_id in
			select distinct rows.project_id from old_rows rows
			where rows.project_id is not null
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
		for v_actor_id in
			select distinct rows.actor_id from old_rows rows
			where rows.actor_id is not null
		loop
			perform private.invalidate_agentic_chat_global_context_for_actor(v_actor_id);
		end loop;
	else
		for v_project_id in
			select rows.project_id from old_rows rows where rows.project_id is not null
			union
			select rows.project_id from new_rows rows where rows.project_id is not null
		loop
			perform private.invalidate_agentic_chat_project_context(v_project_id);
		end loop;
		for v_actor_id in
			select rows.actor_id from old_rows rows where rows.actor_id is not null
			union
			select rows.actor_id from new_rows rows where rows.actor_id is not null
		loop
			perform private.invalidate_agentic_chat_global_context_for_actor(v_actor_id);
		end loop;
	end if;
	return null;
end;
$$;

revoke all on function private.trigger_agentic_chat_project_scope_stmt()
	from public, anon, authenticated;
revoke all on function private.trigger_agentic_chat_projects_stmt()
	from public, anon, authenticated;
revoke all on function private.trigger_agentic_chat_members_stmt()
	from public, anon, authenticated;

do $$
declare
	v_table_name text;
	v_function_name text;
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
		v_function_name := case v_table_name
			when 'onto_projects' then 'trigger_agentic_chat_projects_stmt'
			when 'onto_project_members' then 'trigger_agentic_chat_members_stmt'
			else 'trigger_agentic_chat_project_scope_stmt'
		end;
		execute format(
			'drop trigger if exists trg_agentic_chat_context_invalidation on public.%I',
			v_table_name
		);
		execute format(
			'drop trigger if exists trg_agentic_chat_context_invalidation_ins on public.%I',
			v_table_name
		);
		execute format(
			'drop trigger if exists trg_agentic_chat_context_invalidation_upd on public.%I',
			v_table_name
		);
		execute format(
			'drop trigger if exists trg_agentic_chat_context_invalidation_del on public.%I',
			v_table_name
		);
		execute format(
			'create trigger trg_agentic_chat_context_invalidation_ins after insert on public.%I referencing new table as new_rows for each statement execute function private.%I()',
			v_table_name,
			v_function_name
		);
		execute format(
			'create trigger trg_agentic_chat_context_invalidation_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function private.%I()',
			v_table_name,
			v_function_name
		);
		execute format(
			'create trigger trg_agentic_chat_context_invalidation_del after delete on public.%I referencing old table as old_rows for each statement execute function private.%I()',
			v_table_name,
			v_function_name
		);
	end loop;
end;
$$;

-- The per-row actor trigger stays: onto_actors is only written at account
-- deletion and rare profile changes, and FK cascades reliably fire row-level
-- triggers.
drop function if exists private.trigger_invalidate_agentic_chat_project_context();
