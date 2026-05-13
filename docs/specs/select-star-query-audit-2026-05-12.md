<!-- docs/specs/select-star-query-audit-2026-05-12.md -->

# SELECT \* Query Audit

Date: 2026-05-12

## Summary

This audit scanned the repository for query patterns that project every column:

- Supabase/PostgREST `.select('*')`
- SQL `SELECT *`
- SQL `alias.*`
- SQL `to_jsonb(alias.*)` / `jsonb_agg(to_jsonb(alias.*))`

The main issue is not every `*` equally. The waste risk is highest where a broad row projection is multiplied across many entities, then serialized into page hydration, graph payloads, or LLM/tool context.

## Scan Results

| Scope                       | Count |
| --------------------------- | ----: |
| Total textual hits          | 1,200 |
| Runtime-relevant hits       |   525 |
| Production app/package hits |   473 |
| Current SQL function hits   |    52 |

Production app/package hits:

| Pattern                                        | Count | Notes                                                                       |
| ---------------------------------------------- | ----: | --------------------------------------------------------------------------- |
| Supabase `.select('*')`                        |   441 | Main production risk surface.                                               |
| Supabase `.select('*', { count, head: true })` |    18 | Lower risk; no row body is returned, but should still use `id` for clarity. |
| Supabase `.select('*', { count })`             |    14 | Returns rows plus count; should be projected explicitly.                    |

Read query shape:

| Shape                                 | Count | Risk                                                      |
| ------------------------------------- | ----: | --------------------------------------------------------- |
| Single-row reads                      |   183 | Usually lower risk, but still leaks wide/internal fields. |
| Multi-row reads with no obvious bound |    72 | Highest payload and latency risk.                         |
| Limited reads                         |    64 | Medium risk if rows are wide.                             |
| Bounded by input IDs                  |    38 | Medium risk; depends on input size.                       |
| Paged/ranged reads                    |     6 | Usually acceptable if row width is controlled.            |

## Highest-Risk Clusters

### 1. Project Graph And Full Project Loading

Files:

- `apps/web/src/lib/services/ontology/project-graph-loader.ts`
- `apps/web/src/routes/api/onto/projects/[id]/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`
- `packages/shared-types/src/functions/get_project_full.sql`

Why this matters:

These paths load many rows across project, tasks, plans, goals, documents, milestones, risks, requirements, metrics, sources, assets, and edges. A single extra wide column on `onto_documents` or `onto_projects` becomes expensive because it is repeated across every full project load and graph response.

Current examples:

- `project-graph-loader.ts` selects `*` from most ontology tables.
- `/api/onto/projects/[id]` does the same in a parallel batch.
- `get_project_full.sql` uses `to_jsonb(row.*)` for every entity bucket.

Recommended fix:

Define explicit projections for project-page summary rows and graph rows. Document body/content should be excluded from list/graph payloads unless the caller explicitly asks for document detail or context document content.

### 2. Agent And Tool Context Payloads

Files:

