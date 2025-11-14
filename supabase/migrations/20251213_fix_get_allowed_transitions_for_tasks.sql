-- Fix get_allowed_transitions to handle tasks without type_key column
-- Tasks don't have a type_key column, so we use a default value

drop function if exists get_allowed_transitions(text, uuid);

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
			-- Tasks don't have type_key column, use default
			select to_jsonb(t.*), t.state_key, 'task.basic'::text
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
  'Returns allowed transitions for an entity by evaluating its FSM guards in the database. Tasks use default type_key of task.basic.';

grant execute on function get_allowed_transitions(text, uuid) to authenticated;
