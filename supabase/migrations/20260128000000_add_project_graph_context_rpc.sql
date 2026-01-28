-- supabase/migrations/20260128000000_add_project_graph_context_rpc.sql
-- Adds RPC for fast project graph context loading + index on onto_edges(project_id)

create or replace function load_project_graph_context(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_project jsonb;
  v_result jsonb;
begin
  select to_jsonb(p)
  into v_project
  from (
    select
      id,
      name,
      description,
      type_key,
      state_key,
      facet_context,
      facet_scale,
      facet_stage,
      start_at,
      end_at,
      next_step_short,
      next_step_long,
      created_at,
      updated_at
    from onto_projects
    where id = p_project_id
    limit 1
  ) as p;

  if v_project is null then
    raise exception 'Project % not found or access denied', p_project_id using errcode = 'PGRST116';
  end if;

  select jsonb_build_object(
    'project', v_project,
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select
          id,
          title,
          description,
          state_key,
          type_key,
          priority,
          start_at,
          due_at,
          completed_at,
          created_at,
          updated_at
        from onto_tasks
        where project_id = p_project_id
          and deleted_at is null
      ) as t
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g))
      from (
        select
          id,
          name,
          goal,
          description,
          state_key,
          type_key,
          target_date,
          completed_at,
          created_at,
          updated_at
        from onto_goals
        where project_id = p_project_id
          and deleted_at is null
      ) as g
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(pn))
      from (
        select
          id,
          name,
          description,
          state_key,
          type_key,
          created_at,
          updated_at
        from onto_plans
        where project_id = p_project_id
          and deleted_at is null
      ) as pn
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(to_jsonb(m))
      from (
        select
          id,
          title,
          description,
          state_key,
          type_key,
          due_at,
          completed_at,
          created_at,
          updated_at
        from onto_milestones
        where project_id = p_project_id
          and deleted_at is null
      ) as m
    ), '[]'::jsonb),
    'risks', coalesce((
      select jsonb_agg(to_jsonb(r))
      from (
        select
          id,
          title,
          content,
          state_key,
          type_key,
          impact,
          probability,
          mitigated_at,
          created_at,
          updated_at
        from onto_risks
        where project_id = p_project_id
          and deleted_at is null
      ) as r
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(d))
      from (
        select
          id,
          title,
          description,
          state_key,
          type_key,
          created_at,
          updated_at
        from onto_documents
        where project_id = p_project_id
          and deleted_at is null
      ) as d
    ), '[]'::jsonb),
    'requirements', coalesce((
      select jsonb_agg(to_jsonb(req))
      from (
        select
          id,
          text,
          priority,
          type_key,
          created_at,
          updated_at
        from onto_requirements
        where project_id = p_project_id
          and deleted_at is null
      ) as req
    ), '[]'::jsonb),
    'signals', coalesce((
      select jsonb_agg(to_jsonb(s))
      from (
        select
          id,
          channel,
          ts,
          payload,
          created_at
        from onto_signals
        where project_id = p_project_id
      ) as s
    ), '[]'::jsonb),
    'insights', coalesce((
      select jsonb_agg(to_jsonb(i))
      from (
        select
          id,
          title,
          derived_from_signal_id,
          props,
          created_at
        from onto_insights
        where project_id = p_project_id
      ) as i
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(e))
      from (
        select
          id,
          src_kind,
          src_id,
          rel,
          dst_kind,
          dst_id,
          project_id
        from onto_edges
        where project_id = p_project_id
      ) as e
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function load_project_graph_context(uuid) to authenticated;

create index if not exists idx_onto_edges_project on onto_edges(project_id);
