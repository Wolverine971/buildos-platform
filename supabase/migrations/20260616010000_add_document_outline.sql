-- supabase/migrations/20260616010000_add_document_outline.sql
-- Project Knowledge Layer — Layer 0.
-- Adds a derived heading-outline cache to onto_documents and makes the existing
-- updated_at trigger outline-aware, so refreshing the derived cache never bumps
-- the audit/recency timestamp (which drives snapshots, recency sorting, loops).
-- See apps/web/docs/technical/architecture/PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md

-- 1. Derived outline cache: { version, content_hash, nodes: [...] }.
--    Pure function of `content`; kept fresh by the app on write and recomputed
--    live by read tools, so a NULL/stale value is always safe.
alter table onto_documents
  add column if not exists outline jsonb;

comment on column onto_documents.outline is
  'Derived heading outline of `content` (Project Knowledge Layer L0). Cache only — recomputable from content; keyed by content_hash.';

-- 2. Make the updated_at trigger ignore writes that only touch the derived cache.
--    A write that changes nothing but `outline` (and `updated_at`) preserves the
--    prior updated_at, so the document does not appear "recently edited".
create or replace function update_onto_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  -- If the only difference between the new and old row is the derived outline
  -- cache (and the timestamp itself), this is a cache refresh — not a user edit.
  if (to_jsonb(new) - 'outline' - 'updated_at')
       = (to_jsonb(old) - 'outline' - 'updated_at') then
    new.updated_at = old.updated_at;
  end if;

  return new;
end;
$$;
