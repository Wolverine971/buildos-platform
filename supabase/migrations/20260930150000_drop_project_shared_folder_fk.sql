-- supabase/migrations/20260930150000_drop_project_shared_folder_fk.sql
--
-- Hotfix for 20260930130000_project_hierarchy_shared_shelf.sql.
--
-- The foreign key onto_projects.shared_folder_document_id -> onto_documents(id)
-- gave PostgREST a second relationship between onto_documents and onto_projects
-- (next to onto_documents.project_id). Every embed between the two tables
-- (e.g. `onto_documents.select('*, onto_projects(...)')`) then failed with
-- PGRST201 "more than one relationship was found", breaking document loads.
--
-- The column stays. Nothing depends on the constraint: only
-- onto_project_set_parent_atomic writes the column (behind the hierarchy guard
-- trigger), and it and onto_project_family_v1 both treat a missing or deleted
-- folder document as "no folder" and recreate it on the next set-parent.

alter table public.onto_projects
	drop constraint if exists onto_projects_shared_folder_document_id_fkey;

comment on column public.onto_projects.shared_folder_document_id is
	'The parent''s "Shared with sub-projects" folder document. Deliberately not a foreign key: a second onto_documents<->onto_projects relationship makes PostgREST embeds ambiguous (PGRST201).';

notify pgrst, 'reload schema';
