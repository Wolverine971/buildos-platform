-- supabase/migrations/20260827022735_restrict_document_proposal_mutations.sql
-- Proposal lifecycle is server-owned. Supabase default privileges grant broad
-- table access to Data API roles, so revoke those grants explicitly instead of
-- relying on the absence of mutation RLS policies alone.
revoke all privileges on table public.onto_document_proposals from public;
revoke all privileges on table public.onto_document_proposals from anon;
revoke all privileges on table public.onto_document_proposals from authenticated;

grant select on table public.onto_document_proposals to authenticated;
grant all privileges on table public.onto_document_proposals to service_role;
