<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md -->

# S3 Read-Tool Extraction Map (tasker/51 P1, Slice 18 S3)

**Prepared:** 2026-08-08 (agent-surveyed with file:line evidence, decisive claims spot-checked).
**Authority:** `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md` §Architecture decision; payload-diff verdict in that plan's §Open questions (gateway DIVERGENT on both probe pairs → shared extraction, not allowlist-over-gateway). Libri is removed (`82a0d3705`); email/contacts/calendar/web tools and `get_linked_entities` stay OUT per the ratified P1 catalog scope.
**Status:** **S3 COMPLETE; post-S3 full-catalog extraction through T11 is in the
working tree (hosted gate verified).** The production provider catalog now comes
from the signed artifact definitions intersected with the worker's 34-tool
shared allowlist, and the differential golden uses three real tools. Migration
`20260808010000_agentic_chat_read_tool_categories.sql` was applied to the linked
project from a receipt-isolated workdir; the remote ledger records
`20260808010000`. A Management API catalog query verified the named constraint
is validated, retains every legacy category, and admits `read`/`search`. The
resulting expression contains two equivalent `read`/`search` branches,
indicating one had already been added out of band; the redundancy is
functionally harmless and did not narrow the constraint.

**Post-completion audit:** the relationship read implementation accepts only
the seven source kinds its project resolver can actually fence. The
`get_linked_entities` definition had also advertised `metric` and `source`,
which could reach an undefined resolver configuration. Those unsupported enum
values are removed from the web definition, and the shared resolver now denies
any unsupported kind before issuing a database query. A package regression
pins the fail-closed boundary.

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
      in `assertEntityAccess`, `base-executor.ts:365-367`). Fix with an explicit
      readable-project predicate and close the escape hatch under the worker adapter.
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
  and `loadOverviewProjectData:495`, 7 parallel `.in('project_id', …)` queries +
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

