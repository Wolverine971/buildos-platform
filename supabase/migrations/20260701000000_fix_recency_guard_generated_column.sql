-- supabase/migrations/20260701000000_fix_recency_guard_generated_column.sql
-- Fix: the updated_at recency guard on onto_documents never fired in production.
--
-- Root cause: `search_vector` is a STORED GENERATED column (20251224000000,
-- rebuilt in 20260617010000). Generated columns are computed AFTER BEFORE
-- triggers run, so inside update_onto_documents_updated_at() NEW.search_vector
-- is NULL while OLD.search_vector holds the stored tsvector. The whole-row
-- to_jsonb(new) = to_jsonb(old) comparisons from 20260616010000 (outline
-- branch) and 20260624000000 (Start Here managed-region branch) therefore
-- never matched, and every write bumped updated_at.
--
-- Verified empirically 2026-07-01: a managed-region-only content change and an
-- outline-only change both bumped updated_at in prod; reproduced locally with
-- a generated column and confirmed NEW.search_vector IS NULL in the trigger.
--
-- Fix: subtract 'search_vector' from both comparisons, same as 'outline'.
-- NOTE: any future GENERATED column added to onto_documents must also be
-- subtracted here, or the guard silently dies again.

create or replace function update_onto_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  -- Derived caches: `outline` is an app-maintained cache; `search_vector` is a
  -- generated column that is NULL in NEW at BEFORE-trigger time (computed
  -- after this trigger), so it must be excluded from row comparisons.
  if (to_jsonb(new) - 'outline' - 'updated_at' - 'search_vector')
       = (to_jsonb(old) - 'outline' - 'updated_at' - 'search_vector') then
    new.updated_at = old.updated_at;
    return new;
  end if;

  -- Start Here managed regions are deterministic projections of project state.
  -- If only `content` and/or `outline` changed, and the authored body outside
  -- managed fences is identical, preserve the prior recency timestamp.
  if old.type_key = 'document.context.project'
     and new.type_key = old.type_key
     and (to_jsonb(new) - 'outline' - 'updated_at' - 'content' - 'search_vector')
       = (to_jsonb(old) - 'outline' - 'updated_at' - 'content' - 'search_vector')
     and public.strip_start_here_managed_regions(new.content)
       = public.strip_start_here_managed_regions(old.content) then
    new.updated_at = old.updated_at;
  end if;

  return new;
end;
$$;
