-- supabase/migrations/20260130000001_add_agent_plan_step_update_rpc.sql
-- Adds RPC to update a single plan step inside agent_plans.steps JSONB

create or replace function update_agent_plan_step(
  p_plan_id uuid,
  p_step_number integer,
  p_step_update jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_steps jsonb;
  v_updated_steps jsonb;
  v_updated_step jsonb;
  v_updated_at timestamptz := now();
begin
  select steps
  into v_steps
  from agent_plans
  where id = p_plan_id;

  if v_steps is null then
    raise exception 'Plan % not found', p_plan_id using errcode = 'PGRST116';
  end if;

  select elem
  into v_updated_step
  from jsonb_array_elements(v_steps) as elem
  where (elem->>'stepNumber')::int = p_step_number
  limit 1;

  if v_updated_step is null then
    raise exception 'Step % not found in plan %', p_step_number, p_plan_id using errcode = 'PGRST116';
  end if;

  v_updated_steps := (
    select jsonb_agg(
      case
        when (elem->>'stepNumber')::int = p_step_number
          then elem || coalesce(p_step_update, '{}'::jsonb)
        else elem
      end
      order by ord
    )
    from jsonb_array_elements(v_steps) with ordinality as e(elem, ord)
  );

  update agent_plans
  set steps = v_updated_steps,
      updated_at = v_updated_at
  where id = p_plan_id;

  return jsonb_build_object(
    'updated_at', v_updated_at,
    'step', (v_updated_step || coalesce(p_step_update, '{}'::jsonb))
  );
end;
$$;

grant execute on function update_agent_plan_step(uuid, integer, jsonb) to authenticated;
