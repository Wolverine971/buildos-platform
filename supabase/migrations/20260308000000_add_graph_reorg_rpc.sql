-- supabase/migrations/20260308000000_add_graph_reorg_rpc.sql
-- Adds transactional apply RPC for graph reorganization

create or replace function apply_graph_reorg_changes(
  p_project_id uuid,
  p_deletes jsonb,
  p_updates jsonb,
  p_inserts jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_deletes jsonb := coalesce(p_deletes, '[]'::jsonb);
  v_updates jsonb := coalesce(p_updates, '[]'::jsonb);
  v_inserts jsonb := coalesce(p_inserts, '[]'::jsonb);
  v_delete_count integer := 0;
  v_update_count integer := 0;
  v_insert_count integer := 0;
  v_expected_deletes integer := 0;
  v_expected_updates integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  if jsonb_array_length(v_deletes) > 0 then
    with del as (
      select *
      from jsonb_to_recordset(v_deletes)
        as d(id uuid, src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)
    ), deleted as (
      delete from onto_edges e
      using del d
      where e.id = d.id
        and e.project_id = p_project_id
        and e.src_kind = d.src_kind
        and e.src_id = d.src_id
        and e.rel = d.rel
        and e.dst_kind = d.dst_kind
        and e.dst_id = d.dst_id
        and e.props = coalesce(d.props, '{}'::jsonb)
      returning e.id
    )
    select count(*) into v_delete_count from deleted;

    select count(*) into v_expected_deletes from jsonb_array_elements(v_deletes);

    if v_delete_count <> v_expected_deletes then
      raise exception 'Graph reorg conflict: delete mismatch (expected %, deleted %)', v_expected_deletes, v_delete_count
        using errcode = '40001';
    end if;
  end if;

  if jsonb_array_length(v_updates) > 0 then
    with upd as (
      select *
      from jsonb_to_recordset(v_updates)
        as u(
          id uuid,
          src_kind text,
          src_id uuid,
          rel text,
          dst_kind text,
          dst_id uuid,
          props jsonb,
          expected_props jsonb
        )
    ), updated as (
      update onto_edges e
      set props = coalesce(u.props, '{}'::jsonb)
      from upd u
      where e.id = u.id
        and e.project_id = p_project_id
        and e.src_kind = u.src_kind
        and e.src_id = u.src_id
        and e.rel = u.rel
        and e.dst_kind = u.dst_kind
        and e.dst_id = u.dst_id
        and e.props = coalesce(u.expected_props, '{}'::jsonb)
      returning e.id
    )
    select count(*) into v_update_count from updated;

    select count(*) into v_expected_updates from jsonb_array_elements(v_updates);

    if v_update_count <> v_expected_updates then
      raise exception 'Graph reorg conflict: update mismatch (expected %, updated %)', v_expected_updates, v_update_count
        using errcode = '40001';
    end if;
  end if;

  if jsonb_array_length(v_inserts) > 0 then
    with ins as (
      select *
      from jsonb_to_recordset(v_inserts)
        as i(src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)
    ), to_insert as (
      select i.*
      from ins i
      left join onto_edges e
        on e.project_id = p_project_id
        and e.src_kind = i.src_kind
        and e.src_id = i.src_id
        and e.rel = i.rel
        and e.dst_kind = i.dst_kind
        and e.dst_id = i.dst_id
      where e.id is null
    ), inserted as (
      insert into onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)
      select p_project_id, src_kind, src_id, rel, dst_kind, dst_id, coalesce(props, '{}'::jsonb)
      from to_insert
      returning id
    )
    select count(*) into v_insert_count from inserted;
  end if;

  return jsonb_build_object(
    'deleted', v_delete_count,
    'updated', v_update_count,
    'inserted', v_insert_count
  );
end;
$$;

grant execute on function apply_graph_reorg_changes(uuid, jsonb, jsonb, jsonb) to authenticated;
