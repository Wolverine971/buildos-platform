-- supabase/migrations/20250601000002_ontology_helpers.sql
-- ============================================
-- Ontology Helper Functions
-- Provides database-side utilities for the ontology system
-- ============================================

-- Drop existing helper functions to allow clean recreation
drop function if exists get_project_with_template(uuid);
drop function if exists get_allowed_transitions(text, uuid);
drop function if exists get_template_catalog(text, text, text);
drop function if exists validate_facet_values(jsonb);
drop function if exists validate_facet_values(jsonb, text);

drop function if exists onto_jsonb_extract(jsonb, text);
drop function if exists onto_jsonb_extract_text(jsonb, text);
drop function if exists onto_jsonb_has_value(jsonb, text);
drop function if exists onto_guards_pass(jsonb, jsonb);
drop function if exists onto_check_guard(jsonb, jsonb);

-- ============================================
-- JSON HELPER FUNCTIONS
-- ============================================

create or replace function onto_jsonb_extract(p_json jsonb, p_path text)
returns jsonb
language sql
immutable
as $$
	select
		case
			when p_json is null or p_path is null or length(p_path) = 0 then null
			else p_json #> string_to_array(p_path, '.')
		end;
$$;

create or replace function onto_jsonb_extract_text(p_json jsonb, p_path text)
returns text
language sql
immutable
as $$
	select
		case
			when p_json is null or p_path is null or length(p_path) = 0 then null
			else p_json #>> string_to_array(p_path, '.')
		end;
$$;

create or replace function onto_jsonb_has_value(p_json jsonb, p_path text)
returns boolean
language plpgsql
immutable
as $$
declare
	v_value jsonb;
begin
	if p_json is null or p_path is null or length(p_path) = 0 then
		return false;
	end if;

	v_value := onto_jsonb_extract(p_json, p_path);

	if v_value is null then
		return false;
	end if;

	if v_value = 'null'::jsonb then
		return false;
	end if;

	return true;
end;
$$;

-- ============================================
-- GUARD EVALUATION HELPERS
-- ============================================

create or replace function onto_check_guard(p_guard jsonb, p_entity jsonb)
returns boolean
language plpgsql
as $$
declare
	v_type text;
	v_path text;
	v_key text;
	v_value text;
	v_pattern text;
	v_current text;
begin
	if p_guard is null or jsonb_typeof(p_guard) <> 'object' then
		return false;
	end if;

	v_type := p_guard->>'type';
	if v_type is null then
		return false;
	end if;

	case v_type
		when 'has_property' then
			v_path := p_guard->>'path';
			if v_path is null or length(v_path) = 0 then
				return false;
			end if;
			return onto_jsonb_has_value(p_entity, v_path);

		when 'has_facet' then
			v_key := p_guard->>'key';
			v_value := p_guard->>'value';
			if v_key is null or v_value is null then
				return false;
			end if;
			return onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key) = v_value;

		when 'facet_in' then
			v_key := p_guard->>'key';
			if v_key is null or p_guard->'values' is null then
				return false;
			end if;

			v_value := onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key);
			if v_value is null then
				return false;
			end if;

			return exists (
				select 1
				from jsonb_array_elements_text(p_guard->'values') as vals(val)
				where vals.val = v_value
			);

		when 'all_facets_set' then
			if p_guard->'keys' is null then
				return false;
			end if;

			return not exists (
				select 1
				from jsonb_array_elements_text(p_guard->'keys') as facet_keys(key)
				where not onto_jsonb_has_value(p_entity, 'props.facets.' || facet_keys.key)
			);

		when 'type_key_matches' then
			v_pattern := p_guard->>'pattern';
			if v_pattern is null then
				return false;
			end if;

			v_pattern := replace(v_pattern, '*', '.*');
			v_current := coalesce(p_entity->>'type_key', '');
			-- Use case-sensitive regex to match the transformed pattern
			return v_current ~ v_pattern;

		else
			return false;
	end case;
