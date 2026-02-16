<!-- docs/reports/codebase-slop-audit-2026-02-15.md -->

# BuildOS Codebase Slop Audit

Date: 2026-02-15

## Scope and Method

This audit reviewed:

- API routes in `apps/web/src/routes/api`
- Web services in `apps/web/src/lib/services`
- Worker systems in `apps/worker/src`
- Data model and migration surfaces (`packages/shared-types`, `supabase/migrations`)
- Major frontend route/components with high LOC

Method used:

- Static architecture scan (file counts, line counts, hotspots)
- Pattern scans (`any`, `console.*`, auth/access patterns, response format patterns)
- Targeted read-through of the highest-risk files

## Executive Summary

The codebase has strong ambition and useful abstractions, but complexity has concentrated into a handful of very large modules and endpoints. The largest risks are:

1. A critical fail-open authorization path in Fast Chat V2.
2. Multiple god-files (2k+ LOC) combining transport, domain, orchestration, and persistence concerns.
3. Contract drift (multiple API response schemas, old/new compatibility layers still active).
4. Legacy + ontology dual-path logic still deeply embedded in runtime code.

The short version: there are good building blocks, but system behavior currently depends on a few oversized files that are hard to reason about, hard to test, and easy to regress.

## Quantitative Snapshot

- API route handlers: `297` (`apps/web/src/routes/api/**/+server.ts`)
- API route tests: `23` (`apps/web/src/routes/api/**/*.{test,spec}.ts`)
- Web service files: `275` (`apps/web/src/lib/services/**/*.ts`)
- Web tests under services: `33` (`apps/web/src/lib/services/**/*.{test,spec}.ts`)
- Worker tests: `14` (`apps/worker/tests/**/*.test.ts`)
- API routes >=500 LOC: `20`
- Web services >=1000 LOC: `27`
- Svelte components >=1000 LOC: `22`
- `any` occurrences:
    - API routes: `523`
    - Web services: `1010`
    - Worker: `225`
- `console.*` occurrences:
    - API routes: `898`
    - Web services: `951`
    - Worker: `492`
- API routes using shared `ApiResponse` helper: `288/297` (9 bypass it)
- API routes using Zod validation: `1/297`

## Findings (Prioritized)

### P0 - Critical Security: Fail-Open Access Check in Fast Chat V2

The Fast Chat V2 endpoint allows project context access when the authorization RPC fails.

Evidence:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:114` logs `allowing fast path` on RPC failure.
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:124` returns `{ allowed: true, reason: 'rpc_failed' }`.
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:129` logs `allowing fast path` on exception.
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:139` returns `{ allowed: true, reason: 'exception' }`.

This is especially risky because this check gates project-scoped context usage:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1448`

Contrast: V1 stream access-check is fail-closed with fallback lookup:

- `apps/web/src/routes/api/agent/stream/services/access-check.ts:69`
- `apps/web/src/routes/api/agent/stream/services/access-check.ts:91`
- `apps/web/src/routes/api/agent/stream/services/access-check.ts:100`

Recommendation:

- Make V2 fail-closed immediately.
- Reuse V1 `AccessCheckService` directly or port its fallback logic.

### P1 - Endpoint God Objects and Responsibility Collapse

Several routes are doing too much in one file and one request handler.

Top examples:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts` (`2089` LOC)
    - Also has `46+` local helper functions before `POST` starts (`...:1272`).
- `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts` (`1280` LOC)
    - Includes task update logic, phase reassignment, calendar scheduling, recurrence behavior, sync messaging, deletion helpers.
- Multiple ontology CRUD routes are each `500-748` LOC:
    - `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:1`
    - `apps/web/src/routes/api/onto/projects/[id]/+server.ts:1`
    - `apps/web/src/routes/api/onto/documents/[id]/+server.ts:1`
    - `apps/web/src/routes/api/onto/plans/[id]/+server.ts:1`
    - `apps/web/src/routes/api/onto/risks/[id]/+server.ts:1`
    - `apps/web/src/routes/api/onto/milestones/[id]/+server.ts:1`

