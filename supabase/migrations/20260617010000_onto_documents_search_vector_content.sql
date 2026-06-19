-- supabase/migrations/20260617010000_onto_documents_search_vector_content.sql
-- Index the canonical document body in document search.
--
-- The document body now lives in the top-level `onto_documents.content` column
-- (writes mirror it into `props.body_markdown` only for backwards compat). But the
-- `search_vector` (from 20251224000000) was built from `title` + `jsonb_to_tsvector(props)`
-- only — so the smart search path (`onto_search_entities` / `/api/onto/search`,
-- `search_all_projects` / `search_project`) matches document bodies *only* via that
-- legacy props mirror, and never via trigram fuzzy on the body. The day the mirror is
-- dropped, body search silently breaks.
--
-- This rebuilds the generated column to index `content` directly (weight B), matching
-- the title(A)/content(B)/props(C) pattern already used for onto_projects and onto_risks
-- in 20260428000014. It is a strict superset of prior coverage (props still indexed),
-- so nothing that matched before stops matching.
--
-- NOTE: changing a GENERATED column's expression requires DROP + re-ADD, which rewrites
-- onto_documents (ACCESS EXCLUSIVE lock for the duration). Fine at current scale; on a
-- very large table, run during a low-traffic window.

-- Dropping the generated column also drops its dependent GIN index.
alter table onto_documents
  drop column if exists search_vector;

alter table onto_documents
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'C')
  ) stored;

create index if not exists idx_onto_documents_search_vector
  on onto_documents using gin (search_vector);

-- Intentionally NOT adding a trigram index on `content`: the smart path matches the
-- body through this `search_vector` GIN (not trigram), and the per-entity
-- `search_onto_documents` ILIKE is always project-scoped (scans one user's docs), so
-- it is fast without one. A GIN-trigram index over full markdown bodies would add
-- write overhead on a write-heavy table for no path that actually uses it.