end;
$$;

create or replace function onto_guards_pass(p_guards jsonb, p_entity jsonb)
returns boolean
language plpgsql
as $$
declare
	v_guard jsonb;
begin
	-- No guards means transition is allowed
	if p_guards is null or jsonb_typeof(p_guards) <> 'array' then
		return true;
	end if;

	for v_guard in
		select value
		from jsonb_array_elements(p_guards)
	loop
		if not onto_check_guard(v_guard, p_entity) then
			return false;
		end if;
	end loop;

	return true;
end;
$$;

-- ============================================
-- get_project_with_template
-- ============================================

create or replace function get_project_with_template(p_project_id uuid)
returns table(project jsonb, template jsonb)
language sql
stable
as $$
	select
		to_jsonb(p.*) as project,
		to_jsonb(t.*) as template
	from onto_projects p
	left join onto_templates t
		on t.type_key = p.type_key
		and t.scope = 'project'
	where p.id = p_project_id;
$$;

comment on function get_project_with_template(uuid) is
  'Returns the project row along with its associated project template metadata.';

-- ============================================
-- get_allowed_transitions
-- ============================================

create or replace function get_allowed_transitions(
	p_object_kind text,
	p_object_id uuid
)
returns table (
	event text,
	to_state text,
	guards jsonb,
	actions jsonb
)
language plpgsql
as $$
declare
	v_current_state text;
	v_type_key text;
	v_fsm jsonb;
	v_entity jsonb;
	v_transition jsonb;
begin
	if p_object_kind is null or p_object_id is null then
		return;
	end if;

	case p_object_kind
		when 'project' then
			select to_jsonb(p.*), p.state_key, p.type_key
			into v_entity, v_current_state, v_type_key
			from onto_projects p
			where p.id = p_object_id;

		when 'plan' then
			select to_jsonb(pl.*), pl.state_key, pl.type_key
			into v_entity, v_current_state, v_type_key
			from onto_plans pl
			where pl.id = p_object_id;

		when 'task' then
			select to_jsonb(t.*), t.state_key, t.type_key
			into v_entity, v_current_state, v_type_key
			from onto_tasks t
			where t.id = p_object_id;

		when 'output' then
			select to_jsonb(o.*), o.state_key, o.type_key
			into v_entity, v_current_state, v_type_key
			from onto_outputs o
			where o.id = p_object_id;

		when 'document' then
			select to_jsonb(d.*), null::text, d.type_key
			into v_entity, v_current_state, v_type_key
			from onto_documents d
			where d.id = p_object_id;

		else
			-- Unsupported kind; return empty set
			return;
	end case;

	if v_entity is null then
		return;
	end if;

	-- Documents currently do not have FSM state; guard by template if available
	if p_object_kind = 'document' then
		v_current_state := coalesce(v_entity->>'state_key', 'draft');
	end if;

	select fsm
	into v_fsm
	from onto_templates
	where type_key = v_type_key
		and scope = case p_object_kind
			when 'project' then 'project'
			when 'plan' then 'plan'
			when 'task' then 'task'
			when 'output' then 'output'
			when 'document' then 'document'
			else scope
		end
	limit 1;

	if v_fsm is null then
		return;
	end if;

	for v_transition in
		select value
		from jsonb_array_elements(v_fsm->'transitions')
	loop
		if v_transition->>'from' = v_current_state then
			if onto_guards_pass(v_transition->'guards', v_entity) then
				event := v_transition->>'event';
				to_state := v_transition->>'to';
				guards := coalesce(v_transition->'guards', '[]'::jsonb);
				actions := coalesce(v_transition->'actions', '[]'::jsonb);
				return next;
			end if;
		end if;
	end loop;

	return;
end;
$$;

comment on function get_allowed_transitions(text, uuid) is
  'Returns allowed transitions for an entity by evaluating its FSM guards in the database.';

