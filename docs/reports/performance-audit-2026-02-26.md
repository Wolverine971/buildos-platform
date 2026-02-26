# BuildOS Performance Audit (Dashboard + Projects)

Date: 2026-02-26

## Scope
- Primary focus: authenticated dashboard (`/`) and projects experience (`/projects`, `/projects/[id]`).
- Also reviewed: server hooks, global layout load path, project APIs, and client bundle shape.

## Executive Summary
- Anonymous page-load latency is very fast locally (warm requests around ~1-2ms server total), but this does **not** represent authenticated real-world load.
- The main performance risk is on authenticated paths: query fan-out in dashboard/projects loads and globally attached layout work on every authenticated page.
- Client payload for projects routes is still heavy, with large shared JS and large global CSS (`~250KB` raw) included in initial route bundles.
- Biggest improvement opportunities are:
  - Collapse dashboard query fan-out into fewer RPCs/materialized summaries.
  - Remove duplicated client fetches on project detail hydration.
  - Reduce initial project detail JS by lazy-loading graph/edit modal code.
  - Gate or cache global billing/invite/webhook work done in `+layout.server.ts`.

## Implementation Progress (2026-02-26)

### Overall Progress
- P0 batch scope delivered: **4/4 complete (100%)**
- Additional `/projects/[id]` payload pass started and delivered: **6 lazy-load moves complete**

### Delivered So Far
- ✅ Removed duplicate members fetch on `/projects/[id]` initial load path.
- ✅ Reordered `/projects/[id]/+page.server.ts` to load skeleton first, then resolve access.
- ✅ Preserved access semantics and added server timing labels for access/skeleton phases.
- ✅ Added targeted server tests for owner/editor/viewer/not-found/order behavior.
- ✅ Lazy-loaded project graph modal section.
- ✅ Batch 2 lazy-loaded additional non-critical `/projects/[id]` code paths:
  - `TaskEditModal`
  - `MobileCommandCenter`
  - `ProjectBriefsPanel`
  - `ProjectActivityLogPanel`
  - `ImageAssetsPanel`
  - `ProjectCollaborationModal`

### `/projects/[id]` JS Payload Progress
| Milestone | Route-only JS (raw) | Delta vs Baseline |
|---|---:|---:|
| Baseline | 1613.7KB | — |
| After Batch 1 | 1417.0KB | -196.7KB |
| After Batch 2 | 1197.5KB | -416.2KB |

Status:
- Required gate (`>=120KB` JS reduction) is exceeded.

## Methodology
- Built production artifacts:
  - `pnpm --filter @buildos/web run build`
- Ran preview with timing headers:
  - `PERF_TIMING=true PERF_LOG_SLOW=true PERF_SLOW_MS=10 pnpm --filter @buildos/web preview --host 127.0.0.1 --port 4175`
- Benchmarked endpoints via `curl` (10-run and 25-run samples).
- Audited hot code paths and data-access patterns in:
  - `apps/web/src/hooks.server.ts`
  - `apps/web/src/routes/+layout.server.ts`
  - `apps/web/src/routes/+page.server.ts`
  - `apps/web/src/lib/services/dashboard/user-dashboard-analytics.service.ts`
  - `apps/web/src/lib/services/ontology/ontology-projects.service.ts`
  - `apps/web/src/routes/projects/+page.server.ts`
  - `apps/web/src/routes/projects/[id]/+page.server.ts`
  - `apps/web/src/routes/projects/[id]/+page.svelte`
  - `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`

## Runtime Results (Local)

### Header snapshot
- `/`: `200`, `content-length: 53055`, `server-timing: auth.session;dur=0.1, request;dur=6.4`
- `/projects`: `303` redirect to `/auth/login`, `server-timing: auth.session;dur=0.1, request;dur=0.2`
- `/__data.json`: `200`, `content-length: 476`, `cache-control: private, no-store`, `request;dur=0.7`
- `/projects/__data.json`: `200`, `content-length: 44`, `cache-control: private, no-store`, `request;dur=0.3`

### 25-run timing aggregates
| Endpoint | Avg total | P95 total | Min | Max |
|---|---:|---:|---:|---:|
| `/` | 0.001882s | 0.003280s | 0.001126s | 0.004484s |
| `/projects` | 0.000918s | 0.001104s | 0.000655s | 0.001133s |
| `/__data.json` | 0.000901s | 0.001190s | 0.000518s | 0.001293s |
| `/projects/__data.json` | 0.000970s | 0.001332s | 0.000673s | 0.001385s |

