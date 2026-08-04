-- supabase/migrations/20260804031000_model_integrity_hardening.sql
-- Modeling hardening after Phase 2 retirement:
-- 1. make ontology project ownership relational;
-- 2. prevent cross-run Question Tree references;
-- 3. remove unintended anonymous table privileges from the admin experiment.

begin;

create index if not exists idx_onto_projects_created_by
	on public.onto_projects(created_by);

alter table public.onto_projects
	drop constraint if exists onto_projects_created_by_fkey,
	add constraint onto_projects_created_by_fkey
		foreign key (created_by)
		references public.onto_actors(id)
		on delete restrict
		not valid;

alter table public.onto_projects
	validate constraint onto_projects_created_by_fkey;

alter table public.question_tree_proposals
	drop constraint if exists question_tree_proposals_child_node_id_fkey,
	drop constraint if exists question_tree_proposals_duplicate_of_node_id_fkey,
	drop constraint if exists question_tree_proposals_child_node_run_fkey,
	drop constraint if exists question_tree_proposals_duplicate_node_run_fkey,
	add constraint question_tree_proposals_child_node_run_fkey
		foreign key (run_id, child_node_id)
		references public.question_tree_nodes(run_id, id)
		on delete set null (child_node_id)
		not valid,
	add constraint question_tree_proposals_duplicate_node_run_fkey
		foreign key (run_id, duplicate_of_node_id)
		references public.question_tree_nodes(run_id, id)
		on delete set null (duplicate_of_node_id)
		not valid;

alter table public.question_tree_proposals
	validate constraint question_tree_proposals_child_node_run_fkey;
alter table public.question_tree_proposals
	validate constraint question_tree_proposals_duplicate_node_run_fkey;

alter table public.question_tree_events
	drop constraint if exists question_tree_events_node_id_fkey,
	drop constraint if exists question_tree_events_node_run_fkey,
	add constraint question_tree_events_node_run_fkey
		foreign key (run_id, node_id)
		references public.question_tree_nodes(run_id, id)
		on delete cascade
		not valid;

alter table public.question_tree_events
	validate constraint question_tree_events_node_run_fkey;

revoke all on table public.question_tree_runs from public, anon, authenticated;
revoke all on table public.question_tree_nodes from public, anon, authenticated;
revoke all on table public.question_tree_proposals from public, anon, authenticated;
revoke all on table public.question_tree_events from public, anon, authenticated;

-- Preserve the intended, RLS-protected admin read surface and the worker's
-- service-role control plane explicitly after removing broad inherited grants.
grant select on table public.question_tree_runs to authenticated;
grant select on table public.question_tree_nodes to authenticated;
grant select on table public.question_tree_proposals to authenticated;
grant select on table public.question_tree_events to authenticated;
grant all on table public.question_tree_runs to service_role;
grant all on table public.question_tree_nodes to service_role;
grant all on table public.question_tree_proposals to service_role;
grant all on table public.question_tree_events to service_role;

commit;
