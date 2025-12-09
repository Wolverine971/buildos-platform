-- supabase/migrations/20251122_legacy_mapping_backfill.sql
-- Migration: Legacy mapping helpers + backfill
-- Description: Adds helper functions/triggers for legacy_entity_mappings, backfills existing ontology entities, and links project_calendars.
-- Author: Codex (Agent)
-- Date: 2025-11-22

-- ============================================================================
-- Helper: upsert legacy mapping
-- ============================================================================

create or replace function upsert_legacy_entity_mapping(
	p_legacy_table text,
	p_legacy_id uuid,
	p_onto_table text,
	p_onto_id uuid,
	p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if p_legacy_id is null or p_onto_id is null then
		return;
	end if;

	insert into legacy_entity_mappings (legacy_table, legacy_id, onto_table, onto_id, metadata, migrated_at)
	values (
		p_legacy_table,
		p_legacy_id,
		p_onto_table,
		p_onto_id,
		coalesce(jsonb_strip_nulls(p_metadata), '{}'::jsonb),
		now()
	)
	on conflict (legacy_table, legacy_id) do update
	set
		onto_table = excluded.onto_table,
		onto_id = excluded.onto_id,
		metadata = jsonb_strip_nulls(coalesce(legacy_entity_mappings.metadata, '{}'::jsonb) || excluded.metadata),
		migrated_at = excluded.migrated_at;
end;
$$;

-- ============================================================================
-- Trigger: sync mapping from ontology props->legacy_id
-- ============================================================================

create or replace function sync_legacy_mapping_from_props()
returns trigger
language plpgsql
as $$
declare
	legacy_text text;
	legacy_id uuid;
	metadata jsonb;
begin
	if TG_ARGV[0] is null or TG_ARGV[1] is null then
		return NEW;
	end if;

	if NEW.props is null then
		return NEW;
	end if;

	legacy_text := nullif(NEW.props->>'legacy_id', '');
	if legacy_text is null then
		return NEW;
	end if;

	begin
		legacy_id := legacy_text::uuid;
	exception
		when invalid_text_representation then
			-- Ignore rows where legacy_id is not a valid UUID
			return NEW;
	end;

	metadata := jsonb_build_object(
		'source', 'trigger',
		'table', TG_TABLE_NAME,
		'operation', TG_OP
	);

	perform upsert_legacy_entity_mapping(TG_ARGV[0], legacy_id, TG_ARGV[1], NEW.id, metadata);

	return NEW;
end;
$$;

drop trigger if exists trg_onto_projects_legacy_mapping on onto_projects;
create trigger trg_onto_projects_legacy_mapping
after insert or update on onto_projects
for each row
execute function sync_legacy_mapping_from_props('projects', 'onto_projects');

drop trigger if exists trg_onto_tasks_legacy_mapping on onto_tasks;
create trigger trg_onto_tasks_legacy_mapping
after insert or update on onto_tasks
for each row
execute function sync_legacy_mapping_from_props('tasks', 'onto_tasks');

-- ============================================================================
-- Backfill existing ontology rows into legacy_entity_mappings
-- ============================================================================

with project_rows as (
	select
		id as onto_id,
		(props->>'legacy_id')::uuid as legacy_id
	from onto_projects
	where props ? 'legacy_id'
		and props->>'legacy_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
insert_projects as (
	insert into legacy_entity_mappings (legacy_table, legacy_id, onto_table, onto_id, metadata, migrated_at)
	select
		'projects',
		legacy_id,
		'onto_projects',
		onto_id,
		jsonb_build_object('source', 'backfill_20251122', 'table', 'onto_projects'),
		now()
	from project_rows
	on conflict (legacy_table, legacy_id) do update
	set
		onto_table = excluded.onto_table,
		onto_id = excluded.onto_id,
		metadata = jsonb_strip_nulls(legacy_entity_mappings.metadata || excluded.metadata),
		migrated_at = excluded.migrated_at
	returning 1
),
task_rows as (
	select
		id as onto_id,
		(props->>'legacy_id')::uuid as legacy_id
	from onto_tasks
	where props ? 'legacy_id'
		and props->>'legacy_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
insert into legacy_entity_mappings (legacy_table, legacy_id, onto_table, onto_id, metadata, migrated_at)
select
	'tasks',
	legacy_id,
	'onto_tasks',
	onto_id,
	jsonb_build_object('source', 'backfill_20251122', 'table', 'onto_tasks'),
	now()
from task_rows
on conflict (legacy_table, legacy_id) do update
set
	onto_table = excluded.onto_table,
	onto_id = excluded.onto_id,
	metadata = jsonb_strip_nulls(legacy_entity_mappings.metadata || excluded.metadata),
	migrated_at = excluded.migrated_at;

-- ============================================================================
-- Populate project_calendars.onto_project_id using mappings
-- ============================================================================

update project_calendars pc
set onto_project_id = lem.onto_id
from legacy_entity_mappings lem
where lem.legacy_table = 'projects'
	and lem.onto_table = 'onto_projects'
	and lem.legacy_id = pc.project_id
	and (pc.onto_project_id is distinct from lem.onto_id);

create index if not exists idx_project_calendars_onto_project
	on project_calendars (onto_project_id)
	where onto_project_id is not null;