### Slow-request logging
- Captured: `[Perf] GET / slow: request=24.3ms`

Notes:
- These timings are anonymous-path local preview timings only.
- Authenticated dashboard/projects DB load is expected to be materially higher.

## Findings

### 1) Global authenticated layout does expensive work on every page
Evidence:
- `apps/web/src/routes/+layout.server.ts:66` runs `Promise.all` for pending invites, onboarding progress, and billing context for all authenticated requests.
- `apps/web/src/routes/+layout.server.ts:57` also triggers `checkAndRegisterWebhookIfNeeded(...)` in background.
- Billing path fans out further via `fetchBillingContext` and `checkUserSubscription` (`apps/web/src/lib/server/billing-context.ts:116`).

Impact:
- Adds constant DB/RPC pressure across all authenticated pages, including dashboard/projects.

### 2) Dashboard analytics has high query fan-out
Evidence:
- `apps/web/src/routes/+page.server.ts:42` calls `getUserDashboardAnalytics(...)`.
- `apps/web/src/lib/services/dashboard/user-dashboard-analytics.service.ts:291` launches 13 parallel queries after project summary fetch.
- Upstream `fetchProjectSummaries` itself issues multiple queries (`apps/web/src/lib/services/ontology/ontology-projects.service.ts:89`, `115`, `197`).

Impact:
- High DB concurrency and potential tail-latency spikes for authenticated home loads.

### 3) Project summary “last activity” logic over-fetches
Evidence:
- `fetchProjectSummaries` computes latest task/goal/plan/document update by querying each whole table scoped to project IDs, ordered by update time (`apps/web/src/lib/services/ontology/ontology-projects.service.ts:167-195`).

Impact:
- Expensive as project/entity counts scale; can become one of the dominant DB costs.

### 4) Project detail server load does extra pre-check queries before skeleton RPC
Evidence:
- `apps/web/src/routes/projects/[id]/+page.server.ts:114` runs 4 access/membership queries in parallel.
- Then separately calls `get_project_skeleton` (`:174`).
- `get_project_skeleton` already performs access check internally (`supabase/migrations/20260426000005_remove_onto_decisions_from_active_rpcs.sql:41`).

Impact:
- Additional DB round-trips before first meaningful response.

### 5) Project full endpoint comments are stale vs actual query behavior
Evidence:
- Header comment says single-RPC optimized path (`apps/web/src/routes/api/onto/projects/[id]/full/+server.ts:4-8`).
- Actual endpoint performs extra queries after RPC:
  - actor resolution (`:91`)
  - milestone edge decoration (`:146`; query in `milestone-decorators.ts:48`)
  - doc_structure fetch (`:153`)
  - assignee map (`:172`)
  - relevance map (`:182`)

Impact:
- Misleading performance assumptions; route may be slower than expected under load.

### 6) Duplicate project member fetch on skeleton path
Evidence:
- `apps/web/src/routes/projects/[id]/+page.svelte:416` calls `loadProjectMembers()` in `onMount`.
- `apps/web/src/routes/projects/[id]/+page.svelte:390` calls it again after hydration.

Impact:
- Unnecessary extra API call on project detail load path.

### 7) Client bundle pressure on projects is still high
Largest client chunks (raw):
- `Cb0ykDI6.js` `1,389,400` bytes (`swagger-ui-bundle`, dynamic)
- `SiiF3fT1.js` `1,077,387` bytes (`@antv/g6`, dynamic)
- `C-PLbmWv.js` `554,426` bytes (`RichMarkdownEditor`)
- `0kUEkgFE.js` `536,779` bytes (`cytoscape-dagre`)
- `BqSqMOV3.js` `477,385` bytes (`ui-vendor`)

Route payload estimates (from Vite manifest graph, raw JS+CSS):
| Route | Route-only JS | Route-only CSS | Route-only Total | Total incl. baseline |
|---|---:|---:|---:|---:|
| `/` | 1233.0KB | 255.6KB | 1488.6KB | 1510.0KB |
| `/projects` | 1212.6KB | 254.3KB | 1467.0KB | 1488.4KB |
| `/projects/[id]` | 1613.7KB | 266.3KB | 1880.0KB | 1901.4KB |

Important preload evidence from `/` response:
- Large preload/modulepreload list includes `_app/immutable/assets/0.BD2tFLrD.css` and many JS modules.

