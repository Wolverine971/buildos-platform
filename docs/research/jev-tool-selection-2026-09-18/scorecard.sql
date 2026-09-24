-- docs/research/jev-tool-selection-2026-09-18/scorecard.sql
-- Jev tool selection scorecard: Jev's pick vs. the tools the acting model actually
-- called in the same turn. Works in shadow mode (nothing narrowed) and on mode (a
-- miss shows up as a called tool that was restored by the one-shot surface repair).
--   pnpm exec supabase db query --linked -f docs/research/jev-tool-selection-2026-09-18/scorecard.sql
with sel as (
  select turn_run_id,
         metadata->>'mode' as mode,
         metadata->>'reason' as reason,
         metadata->'selectedToolNames' as selected,
         (metadata->>'schemaCharsBefore')::numeric as chars_before,
         (metadata->>'schemaCharsAfter')::numeric as chars_after,
         response_time_ms,
         total_cost_usd
  from llm_usage_logs
  where operation_type = 'agentic_chat_tool_selection'
    and created_at > now() - interval '14 days'
),
called as (
  select turn_run_id, array_agg(distinct tool_name order by tool_name) as tools
  from chat_tool_executions
  where turn_run_id in (select turn_run_id from sel)
  group by 1
),
scored as (
  select s.*, coalesce(c.tools, '{}') as called,
         array(select t from unnest(coalesce(c.tools, '{}')) t where not (s.selected ? t)) as missed
  from sel s left join called c using (turn_run_id)
)
select mode,
       count(*) as turns,
       count(*) filter (where reason = 'classified') as classified,
       count(*) filter (where reason = 'classified' and cardinality(missed) > 0) as turns_with_miss,
       round(avg(1 - chars_after / nullif(chars_before, 0)) filter (where reason = 'classified'), 3) as mean_schema_cut,
       percentile_cont(0.5) within group (order by response_time_ms) as p50_ms,
       percentile_cont(0.95) within group (order by response_time_ms) as p95_ms,
       round(sum(total_cost_usd)::numeric, 5) as jev_cost_usd,
       (select json_agg(json_build_object('turn', turn_run_id, 'missed', missed, 'called', called))
          from scored x where x.mode = scored.mode and cardinality(x.missed) > 0) as misses
from scored
group by mode;
