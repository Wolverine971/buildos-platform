-- supabase/migrations/20251201_task_type_key_and_edge_based_plans.sql
-- Migration: Add type_key to onto_tasks and move plan relationships to edges
--
-- This migration:
-- 1. Adds type_key column to onto_tasks (aligning with other ontology entities)
-- 2. Migrates existing plan_id relationships to onto_edges
-- 3. Removes plan_id column from onto_tasks
-- 4. Updates get_allowed_transitions function to use the new type_key column
--
-- Task Type Key Taxonomy:
-- Format: task.{work_mode}[.{specialization}]
-- Base work modes: create, refine, research, review, coordinate, admin, plan, execute
-- Specializations: coordinate.meeting, coordinate.standup, execute.deploy, execute.checklist

-- ============================================
-- STEP 1: Add type_key column to onto_tasks
-- ============================================

-- Add the type_key column (nullable initially for migration)
alter table onto_tasks
add column if not exists type_key text;

-- Create index for type_key queries
create index if not exists idx_onto_tasks_type_key on onto_tasks(type_key);

-- ============================================
-- STEP 2: Backfill type_key from props or default
-- ============================================

-- First, try to use existing type_key stored in props
update onto_tasks
set type_key = props->>'type_key'
where type_key is null
  and props->>'type_key' is not null;

-- For remaining tasks, infer type from props or default to task.execute
-- (most existing tasks are likely execution-focused)
update onto_tasks
set type_key = 'task.execute'
where type_key is null;

-- Now set the column to not null with default
alter table onto_tasks
alter column type_key set not null,
alter column type_key set default 'task.execute';

-- ============================================
-- STEP 3: Migrate plan_id to onto_edges
-- ============================================

-- Insert edges for all existing task-plan relationships
-- Using 'belongs_to_plan' relationship type for task -> plan direction
insert into onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
select
  'task' as src_kind,
  t.id as src_id,
  'belongs_to_plan' as rel,
  'plan' as dst_kind,
  t.plan_id as dst_id,
  '{}'::jsonb as props
from onto_tasks t
where t.plan_id is not null
  and not exists (
    -- Avoid duplicates if edges already exist
    select 1 from onto_edges e
    where e.src_kind = 'task'
      and e.src_id = t.id
      and e.rel = 'belongs_to_plan'
      and e.dst_kind = 'plan'
      and e.dst_id = t.plan_id
  );

-- Also ensure we have the inverse 'has_task' edges (plan -> task)
-- The instantiation service already creates these, but let's ensure consistency
insert into onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
select
  'plan' as src_kind,
  t.plan_id as src_id,
  'has_task' as rel,
  'task' as dst_kind,
  t.id as dst_id,
  '{}'::jsonb as props
from onto_tasks t
where t.plan_id is not null
  and not exists (
    select 1 from onto_edges e
    where e.src_kind = 'plan'
      and e.src_id = t.plan_id
      and e.rel = 'has_task'
      and e.dst_kind = 'task'
      and e.dst_id = t.id
  );

-- ============================================
-- STEP 4: Drop plan_id column and its index
-- ============================================

-- Drop the index first
drop index if exists idx_onto_tasks_plan;

-- Remove the foreign key constraint
alter table onto_tasks
drop constraint if exists onto_tasks_plan_id_fkey;

-- Drop the column
alter table onto_tasks
drop column if exists plan_id;

-- ============================================
-- STEP 5: Update get_allowed_transitions function
-- ============================================

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
      -- Tasks now have type_key column
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
  'Returns allowed transitions for an entity by evaluating its FSM guards in the database. Tasks now have proper type_key column.';

grant execute on function get_allowed_transitions(text, uuid) to authenticated;

-- ============================================
-- STEP 6: Create helper function to get task's plan via edges
-- ============================================

create or replace function get_task_plan(p_task_id uuid)
returns table (
  plan_id uuid,
  plan_name text,
  plan_type_key text
)
language sql
stable
as $$
  select
    p.id as plan_id,
    p.name as plan_name,
    p.type_key as plan_type_key
  from onto_edges e
  join onto_plans p on p.id = e.dst_id
  where e.src_kind = 'task'
    and e.src_id = p_task_id
    and e.rel = 'belongs_to_plan'
    and e.dst_kind = 'plan'
  limit 1;
$$;

comment on function get_task_plan(uuid) is
  'Returns the plan associated with a task via onto_edges';

grant execute on function get_task_plan(uuid) to authenticated;

-- ============================================
-- STEP 7: Create index for efficient edge lookups
-- ============================================

-- Index for finding tasks by plan (plan -> task edges)
create index if not exists idx_onto_edges_plan_tasks
on onto_edges(src_id, dst_id)
where src_kind = 'plan' and dst_kind = 'task' and rel = 'has_task';

-- Index for finding plan by task (task -> plan edges)
create index if not exists idx_onto_edges_task_plan
on onto_edges(src_id, dst_id)
where src_kind = 'task' and dst_kind = 'plan' and rel = 'belongs_to_plan';

-- ============================================
-- VERIFICATION
-- ============================================

-- Log migration completion
do $$
declare
  task_count int;
  edge_count int;
  tasks_with_type_key int;
begin
  select count(*) into task_count from onto_tasks;
  select count(*) into edge_count from onto_edges where rel = 'belongs_to_plan';
  select count(*) into tasks_with_type_key from onto_tasks where type_key is not null;

  raise notice 'Migration complete:';
  raise notice '  - Total tasks: %', task_count;
  raise notice '  - Tasks with type_key: %', tasks_with_type_key;
  raise notice '  - Task-plan edges created: %', edge_count;
end;
$$;