Smell indicators:

- Transport + auth + orchestration + domain + persistence mixed in single handler.
- High use of raw `any` and `console` within endpoint logic.

Recommendation:

- Introduce endpoint-level “command handlers” (one command per action path).
- Keep route files to auth + decode + call command + map response.

### P1 - Agent Orchestration Complexity Is Still Centralized

There is visible decomposition work in `/api/agent/stream`, but complexity remains very high in core orchestration services.

Hotspots:

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts` (`2626` LOC)
- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` (`2533` LOC)
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts` (`2097` LOC)
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts` (`1814` LOC)

Notable drift:

- V1 endpoint claims “thin orchestrator”:
    - `apps/web/src/routes/api/agent/stream/+server.ts:13`
- But V2 endpoint header claims “no tools/planner” while it imports tool execution and emits tool events:
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:8`
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:32`
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts:668`

Recommendation:

- Define explicit orchestration boundaries by lifecycle phase:
    - preflight/access
    - context assembly
    - planning/tool loop
    - streaming protocol adapter
    - persistence/reconciliation

### P1 - Request/Response Contract Drift

There are multiple competing API response contracts in use.

Examples:

- Shared package response contract:
    - `packages/shared-types/src/api-types.ts:3`
- Web type response contract:
    - `apps/web/src/lib/types/index.ts:286`
    - `apps/web/src/lib/types/api-responses.ts:32`
- Client-side response contract:
    - `apps/web/src/lib/utils/api-client.ts:4`
- Server response helper:
    - `apps/web/src/lib/utils/api-response.ts:102`

Backward-compat parser confirms drift is actively handled in runtime:

- `apps/web/src/lib/utils/api-client-helpers.ts:17`
- `apps/web/src/lib/utils/api-client-helpers.ts:45`

Also `README` says all endpoints must use `ApiResponse`, but 9 routes do not.

- Rule in docs: `README.md:96`
- Non-conforming routes include:
    - `apps/web/src/routes/api/public/projects/+server.ts`
    - `apps/web/src/routes/api/agent/google-calendar/+server.ts`
    - `apps/web/src/routes/api/llm-usage/summary/+server.ts`
    - `apps/web/src/routes/api/braindumps/stream/+server.ts`
    - `apps/web/src/routes/api/admin/revenue/export/+server.ts`
    - `apps/web/src/routes/api/projects/[id]/tasks/unschedule-all/+server.ts`
    - `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/calendar-status/+server.ts`
    - `apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts`
    - `apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts`

Recommendation:

- Choose one canonical API envelope in `@buildos/shared-types`.
- Generate/derive web/client response types from it.
- Remove old-format parsing path after migration window.

Remediation update (2026-02-16):

- Canonical JSON envelope was aligned to `@buildos/shared-types` and web types now derive from it.
- Client parser legacy fallback for old direct-data responses was removed; JSON consumers now expect the envelope contract.
- JSON route outliers were migrated to `ApiResponse` (`/api/public/projects`, `/api/llm-usage/summary`, `/api/calendar`, `/api/daily-briefs/progress`, and JSON error paths in `/api/admin/revenue/export`; `/api/agent/google-calendar` GET is now wrapped).
- Remaining non-wrapped API routes are protocol-native by design:
    - SSE stream: `/api/braindumps/stream`
    - Tracking pixel/redirect: `/api/email-tracking/[tracking_id]`, `/api/email-tracking/[tracking_id]/click`
    - MCP/JSON-RPC transport: `/api/agent/google-calendar` POST
- Documentation was updated to codify this policy: use `ApiResponse` for JSON routes, allow protocol-native responses for non-JSON transports.

### P1 - Validation Is Not Enforced at API Edge

Schema validation is near-absent at route boundaries.

- API routes using Zod: `1/297`
- Only detected route: `apps/web/src/routes/api/admin/migration/errors/+server.ts`

Most routes parse raw JSON directly or via permissive helper:

- `apps/web/src/lib/utils/api-response.ts:247` (`parseRequestBody<T=any>` returns `null` on parse fail)

Recommendation:

- Add endpoint schema requirement (request and response) for all write routes first.
- Use shared validators per domain entity (task/project/document/etc).

### P1 - Legacy/Ontology Dual-Path Debt Is Still in Runtime Paths

Migration is incomplete and logic is mixed at runtime, increasing complexity and risk.

Examples:

- Brief endpoint prefers ontology, then falls back to legacy tables:
    - `apps/web/src/routes/briefs/+server.ts:104`
    - `apps/web/src/routes/briefs/+server.ts:139`
    - `apps/web/src/routes/briefs/+server.ts:224`
- Calendar service dual-write to ontology while reading legacy mappings:
    - `apps/web/src/lib/services/calendar-service.ts:1988`
    - `apps/web/src/lib/services/calendar-service.ts:2012`
- Mapping tables actively referenced across migration/runtime code:
    - `apps/web/src/lib/services/ontology/legacy-mapping.service.ts`
    - `apps/web/src/lib/services/calendar-service.ts:1995`

Recommendation:

- Move dual-path behavior behind explicit adapters.
- Introduce a deprecation schedule and cutover gates per domain.

### P2 - Type Safety Erosion and Layering Violations

High `any` usage is concentrated in critical paths.

- Top API file by `any`: `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts` (39 hits)
- Top service by `any`: `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts` (91 hits)

Layering violation found in server route:

- `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts:9`
- Imports UI store `toastService` and invokes it in server code at `...:56`.

Recommendation:

- Ban `any` in route handlers and core orchestrators first.
- Add lint rule to disallow `$lib/stores/*` imports in `+server.ts`.

### P2 - Logging/Observability Inconsistency

Structured logger exists but is used inconsistently.

- `createLogger(...)` usage in API routes: `6` files.
- Raw `console.*` usage in API routes/services/worker is very high.

Debug behavior left enabled in runtime path:

- `apps/web/src/lib/services/calendar-analysis.service.ts:156` (`DEBUG_LOGGING = true`)

Recommendation:

- Standardize on one logger and metadata schema.
- Make debug logging environment-driven only.

### P2 - Worker Complexity Concentrated in Large Switch and Entry Module

Worker has several large operational modules with mixed concerns.

Hotspots:

- `apps/worker/src/workers/tree-agent/tools/treeAgentToolExecutor.ts` (`2586` LOC, `55` switch cases)
- `apps/worker/src/workers/brief/briefGenerator.ts` (`1825` LOC)
- `apps/worker/src/scheduler.ts` (`748` LOC)
- `apps/worker/src/index.ts` (`724` LOC)

`index.ts` currently mixes bootstrap, auth, route definitions, queue APIs, and process handlers.

- `apps/worker/src/index.ts:26`
- `apps/worker/src/index.ts:196`
- `apps/worker/src/index.ts:662`

Recommendation:

- Split worker entrypoint into:
    - app factory (middleware + routes)
    - bootstrap/lifecycle
    - queue API module

### P2 - Frontend Route/Component Monoliths

Large UI files are blending data orchestration and view concerns.

Examples:

- `apps/web/src/routes/projects/[id]/+page.svelte` (`2676` LOC)
- `apps/web/src/routes/projects/+page.svelte` (`1295` LOC)
- `apps/web/src/lib/components/agent/AgentChatModal.svelte` (`4461` LOC)
- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte` (`704` LOC)

These files include state machines, fetch orchestration, error handling, and rendering in one unit.

Recommendation:

- Extract page controllers (`.ts`) and keep Svelte files mostly declarative.
- Extract list/filter/sort and mutation handlers into composable modules.

### P3 - Documentation Drift

Root docs links are stale:

- `README.md:111` references `docs/ARCHITECTURE.md` (missing)
- `README.md:112` references `MIGRATION_GUIDE.md` (missing)

Confirmed missing:

- `docs/ARCHITECTURE.md` not present
- `MIGRATION_GUIDE.md` not present

Architecture docs actually live in `docs/architecture/`.

## What Is Well Done

1. Shared-response helper adoption is high.

- `ApiResponse` is used in `288/297` API routes.
- Utility supports common statuses and cache/etag controls: `apps/web/src/lib/utils/api-response.ts:102`.

2. Strong testing around some critical stream semantics.

- Stream handler test enforces `error` then `done`, and closure behavior:
    - `apps/web/src/routes/api/agent/stream/services/stream-handler.test.ts:66`
    - `apps/web/src/routes/api/agent/stream/services/stream-handler.test.ts:101`

3. Good performance intent in request/session pipeline.

- Session memoization and lazy token loading in hooks:
    - `apps/web/src/hooks.server.ts:90`
    - `apps/web/src/hooks.server.ts:126`
    - `apps/web/src/hooks.server.ts:196`

4. Shared database types are in place and broadly used.

- Generated DB enums/types in `packages/shared-types/src/database.types.ts`.
- Worker queue types explicitly re-export DB enums as SoT:
    - `packages/shared-types/src/queue-types.ts:5`

5. Some complex worker scheduling logic is covered by detailed tests.

- `apps/worker/tests/scheduler.comprehensive.test.ts:8`

## Refactor Roadmap

### Phase 0 (Immediate: 1-3 days)

1. Fix Fast Chat V2 fail-open access control.
2. Remove server-side `toastService` usage from API routes.
3. Turn off hard-coded debug logging defaults in prod paths.
4. Add guardrails:
    - forbid `$lib/stores/*` imports in `+server.ts`
    - forbid new route files > 400 LOC

### Phase 1 (1-2 weeks): API Boundary Standardization

1. Introduce endpoint toolkit:
    - `requireAuthActor`
    - `requireProjectAccess`
    - request schema parse/validation
    - canonical response wrapper
2. Migrate the 9 non-conforming routes to canonical API envelope.
3. Make schema validation mandatory on write endpoints.

### Phase 2 (2-4 weeks): Break Up High-Risk God Files

1. Split `api/agent/v2/stream` by lifecycle modules.
2. Split `projects/[id]/tasks/[taskId]` into command handlers:
    - patch task fields
    - recurrence operations
    - calendar sync orchestration
    - delete/cleanup
3. Refactor large ontology CRUD routes into shared entity services + thin route adapters.

### Phase 3 (3-6 weeks): Data Model Convergence

1. Introduce explicit adapters for legacy-vs-ontology reads/writes.
2. Remove runtime fallback branches by domain once migration complete.
3. Publish deprecation checklist for legacy tables (`daily_briefs`, `project_daily_briefs`, etc.).

### Phase 4 (4-8 weeks): Worker Decomposition

1. Replace `treeAgentToolExecutor` switch with registry-based command handlers.
2. Split worker `index.ts` into app composition + lifecycle bootstrap.
3. Add focused tests for:
    - tree-agent tool execution
    - worker route auth
    - queue endpoint behaviors

## Suggested Refactor Targets (First 10)

1. `apps/web/src/routes/api/agent/v2/stream/+server.ts`
2. `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`
3. `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
4. `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
5. `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
6. `apps/web/src/lib/services/chat-context-service.ts`
7. `apps/web/src/lib/services/calendar-service.ts`
8. `apps/worker/src/workers/tree-agent/tools/treeAgentToolExecutor.ts`
9. `apps/worker/src/index.ts`
10. `apps/web/src/routes/projects/[id]/+page.svelte`

## Appendix: Additional Notable Signals

- Auth/access boilerplate is heavily duplicated:
    - routes calling `safeGetSession()`: `279`
    - routes calling `ensure_actor_for_user`: `42`
    - references to `current_actor_has_project_access`: `78`
- Ontology API surface is broad and heavy:
    - `67` ontology API route files
    - `18,488` total LOC under `apps/web/src/routes/api/onto`
    - `10` ontology route files >=500 LOC
- API guidance drift in docs:
    - `README.md:96` says all endpoints must use `ApiResponse`; codebase is close but not fully compliant.
