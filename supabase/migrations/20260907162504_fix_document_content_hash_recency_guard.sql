-- supabase/migrations/20260907162504_fix_document_content_hash_recency_guard.sql
-- Exclude the generated content_hash added for document proposals from the
-- recency guard. Otherwise outline maintenance after a save bumps updated_at
-- again, so the next autosave conflicts with its own derived-cache write.
-- All generated columns must be excluded from BOTH comparisons below.
-- No document content, access policies, or version-history rows are changed.

create or replace function public.update_onto_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  -- Derived caches: `outline` is an app-maintained cache; `search_vector` is a
  -- generated column, like `content_hash`, unavailable in NEW at BEFORE-trigger time (computed
  -- after this trigger), so it must be excluded from row comparisons.
  if (to_jsonb(new) - 'outline' - 'updated_at' - 'search_vector' - 'content_hash')
       = (to_jsonb(old) - 'outline' - 'updated_at' - 'search_vector' - 'content_hash') then
    new.updated_at = old.updated_at;
    return new;
  end if;

  -- Start Here managed regions are deterministic projections of project state.
  -- If only `content` and/or `outline` changed, and the authored body outside
  -- managed fences is identical, preserve the prior recency timestamp.
  if old.type_key = 'document.context.project'
     and new.type_key = old.type_key
     and (to_jsonb(new) - 'outline' - 'updated_at' - 'content' - 'search_vector' - 'content_hash')
       = (to_jsonb(old) - 'outline' - 'updated_at' - 'content' - 'search_vector' - 'content_hash')
     and public.strip_start_here_managed_regions(new.content)
       = public.strip_start_here_managed_regions(old.content) then
    new.updated_at = old.updated_at;
  end if;

  return new;
end;
$$;
