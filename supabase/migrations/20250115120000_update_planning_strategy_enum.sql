-- supabase/migrations/20250115120000_update_planning_strategy_enum.sql
-- Description: Collapse legacy simple/complex strategies into planner_stream and align enum with new agent flow

begin;

alter type planning_strategy rename to planning_strategy_old;

-- Convert column to text for remapping
alter table agent_plans
  alter column strategy type text
  using strategy::text;

create type planning_strategy as enum (
  'planner_stream',
  'ask_clarifying_questions',
  'project_creation'
);

update agent_plans
set strategy = case
  when strategy in ('planner_stream', 'planner_stream') then 'planner_stream'
  when strategy = 'ask_clarifying_questions' then 'ask_clarifying_questions'
  when strategy = 'project_creation' then 'project_creation'
  else 'planner_stream'
end;

alter table agent_plans
  alter column strategy type planning_strategy
  using strategy::planning_strategy;

drop type planning_strategy_old;

comment on type planning_strategy is 'Planner strategies selected by the LLM: planner_stream, clarifying questions, or project creation';
comment on column agent_plans.strategy is 'Planner strategy used when generating the plan';

commit;
