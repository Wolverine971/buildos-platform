-- supabase/migrations/20260730040000_phase1_retired_schema_cleanup.sql
-- Phase 1: remove schema objects that are proven empty and retired.
--
-- Safety properties:
--   * every table in this migration must still be empty at execution time;
--   * DROP statements intentionally omit CASCADE so an unknown dependency aborts;
--   * the expired notification-preferences backup is handled separately after
--     an external, checksummed export records a database receipt.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.phase1_archive_receipts (
	table_name text primary key,
	row_count bigint not null check (row_count >= 0),
	sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
	export_format text not null default 'canonical-jsonl-v1',
	exported_at timestamptz not null default now(),
	recorded_at timestamptz not null default now()
);

revoke all on table private.phase1_archive_receipts from public, anon, authenticated;

create or replace function public.record_phase1_archive_receipt(
	p_table_name text,
	p_row_count bigint,
	p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
	v_actual_count bigint;
begin
	if auth.role() <> 'service_role' then
		raise exception 'service role required' using errcode = '42501';
	end if;

	if p_table_name <> 'user_notification_preferences_backup' then
		raise exception 'table is not approved for Phase 1 archival: %', p_table_name
			using errcode = '22023';
	end if;

	if p_row_count < 0 or p_sha256 !~ '^[0-9a-f]{64}$' then
		raise exception 'invalid archive receipt' using errcode = '22023';
	end if;

	execute format('select count(*) from public.%I', p_table_name)
		into v_actual_count;
	if v_actual_count <> p_row_count then
		raise exception 'archive row count mismatch for %: exported %, live %',
			p_table_name, p_row_count, v_actual_count
			using errcode = '40001';
	end if;

	insert into private.phase1_archive_receipts (
		table_name,
		row_count,
		sha256,
		exported_at,
		recorded_at
	)
	values (p_table_name, p_row_count, lower(p_sha256), now(), now())
	on conflict (table_name) do update
	set row_count = excluded.row_count,
		sha256 = excluded.sha256,
		exported_at = excluded.exported_at,
		recorded_at = excluded.recorded_at;
end;
$function$;

revoke all on function public.record_phase1_archive_receipt(text, bigint, text)
	from public, anon, authenticated;
grant execute on function public.record_phase1_archive_receipt(text, bigint, text)
	to service_role;

-- Repository search, live catalog dependency inspection, and the schema audit
-- all identify these relations as empty and isolated. Abort instead of deleting
-- if any object acquired data after the audit.
do $block$
declare
	v_relation text;
	v_count bigint;
	v_relations text[] := array[
		'api_keys',
		'calendar_themes',
		'chat_sessions_daily_briefs',
		'chat_sessions_tasks',
		'llm_prompts',
		'onto_tools',
		'question_metrics',
		'question_templates',
		'research_artifact_refs',
		'tree_agent_artifacts',
		'tree_agent_events',
		'tree_agent_nodes',
		'tree_agent_plans',
		'tree_agent_runs'
	];
begin
	foreach v_relation in array v_relations loop
		if to_regclass(format('public.%I', v_relation)) is not null then
			execute format('select count(*) from public.%I', v_relation) into v_count;
			if v_count <> 0 then
				raise exception 'Phase 1 refuses to drop public.%: expected 0 rows, found %',
					v_relation, v_count
					using errcode = '55000';
			end if;
		end if;
	end loop;
end;
$block$;

-- The January cleanup used the wrong identity signatures. These are the exact
-- pg_get_function_identity_arguments values observed in the live catalog.
drop function if exists public.cancel_jobs_in_time_window(
	uuid, text, timestamptz, timestamptz, uuid
);
drop function if exists public.get_brief_email_status(text);
drop function if exists public.cancel_scheduled_sms_for_event(text, uuid);
drop function if exists public.get_scheduled_sms_for_user(
	uuid, timestamptz, timestamptz, text
);
drop function if exists public.search_all_similar(vector, double precision);
drop function if exists public.complete_recurring_instance(uuid, date, uuid);
drop function if exists public.create_manual_project_version(uuid, uuid);
drop function if exists public.cleanup_project_history(uuid);

drop view if exists public.task_documents;

drop table if exists public.api_keys;
drop table if exists public.calendar_themes;
drop table if exists public.chat_sessions_daily_briefs;
drop table if exists public.chat_sessions_tasks;
drop table if exists public.llm_prompts;
drop table if exists public.onto_tools;
drop table if exists public.question_metrics;
drop table if exists public.question_templates;
drop table if exists public.research_artifact_refs;

-- Tree Agent is explicitly documented as a retired/orphaned experiment. Its
-- tables were empty at audit time and the runtime implementation was deleted.
-- Remove the cross-schema realtime policy before removing its referenced table.
do $block$
begin
	if to_regclass('realtime.messages') is not null then
		execute 'drop policy if exists tree_agent_realtime_messages_select on realtime.messages';
	end if;
end;
$block$;

alter table if exists public.tree_agent_runs
	drop constraint if exists tree_agent_runs_root_node_fkey;

drop table if exists public.tree_agent_artifacts;
drop table if exists public.tree_agent_events;
drop table if exists public.tree_agent_plans;
drop table if exists public.tree_agent_nodes;
drop table if exists public.tree_agent_runs;

drop function if exists public.tree_agent_assign_event_seq();
drop function if exists public.tree_agent_broadcast_event();

drop type if exists public.tree_agent_scope;
drop type if exists public.tree_agent_artifact_type;
drop type if exists public.tree_agent_role_state;
drop type if exists public.tree_agent_node_status;
drop type if exists public.tree_agent_run_status;

-- PostgreSQL enum values cannot be removed in-place. The retired
-- queue_type.buildos_tree_agent value remains as inert compatibility residue and
-- should disappear only when queue_type is deliberately rebuilt.

commit;
