-- supabase/migrations/20260130_235500_update_agent_plan_step_rpc_lock.sql
-- Improve update_agent_plan_step RPC to avoid lost updates under parallel execution

create or replace function update_agent_plan_step(
  p_plan_id uuid,
  p_step_number integer,
  p_step_update jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_step_index integer;
  v_existing_step jsonb;
  v_updated_at timestamptz := now();
  v_update_patch jsonb := coalesce(p_step_update, '{}'::jsonb);
begin
  -- Lock the plan row while locating the step to avoid concurrent lost updates.
  select (e.ord - 1), e.elem
  into v_step_index, v_existing_step
  from agent_plans ap,
       lateral jsonb_array_elements(ap.steps) with ordinality as e(elem, ord)
  where ap.id = p_plan_id
    and (e.elem->>'stepNumber')::int = p_step_number
  for update of ap
  limit 1;

  if v_step_index is null then
    raise exception 'Step % not found in plan %', p_step_number, p_plan_id using errcode = 'PGRST116';
  end if;

  update agent_plans ap
  set steps = jsonb_set(
        ap.steps,
        array[v_step_index::text],
        (coalesce(ap.steps->v_step_index, '{}'::jsonb) || v_update_patch),
        true
      ),
      updated_at = v_updated_at
  where ap.id = p_plan_id;

  return jsonb_build_object(
    'updated_at', v_updated_at,
    'step', (v_existing_step || v_update_patch)
  );
end;
$$;

grant execute on function update_agent_plan_step(uuid, integer, jsonb) to authenticated;
