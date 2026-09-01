-- supabase/migrations/20260901070000_web_page_evidence_account_deletion_cascade.sql
-- Allow user/account deletion to remove the complete immutable web-evidence
-- graph. Immutability remains enforced against clients by revoked table
-- privileges/RLS and UPDATE-only guards; child snapshots cannot RESTRICT a
-- required parent deletion.

begin;

alter table public.web_page_versions
	drop constraint if exists web_page_versions_visit_fk,
	add constraint web_page_versions_visit_fk
		foreign key (web_page_visit_id)
		references public.web_page_visits(id)
		on delete cascade;

alter table public.web_page_evidence_chunks
	drop constraint if exists web_page_evidence_chunks_version_fk,
	add constraint web_page_evidence_chunks_version_fk
		foreign key (page_version_id)
		references public.web_page_versions(id)
		on delete cascade;

drop trigger if exists web_page_versions_immutable on public.web_page_versions;
create trigger web_page_versions_immutable
	before update on public.web_page_versions
	for each row execute function public.prevent_web_page_evidence_mutation();

drop trigger if exists web_page_evidence_chunks_immutable
	on public.web_page_evidence_chunks;
create trigger web_page_evidence_chunks_immutable
	before update on public.web_page_evidence_chunks
	for each row execute function public.prevent_web_page_evidence_mutation();

comment on constraint web_page_versions_visit_fk on public.web_page_versions is
	'Account-scoped page visits own immutable versions; parent deletion cascades for privacy/account purge.';
comment on constraint web_page_evidence_chunks_version_fk on public.web_page_evidence_chunks is
	'Immutable page versions own their evidence chunks; version deletion cascades only through privileged retention/account purge.';

commit;