| #   | Tranche                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | ✅ DONE (`02f444dc1`). Pure payload builders: `activity-log-summary` + `start-here-selector` + `overview-helper` (+test) → `./tools` subpath (tsup entry + exports + both vitest aliases). Web shims in place; all gates green.                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T2  | **RESEQUENCED INTO T4 (2026-08-08):** the "pure leaves" are PRIVATE METHODS on `OntologyReadExecutor`, not free functions — extracting them first means refactoring the class twice. T4 writes them as free functions in the shared module directly; the dead outline code (`:677-781`, `:152-153`) is deleted there too.                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T3  | ✅ DONE (`67590adc3`). `tools/access-port.ts` (port type + paused predicate + sentinel) + web adapter (`executors/web-access-adapter.ts`, byte-identical legacy semantics incl. the created_by escape hatch web keeps and the worker must drop); BaseExecutor delegates, existing access tests pin it. Worker adapter lands with the worker catalog swap.                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T4  | ✅ DONE (`e2bd6b32e`). 18 reads live in `tools/ontology-reads.ts` over `{client, access}`; web class delegates (1885→690 LOC); doc-details security reorder landed with a STRENGTHENED two-select test pin; dead outline code deleted; package gained @supabase/supabase-js.                                                                                                                                                                                                                                                | ✅ Deploy-safe constraint migration proven in disposable Postgres, applied to the linked project, and verified live via `pg_constraint`: named constraint present, `convalidated = true`, legacy categories retained, `read`/`search` admitted.                                                                                                                                                                                                                                                                                                                                                                                                             |
| T5  | ✅ DONE (`906dc3d02`). Four tools in `tools/overview-reads.ts` (+`entity-field-info.ts`); change_chat_context split at the web boundary via an injected `resolveDirectToolNames` port (gateway-surface cannot move: $lib + process.env); zero expectation changes. `get_user_profile_overview` stays web pending the usage_scope decision.                                                                                                                                                                                  | ✅ Worker composition DONE (`9289fcd9e`): workerAccessAdapter (NO escape hatch, pinned) + readOnlyTool dispatch over 21 shared tools; get_project_overview now emits the LEGACY payload — divergence 1 closed at the implementation layer. ✅ **Local S3 exit DONE in the working tree:** `readOnlyProvider`/`openRouterReadOnlyClient` offer the ordered artifact definitions ∩ shared allowlist (1–21 tools), and the web/worker golden runs `get_workspace_overview` → `get_project_overview` → `list_onto_tasks` with semantic categories `read`/`read`/`search`. T6-T10 web hop collapses for full-catalog parity after.                               |
| T6  | ✅ DONE (working tree). Five UI detail GETs now delegate to `tools/ontology-detail-reads.ts`; the shared milestone loader carries the latest goal-edge lookup and the extracted `withComputedMilestoneState`, while the document UI loader retains the full route payload behind the shared access fence. The web chat executor directly calls the four newly shared agent detail functions (goal/plan/milestone/risk), so those tools no longer HTTP-hop.                                                                  | Worker allowlist expanded 21→25. Detail reads use a minimal `id, project_id` lookup, assert access before the full select, and fence the second select to the same project. The existing Svelte milestone helper is a compatibility re-export. Runtime detail tests, web no-fetch payload coverage, worker full suite, and all three type checks are green.                                                                                                                                                                                                                                                                                                 |
| T7  | ✅ DONE (working tree). `get_onto_task_details` now delegates directly to `tools/ontology-task-detail.ts`; the UI task GET calls the same loader, and the legacy task-linked helper is a compatibility wrapper for the full-task endpoint. Task row access keeps the T6 minimal-ref/full-row fence. Linked entities retain the legacy payload shape and assignee enrichment remains best-effort.                                                                                                                            | Worker allowlist expanded 25→26. The authorized `project_id` now fences the initial `onto_edges` fan-out, every linked-entity hydration query, and `onto_task_assignees`, closing the service-role exposure identified in correction 2. Runtime task-detail tests, web no-fetch/not-found coverage, worker full suite, and all type checks are green.                                                                                                                                                                                                                                                                                                       |
| T8  | ✅ DONE (working tree). `list_task_documents` now resolves the task's project, delegates access to the shared port, and loads edge-ordered document links through `tools/ontology-task-documents.ts`; the chat executor no longer calls `/api/onto/tasks/[id]/documents`. The UI GET reuses the shared edge/document loader while retaining `ensureTaskAccess` for its existing HTTP error/logging contract and leaving POST mutations untouched.                                                                           | Worker allowlist expanded 26→27. Both `onto_edges` and `onto_documents` are explicitly project-fenced; edge rows are additionally constrained to `dst_kind = document`. Scratch-pad selection and response shape remain unchanged. Runtime, worker dispatch, web no-fetch, and route-access tests are green.                                                                                                                                                                                                                                                                                                                                                |
| T9  | ✅ DONE (working tree). `get_document_tree`, `get_document_path`, and `get_onto_project_graph` now delegate to `tools/ontology-structure-reads.ts` over the shared access port and the existing shared-agent-ops loaders. The chat executor no longer calls the document-tree or full-graph UI routes; only the four T10 search aliases still use read-side HTTP hops. The UI tree/graph GETs reuse the extracted low-level payload loaders while retaining `requireProjectMemberAccess` and their existing HTTP envelopes. | Worker allowlist expanded 27→30. Inferred document paths perform the minimal document/project lookup and access check before loading the project tree; explicit project paths remain project-gated. Tree flags, node counting, legacy messages, route defaults, and the legacy unsanitized tree payload are pinned. The graph keeps completed-task filtering, internal-field stripping, metadata, and removes the route's redundant second active-project lookup. Runtime, worker dispatch, web no-fetch/route-access tests, and all type checks are green.                                                                                                 |
| T10 | ✅ DONE (working tree). The pure normalization/ranking layer now lives in `tools/ontology-search-ranking.ts`; the RPC, event, task-bucket, actor, and project-gated query pipeline lives in `tools/ontology-search.ts`. `search_all_projects`, `search_buildos`, `search_project`, and `search_ontology` delegate directly from web and worker, and the UI `POST /api/onto/search` is a thin compatibility/error envelope over the same implementation. The ontology read executor has no remaining HTTP read hops.         | Worker allowlist expanded 30→34. The existing `onto_search_entities` creator scope is deliberately preserved and explicitly pinned for workspace searches; project searches remain membership-gated before the active-project lookup and project-fenced event/task-bucket queries. Type normalization, limits, result deduplication, four boost tables, task-bucket aliases, materialized-tool hints, search telemetry for the compatibility alias, and an injectable ranking clock are covered. Runtime, worker dispatch, focused route/no-fetch tests, and all type checks are green.                                                                     |
| T11 | ✅ DONE (working tree + post-completion audit). `get_entity_relationships` now delegates to `tools/ontology-relationship-reads.ts`, which resolves a real project, asserts membership, and project-fences both edge directions. Project-less rows are denied without consulting the web adapter's legacy `created_by` escape hatch. The same shared resolver project-fences `get_linked_entities` display-name reads.                                                                                                       | The linked-context loader independently verifies the source/project pair, then repeats the project predicate on its edge fan-out and every per-kind hydration query. Neither relationship tool was added to the worker allowlist, preserving the ratified P1 catalog exclusion. Project-less creator, edge-fence, display-name-fence, hydration-fence, and unsupported-kind regressions are pinned. The advertised `metric`/`source` kinds were removed because no shared resolver exists for them; unsupported kinds now fail before database I/O. Runtime 179 passed, worker 798 passed (1 skipped), focused web 4 passed, and all type checks are clean. |

Worker side after T11: `readOnlyTool.ts` still dispatches the same 34 reviewed shared reads over
the worker access adapter; catalog = artifact tool surface ∩ shared allowlist.

## S3 exit evidence (working tree + hosted gate, 2026-08-08)

- Provider boundary at S3 exit: artifact-selected definitions are structurally
  validated, retain artifact order, reject duplicates/non-object schemas, and
  are filtered through the worker allowlist before OpenRouter receives them.
  The subsequent S4 working tree replaces the one-pass synthesis ceiling with
  the production multi-round bridge; that work is tracked in the Slice 18 plan.
- Category contract: extracted web and worker reads now persist shared
  `TOOL_METADATA` categories (`read`/`search`); legacy write and unextracted tool
  categories remain unchanged. The migration widens the existing production
  check expression rather than replacing an unobserved allowlist.
- Golden: three distinct production tools, three durable executions, three
  call/result lifecycle pairs, the full legacy project-overview envelope, and
  real entity extraction on both adapters.
- Gates: current worker full suite 801 passed (1 skipped), runtime 180 passed, and
  focused web relationship security coverage 4 passed; T10's focused ontology-search
  route/no-fetch coverage remains 13 passed. Disposable Postgres 8 passed and canary
  verifier 7 passed at S3 exit. Worker/runtime TypeScript and web `svelte-check` are clean.
- Hosted gate: an isolated dry run named only `20260808010000`; apply succeeded;
  the remote receipt is present; and the live constraint is validated with the
  legacy allowlist plus `read`/`search`.
