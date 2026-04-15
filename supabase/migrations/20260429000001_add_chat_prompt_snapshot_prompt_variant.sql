-- supabase/migrations/20260429000001_add_chat_prompt_snapshot_prompt_variant.sql
alter table public.chat_prompt_snapshots
  add column if not exists prompt_variant text not null default 'fastchat_prompt_v1';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_prompt_snapshots_prompt_variant_check'
  ) then
    alter table public.chat_prompt_snapshots
      add constraint chat_prompt_snapshots_prompt_variant_check
      check (prompt_variant in ('fastchat_prompt_v1', 'lite_seed_v1'));
  end if;
end $$;

create index if not exists idx_chat_prompt_snapshots_prompt_variant_created
  on public.chat_prompt_snapshots(prompt_variant, created_at desc);
