-- supabase/migrations/20260502000003_agentic_chat_running_turn_guard.sql
-- Prevent duplicate background agent turns from running for the same chat session.
-- If a session already has duplicate running rows from a previous race, keep the
-- newest row as the active run and mark older duplicates stale before adding the guard.
with ranked_running_turns as (
  select
    id,
    row_number() over (
      partition by session_id
      order by started_at desc nulls last, created_at desc nulls last, id desc
    ) as running_rank
  from public.chat_turn_runs
  where status = 'running'
)
update public.chat_turn_runs as run
set
  status = 'cancelled',
  finished_reason = coalesce(run.finished_reason, 'stale_duplicate_running_turn'),
  finished_at = coalesce(run.finished_at, now()),
  updated_at = now()
from ranked_running_turns
where run.id = ranked_running_turns.id
  and ranked_running_turns.running_rank > 1;

create unique index if not exists uq_chat_turn_runs_one_running_per_session
  on public.chat_turn_runs(session_id)
  where status = 'running';
