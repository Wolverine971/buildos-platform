<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md -->

# S3 Read-Tool Extraction Map (tasker/51 P1, Slice 18 S3)

**Prepared:** 2026-08-08 (agent-surveyed with file:line evidence, decisive claims spot-checked).
**Authority:** `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md` §Architecture decision; payload-diff verdict in that plan's §Open questions (gateway DIVERGENT on both probe pairs → shared extraction, not allowlist-over-gateway). Libri is removed (`82a0d3705`); email/contacts/calendar/web tools and `get_linked_entities` stay OUT per the ratified P1 catalog scope.

## Corrections to plan premises (verified)

1. **`current_actor_has_project_member_access` fails CLOSED under service role**, not
   open: `current_actor_id()` resolves via `auth.uid()` → NULL → RPC returns false
   (migration `20260514000500_add_project_member_access_helper.sql:44-71`). Every
   RPC-gated read hard-breaks on the worker rather than leaking. The actor-explicit
   twin **`actor_has_project_member_access(p_actor_id, …)` already exists in the same
   migration (`:8-42`) with `GRANT EXECUTE TO service_role` (`:78`)** — the access
   port wraps it; **no migration needed**.
2. **The real fail-OPEN surface is the unpredicated selects** (RLS-only, no explicit
   filter):
   - `get_entity_relationships` edge selects — `utility-executor.ts:1102-1106`,
     `:1119-1123` (no project predicate; reachable via the `created_by` escape hatch
     in `assertEntityAccess`, `base-executor.ts:365-367`). Fix: `.in('project_id',
     visibleProjectIds)` + close the escape hatch under the worker adapter.
   - `assertEntityAccess` existence probes (`base-executor.ts:327-331`, `:351-355`) —
     id-oracle under service role.
   - `loadAgentDocumentDetails` fetches the document body BEFORE the access check
     (`ontology-read-executor.ts:657-664` vs `:669`) — reorder in T4.
   - Route-side `resolveLinkedEntities` (`tasks/task-linked-helpers.ts:50-53`) —
     unpredicated `onto_edges` fan-out; add a project predicate in T7.
   - `getEntityDisplayName` (`utility-executor.ts:1234-1238`) — web-only path
     (`get_linked_entities`), fence from the shared package.
3. **Plan landmine 3 correction:** `get_user_profile_overview` is NOT
   `auth.uid()`-reliant — it filters `.eq('user_id', this.userId)`
   (`utility-executor.ts:320`). The real service-role risk: no
   `usage_scope`/`sensitivity` SQL predicate (fields are mapped at `:384-388`, not
   filtered; RLS policies in `20260427000000_add_user_profile_living_kb.sql:214,281`
   would have hidden rows). Decide the `never_prompt`/`profile_only` filter
   explicitly in the port before the worker exposes this tool.
4. **`onto_search_entities` is creator-scoped (`created_by = p_actor_id` in every
   branch), NOT membership-scoped** — narrower than `fetchProjectSummaries`. On the
   worker it returns fewer rows for shared projects than the web membership
   expectation. Register as a parity note before the ≥3-tool golden.
5. **Legacy `search_ontology` `offset` schema parameter is dead** — the executor
   never forwards it (`ontology-read-executor.ts:1474-1482`).
6. **Dead code — do not port:** `extractMarkdownOutline` + `normalizeHeadingText`
   (`ontology-read-executor.ts:677-781`, ~105 LOC, self-referential only).

## Tool inventory (destination: `agentic-chat-runtime/src/tools/`)

- **18 direct-Supabase reads** in `ontology-read-executor.ts` (1885 LOC): 7
  `list_onto_*`, 7 `search_onto_*` (in-memory `search_onto_projects` incl.
  broad-query rejection), `get_onto_project_details` (9 parallel queries via
  `loadCompactProjectDetails:339`), `get_onto_document_details` /
  `get_document_outline` / `read_document_section` (via
  `loadAgentDocumentDetails:654` + already-shared `document-outline`).
- **13 HTTP-hop tools → 10 routes**: 4 search aliases → `POST /api/onto/search`
  (821 LOC — the pure ranking layer `:143-530` is the load-bearing part, NOT in any
  RPC); 6 detail GETs funneling through `getDetailOrNotFound:502-528` (ONE shared
  not-found shim, not six); `list_task_documents`; doc-tree ×2 + graph (already-shared
  `getDocTree` 1396 / `loadProjectGraphData` 676 — only the auth wrapper
  `requireProjectMemberAccess` 115 LOC + envelopes need porting).
