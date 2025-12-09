-- supabase/migrations/20250615000004_guard_visibility_and_fsm_fix.sql
-- Update get_allowed_transitions to expose guard availability and ensure
-- variant templates resolve FSM definitions correctly.

drop function if exists get_allowed_transitions(text, uuid);

create or replace function get_allowed_transitions(
	p_object_kind text,
	p_object_id uuid
)
returns table (
	event text,
	to_state text,
	guards jsonb,
	actions jsonb,
	can_run boolean
)
language plpgsql
as $$
declare
	v_current_state text;
	v_type_key text;
	v_scope text;
	v_fsm jsonb;
	v_entity jsonb;
	v_transition jsonb;
	v_guard_pass boolean;
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
			v_scope := 'project';

		when 'plan' then
			select to_jsonb(pl.*), pl.state_key, pl.type_key
			into v_entity, v_current_state, v_type_key
			from onto_plans pl
			where pl.id = p_object_id;
			v_scope := 'plan';

		when 'task' then
			select to_jsonb(t.*), t.state_key, 'task.basic'::text
			into v_entity, v_current_state, v_type_key
			from onto_tasks t
			where t.id = p_object_id;
			v_scope := 'task';

		when 'output' then
			select to_jsonb(o.*), o.state_key, o.type_key
			into v_entity, v_current_state, v_type_key
			from onto_outputs o
			where o.id = p_object_id;
			v_scope := 'output';

		when 'document' then
			select to_jsonb(d.*), coalesce(d.state_key, 'draft'), d.type_key
			into v_entity, v_current_state, v_type_key
			from onto_documents d
			where d.id = p_object_id;
			v_scope := 'document';

		else
			return;
	end case;

	if v_entity is null or v_type_key is null or v_scope is null then
		return;
	end if;

	with recursive template_chain as (
		select
			t.id,
			t.parent_template_id,
			t.fsm,
			0 as depth
		from onto_templates t
		where t.type_key = v_type_key
			and t.scope = v_scope

		union all

		select
			parent.id,
			parent.parent_template_id,
			parent.fsm,
			template_chain.depth + 1
		from onto_templates parent
		join template_chain on template_chain.parent_template_id = parent.id
		where template_chain.depth < 10
	)
	select fsm
	into v_fsm
	from template_chain
	where fsm is not null
	order by depth
	limit 1;

	if v_fsm is null then
		return;
	end if;

	for v_transition in
		select value
		from jsonb_array_elements(v_fsm->'transitions')
	loop
		if v_transition->>'from' = v_current_state then
			v_guard_pass := onto_guards_pass(v_transition->'guards', v_entity);
			event := v_transition->>'event';
			to_state := v_transition->>'to';
			guards := coalesce(v_transition->'guards', '[]'::jsonb);
			actions := coalesce(v_transition->'actions', '[]'::jsonb);
			can_run := coalesce(v_guard_pass, true);
			return next;
		end if;
	end loop;

	return;
end;
$$;

comment on function get_allowed_transitions(text, uuid) is
  'Returns transitions for an entity, showing guard and action metadata while indicating whether guards currently pass.';

grant execute on function get_allowed_transitions(text, uuid) to authenticated;

-- Re-run invalid state backfill for any remaining variant-based projects.

with invalid_projects as (
	select
		p.id,
		resolved.resolved_initial,
		resolved.fsm
	from onto_projects p
	join lateral (
		with recursive template_chain as (
			select
				t.id,
				t.parent_template_id,
				t.fsm,
				0 as depth
			from onto_templates t
			where t.scope = 'project'
				and t.type_key = p.type_key

			union all

			select
				parent.id,
				parent.parent_template_id,
				parent.fsm,
				template_chain.depth + 1
			from onto_templates parent
			join template_chain on template_chain.parent_template_id = parent.id
			where template_chain.depth < 10
		)
		select
			template_chain.fsm,
			coalesce(
				template_chain.fsm->>'initial',
				(template_chain.fsm->'states')->>0,
				'draft'
			) as resolved_initial
		from template_chain
		where template_chain.fsm is not null
		order by template_chain.depth
		limit 1
	) as resolved on true
	where resolved.fsm is not null
		and resolved.resolved_initial is not null
		and not exists (
			select 1
			from jsonb_array_elements_text(resolved.fsm->'states') as state(value)
			where state.value = p.state_key
		)
)
update onto_projects p
set state_key = invalid_projects.resolved_initial
from invalid_projects
where invalid_projects.id = p.id;