- `apps/worker/src/workers/tree-agent/tools/treeAgentToolExecutor.ts`
- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`
- `apps/web/src/lib/services/ontology-context-loader.ts`
- `apps/web/src/lib/services/prompts/core/project-data-fetcher.ts`

Why this matters:

These rows can become LLM-visible context or tool output. Wide fields here are both performance cost and token cost. They also increase the chance that internal fields leak into agent-visible payloads.

Recommended fix:

Create tool/agent-specific projections instead of reusing UI/full-row loaders. These should prefer names, states, dates, IDs, short descriptions, relationship edges, and counts. Fetch document content only through explicit document-read tools with a max-character cap.

### 3. Graph Endpoints

Files:

- `apps/web/src/routes/api/onto/graph/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/graph/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/graph/full/+server.ts`
- `apps/web/src/routes/api/public/projects/[id]/graph/+server.ts`

Why this matters:

The graph visualizations only need enough row data to build nodes, edges, labels, metadata, and stats. They do not need full document bodies, search vectors, or most raw props.

Recommended fix:

Add a graph-specific loader/projection. The graph source should include entity IDs, labels, type/state fields, project IDs, date fields needed for filters, and edge fields. Avoid raw `props` unless a concrete graph feature reads a known subfield.

### 4. Admin Exports And Global Admin Views

Files:

- `apps/web/src/routes/admin/ontology/graph/+page.server.ts`
- `apps/web/src/routes/api/admin/chat/export/+server.ts`

Why this matters:

Admin-only does not mean low risk. These routes can scan or export large datasets. Broad rows make admin tools slow and can accidentally include JSON/text columns the operator did not need.

Recommended fix:

Keep export routes explicit about their export contract. For global ontology graph views, use projections plus limits, filters, or project scoping.

## Wide Column Usage Check

Question checked: in project graph/full project loading, are `onto_documents.content`, `onto_documents.props`, `search_vector`, or `icon_svg` still used?

| Field                    | Still used?                                 | Bulk graph/full-project recommendation                                                                                                                                  | Notes                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onto_documents.content` | Yes, but mostly in detail/edit paths.       | Do not include in general project document lists or graph payloads. Keep for `context_document` if the project edit modal needs it, and for document detail endpoints.  | `DocumentModal` loads full content from `/api/onto/documents/[id]/full`. `OntologyProjectEditModal` reads context document content. The project doc tree only needs a `has_content` boolean for list rendering. |
| `onto_documents.props`   | Yes, but selectively.                       | Do not include raw props in graph/list payloads by default. Keep for document detail/edit and known compatibility fallbacks like `props.body_markdown`.                 | Graph services currently attach `document.props` to node metadata, but the visible graph node components only read `typeKey` and similar explicit metadata.                                                     |
| `search_vector`          | Yes, internally in SQL search/ranking only. | Never return from app/API/tool payloads.                                                                                                                                | `onto_search_entities.sql` ranks with `search_vector`. UI-facing types already say this should be omitted. Several agent serializers already strip it.                                                          |
| `icon_svg`               | Yes, actively in project UI.                | Keep in project page/list/skeleton UI payloads where the icon is rendered. Strip from LLM/tool graph/context payloads unless a caller explicitly needs visual branding. | Project headers and project list cards render `icon_svg`. It is one row per project, so less dangerous than document content, but it is still unnecessary in agent context.                                     |

Important distinction:

`load_project_graph_context` already uses explicit SQL projections and does not include document content, document props, `search_vector`, or project `icon_svg` in its main context payload. The bulkier risk is the older/general loaders that still return whole rows.

## Recommended Fix Plan

### Fix 1: Create Projection Constants For Ontology Rows

Add shared projection strings near the graph/full-project loaders, for example:

- `PROJECT_PAGE_PROJECT_COLUMNS`
- `PROJECT_PAGE_DOCUMENT_COLUMNS`
- `GRAPH_DOCUMENT_COLUMNS`
- `GRAPH_EDGE_COLUMNS`
- `AGENT_PROJECT_OVERVIEW_COLUMNS`

Why:

Right now every caller uses `*` slightly differently. Named projections make the payload contract visible, reviewable, and reusable. They also prevent future schema additions from silently increasing response size.

### Fix 2: Split Document Summary From Document Detail

For project page and graph lists, return document summary fields:

- `id`
- `project_id`
- `title`
- `description`
- `type_key`
- `state_key`
- `children` if tree seeding still needs it
- `created_at`
- `updated_at`
- `archived_at`
- `deleted_at`
- `has_content` or a computed equivalent

Keep `content` and full `props` in document detail endpoints and explicit document-read tools.

Why:

Document content is the most obvious high-cardinality text payload. The page generally opens documents through `DocumentModal`, which fetches the full document by ID. The list/tree views need metadata, not bodies.

### Fix 3: Replace `get_project_full.sql` `to_jsonb(row.*)` Calls

Rewrite the RPC to use explicit row objects instead of `to_jsonb(p.*)` and `jsonb_agg(to_jsonb(d.*))`.

Why:

