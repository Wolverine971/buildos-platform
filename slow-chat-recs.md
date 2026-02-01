<!-- slow-chat-recs.md -->

# Slow Chat Speed Reassessment (2026-02-01)

## Recheck

- Verified `slow-chat-recs2.md` exists at repo root.

## Current Critical Path (from code + DAG)

- `resolveSession` -> `resolveProjectFocus` -> `ontologyCacheService.loadWithSessionCache` -> `persistUserMessage` -> `startAgentStream`
- `loadWithSessionCache` calls `OntologyContextLoader.loadProjectContext`, which:
    - checks ownership
    - calls `load_project_graph_context` RPC
    - loads `doc_structure` and builds a document tree
- This makes TTFR dependent on the heaviest DB work and a write.

## Highest Leverage Changes (ordered)

1. Split access check from ontology load
    - Add a fast access-check RPC (ownership/membership only).
    - Then run `persistUserMessage` and `ontology load` in parallel.
    - This preserves "do not persist inaccessible requests" while removing the main gate.

2. Remove persistence from the TTFR path
    - After access-check passes, start the agent stream immediately.
    - Persist user message in the background.
    - Attach message id to stream state once it is available (or insert a provisional message).

3. Replace per-turn ontology hydration with a snapshot
    - Load a thin snapshot from a single row instead of assembling the full graph on every turn.
    - Keep full ontology load as a fallback for rare cases.

4. Defer preflight writes and optional reads
    - Batch focus metadata updates into the single metadata write at stream end.
    - Make timing-metric insert fire-and-forget (only update if insert succeeds).
    - Reduce `loadRecentMessages` select list to only the fields the model needs.

5. Cache hygiene
    - Ensure cache keys are stable and do not vary by per-request fields.
    - Consider a longer TTL for the session cache if data changes are infrequent.

## Snapshot Design Options

### Option A: Materialized view

Best when:

- You can tolerate staleness between refreshes.
- You want database-managed refreshes.

Tradeoffs:

- Refresh can be heavy; concurrent refresh requires extra setup.
- Still needs a refresh trigger or schedule.

### Option B: Snapshot table (recommended)

Best when:

- You want predictable, incremental updates.
- You want to control refresh timing (triggers, job queue, or background worker).

Tradeoffs:

- Requires a small amount of extra application or DB job logic.

## Example: project_context_snapshot table

Schema sketch (Postgres):

```
create table project_context_snapshot (
  project_id uuid primary key references onto_projects(id) on delete cascade,
  updated_at timestamptz not null default now(),
  snapshot_version int not null default 1,
  source_updated_at timestamptz,
  entity_counts jsonb not null,
  facets jsonb,
  highlights jsonb not null,
  graph_snapshot jsonb,
  document_tree jsonb,
  doc_structure jsonb,
  summary text,
  token_count int
);

create index pcs_updated_at_idx on project_context_snapshot (updated_at desc);
```

Notes:

- `entity_counts`, `highlights`, `graph_snapshot`, `document_tree` match the shape your
  `OntologyContextLoader` already produces.
- `summary` and `token_count` are optional but useful for budget-aware context selection.

## How to Generate/Update the Snapshot

1. Trigger-based invalidation
    - On changes to `onto_projects`, `onto_tasks`, `onto_docs`, `onto_edges`, etc,
      enqueue a "snapshot_refresh" job with the project id.

2. Background refresh worker
    - Worker runs the existing graph-build logic in a single place (or a dedicated RPC)
      and upserts the snapshot.

3. Read path in chat preflight
    - Replace `loadProjectContext` with `select * from project_context_snapshot where project_id = $1`.
    - Only fall back to full ontology load if snapshot is missing or stale.

## Suggested Next Implementation Step

- Add access-check RPC + parallelize persistence and ontology load.
- Add a thin snapshot read path (table-based) and wire it into `OntologyCacheService`.