-- ============================================
-- get_template_catalog
-- ============================================

create or replace function get_template_catalog(
	p_scope text default null,
	p_realm text default null,
	p_search text default null
)
returns table (
	id uuid,
	scope text,
	type_key text,
	name text,
	status onto_template_status,
	metadata jsonb,
	facet_defaults jsonb,
	default_props jsonb,
	default_views jsonb,
	schema jsonb,
	fsm jsonb,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
as $$
	select
		t.id,
		t.scope,
		t.type_key,
		t.name,
		t.status,
		t.metadata,
		t.facet_defaults,
		t.default_props,
		t.default_views,
		t.schema,
		t.fsm,
		t.created_at,
		t.updated_at
	from onto_templates t
	where t.status = 'active'
		and (p_scope is null or t.scope = p_scope)
		and (p_realm is null or t.metadata->>'realm' = p_realm)
		and (
			p_search is null
			or t.name ilike '%' || p_search || '%'
			or t.type_key ilike '%' || p_search || '%'
			or exists (
				select 1
				from jsonb_array_elements_text(coalesce(t.metadata->'keywords', '[]'::jsonb)) as kw(keyword)
				where kw.keyword ilike '%' || p_search || '%'
			)
		)
	order by coalesce(t.metadata->>'realm', 'zzz'), t.name;
$$;

comment on function get_template_catalog(text, text, text) is
  'Returns active templates with optional filtering by scope, realm, and search keyword.';

-- ============================================
-- validate_facet_values
-- ============================================

create or replace function validate_facet_values(p_facets jsonb, p_scope text)
returns table (
	facet_key text,
	provided_value text,
	error text
)
language plpgsql
as $$
declare
	v_entry record;
	v_text_value text;
begin
	if p_facets is null or jsonb_typeof(p_facets) <> 'object' then
		return;
	end if;

	if p_scope is null or length(trim(p_scope)) = 0 then
		raise exception 'validate_facet_values requires a non-null scope';
		return;
	end if;

	for v_entry in
		select key, value
		from jsonb_each(p_facets)
	loop
		-- Skip null values
		if v_entry.value is null or v_entry.value = 'null'::jsonb then
			continue;
		end if;

		if jsonb_typeof(v_entry.value) <> 'string' then
			facet_key := v_entry.key;
			provided_value := v_entry.value::text;
			error := 'Facet value must be a string';
			return next;
			continue;
		end if;

		v_text_value := v_entry.value #>> '{}';

		-- Ensure the facet key exists and applies to the given scope
		if not exists (
			select 1
			from onto_facet_definitions d
			where d.key = v_entry.key
		) then
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Unknown facet key: %s', v_entry.key);
			return next;
			continue;
		end if;

		if not exists (
			select 1
			from onto_facet_definitions d
			where d.key = v_entry.key
				and p_scope = any(d.applies_to)
		) then
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Facet "%s" does not apply to scope "%s"', v_entry.key, p_scope);
			return next;
			continue;
		end if;

		-- Ensure the value is among the allowed options
		if not exists (
			select 1
			from onto_facet_values v
			where v.facet_key = v_entry.key
				and v.value = v_text_value
		) then
			facet_key := v_entry.key;
			provided_value := v_text_value;
			error := format('Facet value "%s" is not allowed for "%s"', v_text_value, v_entry.key);
			return next;
		end if;
	end loop;
end;
$$;

comment on function validate_facet_values(jsonb, text) is
  'Validates facet values against the ontology facet taxonomy with scope awareness. Returns rows only for invalid entries.';

-- ============================================
-- GRANTS
-- ============================================

grant execute on function get_project_with_template(uuid) to authenticated;
grant execute on function get_allowed_transitions(text, uuid) to authenticated;
grant execute on function get_template_catalog(text, text, text) to authenticated;
grant execute on function validate_facet_values(jsonb, text) to authenticated;

-- Internal helpers are left with default privileges (accessible to invoker functions).
