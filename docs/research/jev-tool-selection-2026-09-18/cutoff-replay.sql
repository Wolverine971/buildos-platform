-- docs/research/jev-tool-selection-2026-09-18/cutoff-replay.sql
-- Jev's logged tool scores for the last 60 days, with the tools each turn went on to call.
-- Tool names, scores and context type only; no message text. Read by cutoff-replay.ts.
select l.turn_run_id,
       l.metadata->>'contextType' as ctx,
       l.metadata->'probabilities' as probs,
       (select jsonb_agg(distinct e.tool_name)
          from chat_tool_executions e
         where e.turn_run_id = l.turn_run_id) as called
from llm_usage_logs l
where l.operation_type = 'agentic_chat_tool_selection'
  and l.created_at > now() - interval '60 days'
  and l.metadata->'probabilities' is not null
  and (l.metadata->>'availableToolCount')::int > 10;
