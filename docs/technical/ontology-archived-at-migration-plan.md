<!-- docs/technical/ontology-archived-at-migration-plan.md -->

# Ontology `archived_at` Migration Plan

## Goal

Move BuildOS ontology entities away from `deleted_at` as the normal user and agent-facing hiding mechanism. Use one simple visibility lifecycle across ontology models:

- `archived_at IS NULL`: active and included by default.
- `archived_at IS NOT NULL`: archived and hidden by default.
- `state_key`: remains the entity's domain state, not its visibility state.

This keeps agent instructions simple: archive and unarchive entities through update tools with `archived: true` or `archived: false`. Agents should not write raw archive timestamps.

## Entity Scope

Primary scope:

- `onto_projects`
- `onto_tasks`
- `onto_documents`
- `onto_goals`
- `onto_plans`
- `onto_milestones`
- `onto_risks`

Secondary follow-up scope:

- `onto_events`
- `onto_requirements`
- `onto_assets`
- comments and other supporting tables that currently use `deleted_at` for their own lifecycle

The first migration should focus on the primary ontology entities because those power project pages, search, graph, agentic chat tools, and the external agent API.

## Target Contract

### Reads

Default reads, lists, search, summaries, graphs, and context loaders must exclude archived records:

```sql
archived_at IS NULL
```

### Filters

Use one simple caller-facing filter:

```ts
archived?: boolean
```

Semantics:

- omitted: active only
- `archived: false`: active only
- `archived: true`: archived only

Do not introduce a multi-value `archive_state` enum unless product requirements later need "active + archived in one query." For internal/admin use, add that separately.

### Writes

Update tools and routes should accept:

```ts
archived: true;
archived: false;
```

Server behavior:

- `archived: true` sets `archived_at = now()`.
- `archived: false` clears `archived_at`.
- Normal update paths must be able to load archived rows when the requested operation is unarchive.
- Agents should not set `archived_at` directly.

### Existing `deleted_at`

`deleted_at` remains in place during the migration for backwards compatibility and legacy rows, but new user/agent-facing archive flows should stop writing it.

Backfill rule:

```sql
archived_at = deleted_at
```

for rows where `deleted_at IS NOT NULL` and `archived_at IS NULL`.

Future cleanup can decide whether to keep `deleted_at` only for hard-delete/compliance workflows or remove it from ontology entities after all reads have moved to `archived_at`.

## Work Areas

### 1. Database Migration

- Add `archived_at timestamptz` to primary ontology tables.
- Backfill from `deleted_at`.
- Backfill `onto_documents.archived_at` for rows with `state_key = 'archived'`.
- Add partial indexes matching current active-query patterns:
    - `(project_id, updated_at DESC) WHERE archived_at IS NULL`
    - entity-specific schedule/search indexes where needed.
- Update current database functions/RPCs that still filter `deleted_at IS NULL` for primary ontology entities:
    - project summaries
    - project skeleton/full graph loaders
    - global ontology search functions
    - fastchat context functions
    - project statistics
    - soft-delete project helper behavior

### 2. Shared Data Models

- Add `archived_at` to generated/shared DB type files until the generator is rerun.
- Add lightweight shared helpers/constants:
    - normalize `archived` query/body input.
    - apply active-only vs archived-only Supabase filters.
- Avoid changing `state_key` enums to include `archived`.
- Decide whether documents keep accepting `state_key = archived` as a legacy compatibility alias during transition.

### 3. UI Pages And Display

Project page and related ontology screens need a consistent active/archived view:

- Project overview counts should count active entities by default.
- Task, goal, plan, milestone, risk, and document lists should hide archived rows by default.
- Add an explicit archived filter/view where users need recovery/browsing.
- Existing "deleted" language in insight panels should become "archived."
- Document tree should treat `archived_at` as the archive source of truth, not document `state_key = archived`.
- Detail pages for archived entities should show an archived banner/state and allow restore where appropriate.

Likely files:

- `apps/web/src/routes/projects/[id]/+page.svelte`
- `apps/web/src/routes/api/onto/projects/[id]/+server.ts`
- `apps/web/src/lib/components/ontology/insight-panels/*`
- `apps/web/src/lib/components/ontology/doc-tree/*`
- entity edit/create modals where archive/restore actions live

### 4. UI Search

- `/api/onto/search` should default to `archived_at IS NULL`.
- Search UI should expose an archived-only filter when needed.
- Search result types should include `archived_at` so archived views can label results.
- Project graph and linked-entity lookup should ignore archived rows by default.

### 5. BuildOS Agentic Chat Tools

Internal agentic chat tools need the same simple contract:

- Read/list/search tool schemas accept `archived?: boolean`.
- Update tools accept `archived?: boolean`.
- Executors set/clear `archived_at`; they do not expose direct timestamp writes.
- Tool descriptions should tell agents that omitted `archived` means active-only.
- Prompt/tool metadata should refer to "archive/restore", not "delete", for ontology entities.

Likely files:

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts`

### 6. External API And Agent-Facing Gateway

External API should match internal tools:

- List/search defaults exclude archived rows.
- List/search accept `archived?: boolean`.
- Update operations accept `archived?: boolean` for tasks/documents/goals/plans/milestones/risks/projects.
- Do not expose delete tools as the normal agent cleanup path.
- Response payloads include `archived_at` so external agents can see state.
- Regression tests should cover:
    - default active-only behavior
    - archived-only list/search
    - archive via update
    - restore via update
    - archived row can be found for restore but not normal update by accident

Likely files:

- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`
- `apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts`
- `packages/shared-types/src/agent-call.types.ts` only if supported ops change

### 7. Activity Logging And Audit

- Archive/restore should log as update activity with clear before/after data.
- Avoid claiming an entity was deleted when it was archived.
- Existing logs with `deleted` action can remain historical.

### 8. Rollout Strategy

1. Add `archived_at` columns, backfill, and indexes.
2. Update shared types/helpers.
3. Update database functions used by project summaries/search/context.
4. Update external gateway reads and writes first because the audit exposed agent cleanup friction.
5. Update internal agentic chat tool schemas/executors.
6. Update core project UI and search UI.
7. Migrate document archive behavior from `state_key = archived` to `archived_at`.
8. Stop writing `deleted_at` from normal ontology delete/archive paths.
9. Later cleanup: remove or reserve `deleted_at` after verifying no runtime reads depend on it for primary ontology entities.

## Open Decisions

- Should `archived: true` be available on create calls, or only update calls?
- Should "show archived" UI be per-entity tab, filter chip, or project-level toggle?
- Should archived projects hide from global project switchers while still being restorable from an account/archive page?
- Do linked edges remain visible when one side is archived, or only in archived views?
- Should calendar events linked to archived tasks be archived/suppressed automatically?