- **Utility reads**: `get_field_info` (pure `ENTITY_FIELD_INFO`, tools.config 576),
  `get_workspace_overview` / `get_project_overview` (via `loadOverviewProjectRows:453`
  + `loadOverviewProjectData:495`, 7 parallel `.in('project_id', …)` queries +
  pure `overview-helper.ts` 863), `change_chat_context` (calls getProjectOverview +
  pure gateway-surface names).
- Already shared in `@buildos/shared-agent-ops` (reuse): doc-structure 1396,
  project-graph-loader 676, ontology-projects.service 580 (`ensureActorId`,
  `fetchProjectSummaries`), document-outline 245, `op-execution-gateway.access.ts`
  131 (`loadVisibleProjects` worker pattern), search-filter 67.
- The `paused`-project filter appears identically at `ontology-read-executor.ts:134`,
  `utility-executor.ts:462`, `access.ts:74-76` — fold into ONE port function.
- Behavior-pinning tests to carry: ~2340 LOC (overview 578+395, read-executor
  payload/search/access/outline suites, doc-tree 289).

## Ordered worklist

| # | Tranche | Notes |
|---|---|---|
| T1 | ✅ DONE (`02f444dc1`). Pure payload builders: `activity-log-summary` + `start-here-selector` + `overview-helper` (+test) → `./tools` subpath (tsup entry + exports + both vitest aliases). Web shims in place; all gates green. | |
| T2 | **RESEQUENCED INTO T4 (2026-08-08):** the "pure leaves" are PRIVATE METHODS on `OntologyReadExecutor`, not free functions — extracting them first means refactoring the class twice. T4 writes them as free functions in the shared module directly; the dead outline code (`:677-781`, `:152-153`) is deleted there too. | |
| T3 | ✅ DONE (`67590adc3`). `tools/access-port.ts` (port type + paused predicate + sentinel) + web adapter (`executors/web-access-adapter.ts`, byte-identical legacy semantics incl. the created_by escape hatch web keeps and the worker must drop); BaseExecutor delegates, existing access tests pin it. Worker adapter lands with the worker catalog swap. | |
| T4 | ✅ DONE (`e2bd6b32e`). 18 reads live in `tools/ontology-reads.ts` over `{client, access}`; web class delegates (1885→690 LOC); doc-details security reorder landed with a STRENGTHENED two-select test pin; dead outline code deleted; package gained @supabase/supabase-js. | **Prod `pg_constraint` diff on `chat_tool_executions_tool_category_check` still owed BEFORE the worker emits `read`/`search`** (ops check, gates the live run not local code). |
| T5 | ✅ DONE (`906dc3d02`). Four tools in `tools/overview-reads.ts` (+`entity-field-info.ts`); change_chat_context split at the web boundary via an injected `resolveDirectToolNames` port (gateway-surface cannot move: $lib + process.env); zero expectation changes. `get_user_profile_overview` stays web pending the usage_scope decision. | **NEXT critical path to S3 exit: worker access adapter (loadVisibleProjects + actor_has_project_member_access, NO created_by escape hatch) + readOnlyTool.ts catalog swap (artifact surface ∩ shared allowlist = the 22 shared tools) + the ≥3-real-tool golden.** T6-T10 (web HTTP-hop collapses) are for full-catalog parity, not the exit gate. |
| T6 | Five simple detail routes → direct calls (goals/plans/risks/milestones/documents). Milestones carry the goal-edge lookup + `withComputedMilestoneState` (68). Documents carry `ensureDocumentAccess`. Routes stay for UI, call shared impl. | |
| T7 | `get_onto_task_details`: port `resolveLinkedEntities` (242, + ADD project predicate) and `fetchTaskAssigneesMap`/`attachAssigneesToTask` (task-assignment.service `:214-283`). | |
| T8 | `list_task_documents` + `ensureTaskAccess` (RPC → port). | |
| T9 | doc-tree ×2 + graph: port `requireProjectMemberAccess` + envelopes; heavy deps already shared. | Pinned by doc-tree tests (289). |
| T10 | `POST /api/onto/search` (821): pure ranking layer first (`normalizeSearchResult`, `rankSearchResult`, 4 boost tables, bucket aliases, `dedupeSearchRows`), then the two JS search passes (events/buckets) + actor/project gate. 4 tool hops collapse. | Register the `created_by`-scope narrowing (correction 4) first. |
| T11 | `get_entity_relationships` fail-open fix (predicate + escape-hatch close). | In or after T5. |

Worker side after T5+: `readOnlyTool.ts` (259) swaps `runGatewayReadOp` for the
shared implementations + worker access adapter; catalog = artifact tool surface ∩
shared allowlist.