The RPC is the canonical project page loader. `to_jsonb(row.*)` makes every future column addition part of the API. That is exactly how internal columns like `search_vector` and wide columns like `content` slip into hot-path payloads.

### Fix 4: Add A Graph-Specific Loader

Create a graph loader that returns only graph-rendering fields. Use it from:

- `/api/onto/graph`
- `/api/onto/projects/[id]/graph`
- `/api/onto/projects/[id]/graph/full`
- `/api/public/projects/[id]/graph`

Why:

The graph UI needs node labels, IDs, state/type, dates for filtering, and edges. It does not need document bodies, search vectors, icon SVGs, or raw props. A graph-specific loader avoids coupling graph visualization to full project hydration.

### Fix 5: Add Agent/Tool Payload Projections

Do not feed the same full project graph payload into external agent calls or tree-agent tools. Use compact tool DTOs and explicit content-fetch tools.

Why:

Agent contexts are expensive twice: once over the network/database, then again in tokens. A broad row payload can also leak internal fields. Tools should return exactly what the tool contract promises.

### Fix 6: Clean Up Count Queries Opportunistically

Change count-only calls from `.select('*', { count: 'exact', head: true })` to `.select('id', { count: 'exact', head: true })`.

Why:

This is not the main performance issue because `head: true` returns no row body. It is still clearer and prevents copy/paste of `*` into count-with-row queries.

### Fix 7: Add A Guardrail

Add a simple CI script or lint rule that flags new `.select('*')` in production code unless it is explicitly allowlisted.

Why:

This class of issue returns gradually. A guardrail makes the default safer without requiring everyone to remember the audit.

## Priority Order

1. `get_project_full.sql` and `/api/onto/projects/[id]/full`
2. `project-graph-loader.ts` and graph endpoints
3. Agent/tool graph/context payloads
4. Legacy `/api/onto/projects/[id]` broad loader
5. Admin graph/export surfaces
6. Count-query cleanup
7. CI guardrail

## Implementation Notes

### Top 1: Full Project RPC

Implemented in:

- `packages/shared-types/src/functions/get_project_full.sql`
- `supabase/migrations/20260512000000_get_project_full_explicit_payload.sql`

What changed:

The RPC now builds every entity bucket from explicit column lists instead of `to_jsonb(row.*)`. General project document rows no longer include `onto_documents.content`; they include `has_content` so the document tree can still show whether a document has a body. The `context_document` still includes `content` because the project edit modal reads it directly.

Why this fix matters:

This is the main project page hydration path. Removing wildcard row serialization means future schema additions, especially `search_vector` or other large/internal fields, will not silently become part of the page payload.

### Top 2: Project Graph Loader

Implemented in:

- `apps/web/src/lib/services/ontology/project-graph-loader.ts`
- `apps/web/src/lib/services/ontology/project-graph-loader.test.ts`
- `apps/web/src/lib/types/onto-api.ts`
- `apps/web/src/lib/services/ontology/doc-structure.service.ts`
- `apps/web/src/lib/components/ontology/doc-tree/UnlinkedDocuments.svelte`

What changed:

The graph loader now uses named projection constants for every ontology table instead of `.select('*')`. The graph document projection excludes document `content`, every graph projection excludes `search_vector`, and the graph project projection excludes `icon_svg`. Project summary loading keeps icon fields because project list/header UI still renders them.

Why this fix matters:

The graph loader feeds visual graph endpoints and one external tool path. Keeping it lightweight reduces page/API payload size and avoids sending document bodies into graph/tool contexts unless a caller explicitly asks for document detail.

## Notes And Caveats

- `icon_svg` is real UI data, not dead data. It should be removed from non-visual contexts, not deleted globally.
- `search_vector` is real DB data, but should stay inside SQL search functions.
- `onto_documents.content` is real document data, but project graph and list payloads should not carry it by default.
- `props` is the hardest field because it is a flexible extension bag. The safer pattern is to promote known used props to explicit fields or known DTO subobjects, then leave raw props out of broad payloads.
