-- supabase/migrations/20251205_update_get_project_with_template_context_document.sql
-- Purpose: Include the linked context document when fetching a project + template

DROP FUNCTION get_project_with_template(p_project_id uuid)


create or replace function get_project_with_template(p_project_id uuid)
returns table(project jsonb, template jsonb, context_document jsonb)
language sql
stable
as $$
	select
		to_jsonb(p.*) as project,
		to_jsonb(t.*) as template,
		to_jsonb(d.*) as context_document
	from onto_projects p
	left join onto_templates t
		on t.type_key = p.type_key
		and t.scope = 'project'
	left join onto_documents d
		on d.id = p.context_document_id
	where p.id = p_project_id;
$$;

comment on function get_project_with_template(uuid) is
  'Returns the project row along with its associated project template metadata and context document.';
