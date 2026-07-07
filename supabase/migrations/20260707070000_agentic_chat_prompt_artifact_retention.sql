-- supabase/migrations/20260707070000_agentic_chat_prompt_artifact_retention.sql
-- Retention helper for high-volume agentic chat prompt artifacts.

create index if not exists idx_chat_prompt_snapshots_created_retention
  on public.chat_prompt_snapshots(created_at);

create index if not exists idx_chat_prompt_snapshots_rendered_dump_retention
  on public.chat_prompt_snapshots(created_at)
  where rendered_dump_text is not null;

create or replace function public.cleanup_agentic_chat_prompt_artifacts(
  p_prompt_snapshot_retention_days integer default 14,
  p_rendered_dump_retention_days integer default 2,
  p_batch_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prepared_deleted integer := 0;
  v_snapshot_deleted integer := 0;
  v_rendered_dump_cleared integer := 0;
  v_snapshot_retention_days integer := greatest(coalesce(p_prompt_snapshot_retention_days, 14), 1);
  v_rendered_dump_retention_days integer := greatest(coalesce(p_rendered_dump_retention_days, 2), 1);
  v_batch_size integer := greatest(least(coalesce(p_batch_size, 1000), 10000), 1);
begin
  v_prepared_deleted := public.cleanup_expired_agentic_chat_prepared_prompts();

  with stale_dumps as (
    select id
    from public.chat_prompt_snapshots
    where rendered_dump_text is not null
      and created_at < now() - make_interval(days => v_rendered_dump_retention_days)
    order by created_at asc
    limit v_batch_size
  )
  update public.chat_prompt_snapshots snapshots
  set rendered_dump_text = null
  where snapshots.id in (select id from stale_dumps);

  get diagnostics v_rendered_dump_cleared = row_count;

  with stale_snapshots as (
    select id
    from public.chat_prompt_snapshots
    where created_at < now() - make_interval(days => v_snapshot_retention_days)
    order by created_at asc
    limit v_batch_size
  )
  delete from public.chat_prompt_snapshots snapshots
  where snapshots.id in (select id from stale_snapshots);

  get diagnostics v_snapshot_deleted = row_count;

  return jsonb_build_object(
    'prepared_prompts_deleted', v_prepared_deleted,
    'prompt_snapshots_deleted', v_snapshot_deleted,
    'rendered_dumps_cleared', v_rendered_dump_cleared,
    'prompt_snapshot_retention_days', v_snapshot_retention_days,
    'rendered_dump_retention_days', v_rendered_dump_retention_days,
    'batch_size', v_batch_size
  );
end;
$$;

revoke all on function public.cleanup_agentic_chat_prompt_artifacts(integer, integer, integer) from public;
grant execute on function public.cleanup_agentic_chat_prompt_artifacts(integer, integer, integer) to service_role;

comment on function public.cleanup_agentic_chat_prompt_artifacts(integer, integer, integer) is
'Deletes expired agentic chat prepared prompts, clears old rendered prompt dumps, and deletes old prompt snapshots. Scheduled from the worker queue retention cleanup.';