Impact:
- Slower parse/execute on lower-end devices and under real network constraints.
- Projects detail route carries significant initial JS for code paths not always used.

### 8) Project detail statically imports graph code even when graph modal is closed
Evidence:
- `apps/web/src/routes/projects/[id]/+page.svelte:96` static imports `ProjectGraphSection`.
- `ProjectGraphSection` statically imports `OntologyGraph` (`apps/web/src/lib/components/ontology/ProjectGraphSection.svelte:20`).
- Graph is only rendered when modal opens (`apps/web/src/routes/projects/[id]/+page.svelte:3148`).

Impact:
- Increases initial `/projects/[id]` bundle cost without immediate user value.

### 9) Index coverage gap for `updated_at`-ordered project entity scans
Evidence:
- Partial active indexes exist for `project_id` (`supabase/migrations/20260116_ontology_brief_query_indexes.sql:4-14`).
- But dashboard/project summaries frequently do `WHERE project_id IN (...) AND deleted_at IS NULL ORDER BY updated_at DESC` (service code above), and no matching `(project_id, updated_at)` partial indexes were found.

Impact:
- Likely unnecessary sort/scan cost at scale.

### 10) Complexity hotspots correlate with perf risk
Evidence:
- Guardrail fail: `src/routes/api/onto/tasks/create/+server.ts` oversized (470 lines).
- Largest route handler files include `api/agent/v2/stream/+server.ts` (2615 lines), `api/onto/tasks/[id]/+server.ts` (865), `api/onto/projects/[id]/+server.ts` (755).
- Large UI files include `AgentChatModal.svelte` (4426 lines), `projects/[id]/+page.svelte` (3158), `projects/+page.svelte` (1342).

Impact:
- Harder to reason about hotspots and prevent regressions.

## Prioritized Optimization Plan

### P0 (Immediate, high ROI)
1. Remove duplicate members fetch on project detail skeleton path.
- Change: call `loadProjectMembers()` once (post-hydration or guarded by state).
- Expected: removes one API call per project detail load.

2. Stop static-loading graph section for `/projects/[id]` initial render.
- Change: lazy import `ProjectGraphSection` inside modal block (`{#await import(...)}` pattern already used elsewhere in file).
- Expected: smaller initial route JS and faster TTI.

3. Reduce pre-skeleton access query fan-out in `/projects/[id]/+page.server.ts`.
- Change: rely on `get_project_skeleton` access gating and only fetch additional privileges if strictly needed for initial shell.
- Expected: fewer DB round-trips before first render.

4. Add per-query timing around dashboard fan-out and project summary latest-update queries in production.
- Change: keep `Server-Timing` enabled in controlled environments and sample in logs.
- Expected: faster identification of true DB bottlenecks.

### P1 (Near-term)
1. Collapse dashboard analytics into one or two RPCs.
- Replace many discrete counts/recent queries with a server-side aggregate function that returns snapshot + recents together.

2. Replace `fetchProjectSummaries` latest-activity over-fetch with DB-native aggregate.
- Options: materialized `last_activity_at` on `onto_projects`, trigger-maintained field, or grouped `max(updated_at)` subqueries.

3. Add composite partial indexes for update-ordered entity access patterns.
- Candidate examples:
  - `onto_tasks(project_id, updated_at DESC) WHERE deleted_at IS NULL`
  - same for `onto_goals`, `onto_plans`, `onto_documents`

4. Gate `+layout.server.ts` global work by route and freshness.
- Move billing/invite loads behind route needs or short-lived cache windows.

### P2 (Hardening)
1. Set budgets and CI checks for route bundle size and server query counts.
2. Break up large route handlers/components into smaller units with localized data loaders.
3. Run authenticated synthetic benchmarks (k6/Playwright) against representative dataset and record P50/P95 budgets.

## Validation Checklist After Fixes
- Dashboard authenticated load:
  - measure `Server-Timing` for dashboard subqueries before/after.
  - confirm reduced DB query count and lower P95.
- Projects list/detail:
  - confirm reduced `/projects/[id]` initial JS payload.
  - verify no duplicate members API call.
  - verify no regressions in graph modal and task editing UX.
- Global layout:
  - verify fewer unconditional queries on non-billing pages.

## Constraints / Gaps
- No authenticated test credentials were available in this run, so latency numbers are anonymous-path only.
- Real production behavior still requires authenticated benchmark passes with realistic workspace sizes.
