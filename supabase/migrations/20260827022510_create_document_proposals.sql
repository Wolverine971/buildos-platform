-- supabase/migrations/20260827022510_create_document_proposals.sql
-- Step 2 document proposal persistence.
-- The patch payload is immutable after insert; only its review lifecycle can move.

create table public.onto_document_proposals (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.onto_projects(id) on delete cascade,
	document_id uuid not null references public.onto_documents(id) on delete cascade,
	created_by_actor_id uuid not null references public.onto_actors(id) on delete restrict,
	instruction text not null,
	patch jsonb not null,
	patch_hash text not null,
	base_content_hash text not null,
	result_content_hash text not null,
	status text not null default 'pending',
	conflict_reason text,
	applied_at timestamptz,
	applied_by_actor_id uuid references public.onto_actors(id) on delete restrict,
	version_warning text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	constraint onto_document_proposals_instruction_check
		check (char_length(btrim(instruction)) between 1 and 4000),
	constraint onto_document_proposals_patch_object_check
		check (jsonb_typeof(patch) = 'object'),
	constraint onto_document_proposals_patch_schema_check
		check (patch ->> 'schema_version' = '1'),
	constraint onto_document_proposals_patch_scope_check
		check (
			patch ->> 'project_id' = project_id::text
			and patch ->> 'document_id' = document_id::text
		),
	constraint onto_document_proposals_patch_hash_check
		check (
			patch_hash ~ '^[0-9a-f]{64}$'
			and patch ->> 'patch_hash' = patch_hash
		),
	constraint onto_document_proposals_base_hash_check
		check (
			base_content_hash ~ '^[0-9a-f]{64}$'
			and patch ->> 'base_content_hash' = base_content_hash
		),
	constraint onto_document_proposals_result_hash_check
		check (result_content_hash ~ '^[0-9a-f]{64}$'),
	constraint onto_document_proposals_status_check
		check (status in ('pending', 'applied', 'conflict', 'dismissed')),
	constraint onto_document_proposals_conflict_reason_check
		check (
			conflict_reason is null
			or conflict_reason in (
				'BASE_TEXT_CHANGED',
				'ANCHOR_NOT_FOUND',
				'ANCHOR_AMBIGUOUS',
				'OVERLAPPING_OPERATIONS',
				'MANAGED_REGION_BOUNDARY',
				'WRITE_RACE'
			)
		),
	constraint onto_document_proposals_terminal_shape_check
		check (
			(status = 'applied' and applied_at is not null and applied_by_actor_id is not null and conflict_reason is null)
			or (status = 'conflict' and applied_at is null and applied_by_actor_id is null and conflict_reason is not null and version_warning is null)
			or (status in ('pending', 'dismissed') and applied_at is null and applied_by_actor_id is null and conflict_reason is null and version_warning is null)
		)
);

create index onto_document_proposals_document_status_created_idx
	on public.onto_document_proposals(document_id, status, created_at desc);

create index onto_document_proposals_project_created_idx
	on public.onto_document_proposals(project_id, created_at desc);

create or replace function public.enforce_onto_document_proposal_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if new.project_id is distinct from old.project_id
		or new.document_id is distinct from old.document_id
		or new.created_by_actor_id is distinct from old.created_by_actor_id
		or new.instruction is distinct from old.instruction
		or new.patch is distinct from old.patch
		or new.patch_hash is distinct from old.patch_hash
		or new.base_content_hash is distinct from old.base_content_hash
		or new.result_content_hash is distinct from old.result_content_hash
		or new.created_at is distinct from old.created_at then
		raise exception 'document_proposal_payload_is_immutable' using errcode = '23514';
	end if;

	if old.status <> 'pending' and (
		new.status is distinct from old.status
		or new.conflict_reason is distinct from old.conflict_reason
		or new.applied_at is distinct from old.applied_at
		or new.applied_by_actor_id is distinct from old.applied_by_actor_id
		or new.version_warning is distinct from old.version_warning
	) then
		raise exception 'document_proposal_terminal_lifecycle_is_immutable' using errcode = '23514';
	end if;

	new.updated_at := now();
	return new;
end;
$$;

revoke all on function public.enforce_onto_document_proposal_lifecycle() from public, anon, authenticated;

create trigger onto_document_proposals_lifecycle
	before update on public.onto_document_proposals
	for each row execute function public.enforce_onto_document_proposal_lifecycle();

alter table public.onto_document_proposals enable row level security;

create policy onto_document_proposals_select_member
	on public.onto_document_proposals for select to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'read'));

create policy onto_document_proposals_service_role
	on public.onto_document_proposals for all to service_role
	using (true)
	with check (true);

grant select on table public.onto_document_proposals to authenticated;
grant all on table public.onto_document_proposals to service_role;

comment on table public.onto_document_proposals is
	'Immutable, hash-bound LLM document edits awaiting explicit human review.';
comment on column public.onto_document_proposals.patch is
	'Ratified DocumentPatchV1 payload. Lifecycle updates cannot mutate it.';
