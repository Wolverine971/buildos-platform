-- supabase/migrations/20260804030000_phase2_retire_decisions_notes_braindumps.sql
-- Phase 2: retire deprecated decisions, legacy notes, and legacy brain dumps.
--
-- External archive verified 2026-08-04:
-- package: retired-schema-2026-08-04T15-24-36-082Z
-- onto_decisions: 87 / 81c2c295c7be6642c0c427cfa30ed913aef3b48ecfda343c2b3bb9173ade2c25
-- onto_decision_edges: 110 / 130269f04faf2de436dd8e14fb9b9176ab2933a078a655841cb89206ee494dc0
-- notes: 136 / e9ee3bdd42db08f98fd6c56d9dc64fd2cd146842d87a0123719e940da9184e3a
-- brain_dumps: 520 / 5f6a1dfd6b0eba8880e9b417ae17e5777488a658c466bf030492d098d8611cf0
-- brain_dump_links: 494 / 0b38579aa1e7a4c3bd82909f43c7a5b5399644b6b866916a205102bf6c7a1386

begin;

create schema if not exists private;

create table if not exists private.schema_retirement_archives (
	dataset text primary key,
	archive_package text not null,
	row_count bigint not null check (row_count >= 0),
	sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
	verified_at timestamptz not null default now()
);

revoke all on table private.schema_retirement_archives from public, anon, authenticated;
grant all on table private.schema_retirement_archives to service_role;

insert into private.schema_retirement_archives (dataset, archive_package, row_count, sha256)
values
	('onto_decisions', 'retired-schema-2026-08-04T15-24-36-082Z', 87, '81c2c295c7be6642c0c427cfa30ed913aef3b48ecfda343c2b3bb9173ade2c25'),
	('onto_decision_edges', 'retired-schema-2026-08-04T15-24-36-082Z', 110, '130269f04faf2de436dd8e14fb9b9176ab2933a078a655841cb89206ee494dc0'),
	('notes', 'retired-schema-2026-08-04T15-24-36-082Z', 136, 'e9ee3bdd42db08f98fd6c56d9dc64fd2cd146842d87a0123719e940da9184e3a'),
	('brain_dumps', 'retired-schema-2026-08-04T15-24-36-082Z', 520, '5f6a1dfd6b0eba8880e9b417ae17e5777488a658c466bf030492d098d8611cf0'),
	('brain_dump_links', 'retired-schema-2026-08-04T15-24-36-082Z', 494, '0b38579aa1e7a4c3bd82909f43c7a5b5399644b6b866916a205102bf6c7a1386')
on conflict (dataset) do update
set archive_package = excluded.archive_package,
	row_count = excluded.row_count,
	sha256 = excluded.sha256,
	verified_at = now();

do $block$
declare
	v_live_count bigint;
	v_decision_edge_count bigint;
	v_deleted_edge_count bigint;
begin
	if to_regclass('public.onto_decisions') is not null then
		execute 'lock table public.onto_decisions in access exclusive mode';
		execute 'select count(*) from public.onto_decisions' into v_live_count;
		if v_live_count <> 87 then
			raise exception 'Refusing to retire onto_decisions: archive has 87 rows, table has %', v_live_count
				using errcode = '40001';
		end if;

		execute 'lock table public.onto_edges in access exclusive mode';
		select count(*)
		into v_decision_edge_count
		from public.onto_edges e
		where e.src_kind = 'decision'
			or e.dst_kind = 'decision'
			or exists (
				select 1
				from public.onto_decisions d
				where d.id = e.src_id or d.id = e.dst_id
			);

		if v_decision_edge_count <> 110 then
			raise exception 'Refusing to retire onto_decisions: archive has 110 decision edges, table has %', v_decision_edge_count
				using errcode = '40001';
		end if;
	end if;

	if to_regclass('public.notes') is not null then
		execute 'lock table public.notes in access exclusive mode';
		execute 'select count(*) from public.notes' into v_live_count;
		if v_live_count <> 136 then
			raise exception 'Refusing to retire notes: archive has 136 rows, table has %', v_live_count
				using errcode = '40001';
		end if;
	end if;

	if to_regclass('public.brain_dumps') is not null then
		execute 'lock table public.brain_dumps in access exclusive mode';
		execute 'select count(*) from public.brain_dumps' into v_live_count;
		if v_live_count <> 520 then
			raise exception 'Refusing to retire brain_dumps: archive has 520 rows, table has %', v_live_count
				using errcode = '40001';
		end if;
	end if;

	if to_regclass('public.brain_dump_links') is not null then
		execute 'lock table public.brain_dump_links in access exclusive mode';
		execute 'select count(*) from public.brain_dump_links' into v_live_count;
		if v_live_count <> 494 then
			raise exception 'Refusing to retire brain_dump_links: archive has 494 rows, table has %', v_live_count
				using errcode = '40001';
		end if;

		-- The link table is the only relational dependency between legacy notes,
		-- brain dumps, projects, and tasks. Remove it before the parent tables.
		execute 'drop table public.brain_dump_links';
	end if;

	if to_regclass('public.onto_decisions') is not null then
		delete from public.onto_edges e
		where e.src_kind = 'decision'
			or e.dst_kind = 'decision'
			or exists (
				select 1
				from public.onto_decisions d
				where d.id = e.src_id or d.id = e.dst_id
			);
		get diagnostics v_deleted_edge_count = row_count;
		if v_deleted_edge_count <> 110 then
			raise exception 'Decision edge delete removed %, expected 110', v_deleted_edge_count
				using errcode = '40001';
		end if;

		execute 'drop table public.onto_decisions';
	end if;

	-- These UUIDs remain useful as archive correlation identifiers. The six
	-- error-log values and two answered-question values intentionally stay in
	-- place after their retired parent table is removed.
	alter table public.error_logs
		drop constraint if exists error_logs_brain_dump_id_fkey;
	alter table public.llm_usage_logs
		drop constraint if exists llm_usage_logs_brain_dump_id_fkey;
	alter table public.project_questions
		drop constraint if exists project_questions_answer_brain_dump_id_fkey;

	comment on column public.error_logs.brain_dump_id is
		'Historical legacy brain dump UUID. The referenced rows were externally archived in Phase 2.';
	comment on column public.llm_usage_logs.brain_dump_id is
		'Historical legacy brain dump UUID. New ontology brain dump usage is not constrained through this column.';
	comment on column public.project_questions.answer_brain_dump_id is
		'Historical legacy brain dump UUID retained for archive correlation only.';

	if to_regclass('public.notes') is not null then
		execute 'drop table public.notes';
	end if;
	if to_regclass('public.brain_dumps') is not null then
		execute 'drop table public.brain_dumps';
	end if;
end;
$block$;

drop type if exists public.brain_dump_status;

commit;
