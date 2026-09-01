-- supabase/tests/fixtures/web_page_evidence_account_deletion_cascade_base.sql
create table public.web_page_visits (
	id uuid primary key,
	user_id uuid not null,
	current_version_id uuid
);

create table public.web_page_versions (
	id uuid primary key,
	web_page_visit_id uuid not null,
	title text,
	constraint web_page_versions_visit_id_id_key unique (web_page_visit_id, id),
	constraint web_page_versions_visit_fk
		foreign key (web_page_visit_id)
		references public.web_page_visits(id)
);

alter table public.web_page_visits
	add constraint web_page_visits_current_version_fk
	foreign key (id, current_version_id)
	references public.web_page_versions(web_page_visit_id, id);

create table public.web_page_evidence_chunks (
	id uuid primary key,
	page_version_id uuid not null,
	content text,
	constraint web_page_evidence_chunks_version_fk
		foreign key (page_version_id)
		references public.web_page_versions(id)
);

create or replace function public.prevent_web_page_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
	raise exception 'immutable web evidence';
end;
$$;

create trigger web_page_versions_immutable
	before update or delete on public.web_page_versions
	for each row execute function public.prevent_web_page_evidence_mutation();
create trigger web_page_evidence_chunks_immutable
	before update or delete on public.web_page_evidence_chunks
	for each row execute function public.prevent_web_page_evidence_mutation();
