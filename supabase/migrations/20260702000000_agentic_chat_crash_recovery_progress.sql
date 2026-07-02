-- supabase/migrations/20260702000000_agentic_chat_crash_recovery_progress.sql
-- Agentic chat crash-recovery progress columns.
--
-- Two independent durability gaps in the agentic chat / agent-run write paths:
--
--   D4  chat_turn_runs.last_progress_at
--       The FastChat stream writes tool-execution rows and the assistant message
--       only at end-of-turn. A mid-turn lambda kill leaves the turn stuck in
--       'running' with no way to tell a genuinely-dead turn from a slow one. The
--       stream now heartbeats last_progress_at as each tool completes so a future
--       sweeper can reclaim only turns that have actually stalled.
--
--   D9b agent_runs.commit_started_at
--       commitChangeSet() atomically claims proposal_ready -> running, then applies
--       the staged changes with no surrounding transaction, then writes the terminal
--       status. A crash between the claim and the terminal write left the run pinned
--       at 'running' forever (every future commit hit status != 'proposal_ready' ->
--       permanent CONFLICT). commit_started_at is set on claim and heartbeated after
--       each applied change; a stalled commit (running + stale commit_started_at) can
--       now be safely re-entered and reconciled instead of dead-locking. The atomic
--       claim / compare-and-swap on this column preserves the double-commit guard.

alter table public.chat_turn_runs
	add column if not exists last_progress_at timestamptz;

alter table public.agent_runs
	add column if not exists commit_started_at timestamptz;

-- Support the future stalled-turn / stalled-commit sweepers without a full scan.
create index if not exists chat_turn_runs_running_last_progress_idx
	on public.chat_turn_runs (last_progress_at)
	where status = 'running';

create index if not exists agent_runs_running_commit_started_idx
	on public.agent_runs (commit_started_at)
	where status = 'running';
