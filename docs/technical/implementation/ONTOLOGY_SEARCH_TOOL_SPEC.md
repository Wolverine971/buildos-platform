<!-- docs/technical/implementation/ONTOLOGY_SEARCH_TOOL_SPEC.md -->

# Ontology Cross-Entity Search Tool (Agentic Chat)

## Document Metadata

- **Status**: Draft → Implementing
- **Owner**: AI Agent / Eng
- **Last Updated**: 2025-12-24
- **Scope**: Agentic chat search across ontology entities (tasks, plans, goals, milestones, documents, outputs, requirements)

## Problem & Goal

- Users ask for items (e.g., “marketing plan”) without knowing the entity type or ID.
- Need one tool that searches all ontology entities within a project, returns typed hits with snippets, and lets the agent drill into details.
- Must support fuzzy matching and respect project/actor scoping.

## v1 Approach (Postgres FTS + trigram)

- Use Postgres `tsvector` + `pg_trgm` (already enabled) for lexical + fuzzy.
- Add generated `search_vector` per table; use `jsonb_to_tsvector` to index all string props so template-inherited fields are searchable.
- Trigram similarity on primary title/name/text; optional trigram on `props::text` for broader fuzzy matches.
- Single RPC `onto_search_entities` unions all entities, applies `project_id` + `created_by` scoping, scores, and caps results (50).
- API `/api/onto/search` calls RPC and normalizes results.
- Agent tool `search_ontology` calls the API; agent follows up with `get_onto_*_details` for chosen IDs.

## Indexed Text Sources (per entity)

- **Tasks**: `title` (A), `jsonb_to_tsvector(props)` (B) for description/notes/summary, trigram on `title`, trigram on `props::text`.
- **Plans**: `name` (A), `jsonb_to_tsvector(props)` (B).
- **Goals**: `name` (A), `jsonb_to_tsvector(props)` (B).
- **Milestones**: `title` (A), `jsonb_to_tsvector(props)` (B).
- **Documents**: `title` (A), `props->>'body_markdown'` folded into `jsonb_to_tsvector(props)` (B); trigram on `title`; trigram on `props::text` for body.
- **Outputs**: `name` (A), `jsonb_to_tsvector(props)` (B).
- **Requirements**: `text` (A), `jsonb_to_tsvector(props)` (B), trigram on `text`, trigram on `props::text`.

## DB Work (per table pattern)

```sql
-- Example: onto_tasks
alter table onto_tasks
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_tasks_search_vector on onto_tasks using gin (search_vector);
create index if not exists idx_onto_tasks_title_trgm on onto_tasks using gin (title gin_trgm_ops);
create index if not exists idx_onto_tasks_props_trgm on onto_tasks using gin ((props::text) gin_trgm_ops);
```

## RPC: `onto_search_entities`

- **Signature**: `(p_actor_id uuid, p_query text, p_project_id uuid default null, p_types text[] default null, p_limit int default 50)`
- **Query**: `tsq := websearch_to_tsquery('english', p_query)`; union per-entity selects.
- **Per-entity select**: `type`, `id`, `project_id`, `title` (primary text), `project_name?`, `score := ts_rank(search_vector, tsq)*0.6 + similarity(primary_text, p_query)*0.4`, `snippet := ts_headline('english', coalesce(primary_text,'') || ' ' || coalesce(props::text,''), tsq, 'MaxFragments=2,MinWords=5,MaxWords=18')`.
- **Filters**: `created_by = p_actor_id`; optional `project_id`; optional `types`.
- **Order/limit**: `order by score desc limit least(p_limit, 50)`.

## API Contract

- **Route**: `POST /api/onto/search`
- **Req body**: `{ query: string; project_id?: string; types?: ('task'|'plan'|'goal'|'milestone'|'document'|'output'|'requirement')[] }`
- **Auth**: user session → `ensure_actor_for_user`; enforce project ownership.
- **Resp**: `{ results: [{ type, id, project_id, project_name?, title, snippet, score }], total, message }`
- **Cap**: 50 results max.

## Agent Tool

- **Name**: `search_ontology`
- **Description**: Fuzzy search across ontology tasks/plans/goals/milestones/documents/outputs/requirements. Returns IDs + snippets; follow with `get_onto_*_details`.
- **Params**: `{ query: string; project_id?: string; types?: (...above...)[] }`
- **Placement**: Tool definitions/config for `global` and `project` contexts; executor calls `/api/onto/search` and returns normalized results + guidance to fetch details.
- **Prompt hint**: Use for user-described items (“marketing plan/email brief/milestone”). If project focus known, pass `project_id`; otherwise search globally and then refine.

## Rollout & Testing

- Add migration with generated columns, indexes, and RPC.
- Add API route and wire agent tool.
- Smoke tests: seeded marketing terms in tasks/docs/requirements; validate snippets, project scoping, and result cap.
- Residual risk: semantic recall; consider pgvector/Pinecone later if lexical recall is insufficient.

## Future (optional semantic path)

- Reuse `onto_document_versions.embedding` or push embeddings to Pinecone.
- Add a semantic flag to RPC/API; backfill embeddings from `props.body_markdown` and task/plan descriptions.

## Next Steps (implementation order)

1. Migration: add search vectors/indexes + `onto_search_entities` RPC. ✅
2. API: `POST /api/onto/search`, actor resolution, project scoping. ✅
3. Agent: add `search_ontology` tool (definitions/config/executor) + prompt hint. ✅ (prompt copy still to refine if needed)
4. QA: seed test data, run smoke searches, and document outcomes here.

## Progress Log

- 2025-12-24: Authored spec; added search vectors/indexes and `onto_search_entities` RPC (`supabase/migrations/20251224000000_ontology_search_vectors.sql`).
- 2025-12-24: Implemented `/api/onto/search` and wired the `search_ontology` tool (definitions, config, executor) for global/project contexts.
