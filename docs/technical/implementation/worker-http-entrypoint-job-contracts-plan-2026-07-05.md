<!-- docs/technical/implementation/worker-http-entrypoint-job-contracts-plan-2026-07-05.md -->

# Worker HTTP Entrypoint and Job Contracts Plan

Date: 2026-07-05

Source audit: `docs/technical/reviews/api-service-quality-audit-2026-07-03.md`

## Scope

This plan covers the worker HTTP entrypoint, queue job metadata contracts, and the first validation sweep for mutation endpoints. The goal is to make request parsing and queue metadata validation more explicit without changing runtime behavior unnecessarily.

The primary files involved are:

- `apps/worker/src/index.ts`
- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/src/workers/shared/queueUtils.ts`
- `packages/shared-types/src/queue-types.ts`
- `packages/shared-types/src/validation.ts`
- Web enqueue callers under `apps/web/src/lib/server` and `apps/web/src/routes/api`

## Current State

`apps/worker/src/index.ts` is the main worker HTTP entrypoint. It currently owns Express setup, CORS, worker auth, health checks, route handlers, request validation, queue metadata construction, scheduler startup, worker startup, and graceful shutdown.

`SupabaseQueue.add()` writes the provided job data directly into `queue_jobs.metadata`. The queue processor later passes `queue_jobs.metadata` to job processors as `job.data`.

The repo already has TypeScript interfaces for queue metadata in `@buildos/shared-types`, plus hand-written validators in `packages/shared-types/src/validation.ts`. Usage is uneven: some processors validate, some enqueue paths validate, and several direct `add_queue_job` calls build metadata inline.

The web app already has a zod-backed JSON request helper at `apps/web/src/lib/utils/request-validation.ts`. Some admin and account routes already use it, but many mutation routes still parse JSON directly.

## Design Principles

- Validate at boundaries only: HTTP body, direct queue enqueue, and processor start.
- Keep schemas side-effect-free and fast. No database reads, network calls, or async refinement inside schemas.
- Preserve existing worker route paths and response shapes during extraction.
- Make route files thin adapters around typed helpers.
- Prefer `400` for malformed JSON and `422` for structurally invalid JSON.
- Roll out processor validation in a legacy-tolerant way so already queued jobs do not fail unexpectedly.
- Avoid pulling zod into broad browser imports accidentally.

## Target Shape

Worker HTTP modules:

- `apps/worker/src/app.ts`: creates and configures the Express app.
- `apps/worker/src/index.ts`: environment loading, startup orchestration, graceful shutdown.
- `apps/worker/src/middleware/auth.ts`: worker auth middleware.
- `apps/worker/src/middleware/jsonError.ts`: malformed JSON response handling.
- `apps/worker/src/routes/health.ts`: health endpoint.
- `apps/worker/src/routes/classification.ts`: immediate ontology classification.
- `apps/worker/src/routes/queue.ts`: queue creation endpoints.
- `apps/worker/src/routes/jobs.ts`: job lookup endpoints.
- `apps/worker/src/routes/maintenance.ts`: stats and cleanup endpoints.

Queue contract modules:

- Keep existing metadata interfaces in `packages/shared-types/src/queue-types.ts`.
- Add runtime schemas in a dedicated server-safe module or package export, not casually through the root export.
- Provide `parseQueueMetadata(jobType, metadata)` and `safeParseQueueMetadata(jobType, metadata)`.
- Keep existing `validateJobMetadata()` as a compatibility wrapper until call sites migrate.

## Implementation Phases

### Phase 1: Guardrails and Testable Seams

1. Add a worker module-size guardrail.
2. Add or expose a `createWorkerApp()` seam so worker routes can be tested without starting the scheduler or queue processor.
3. Add focused worker HTTP tests for malformed JSON and invalid request bodies on one or two queue endpoints.
4. Keep `apps/worker/src/index.ts` behavior unchanged while preparing extraction.

### Phase 2: Queue Metadata Runtime Schemas

1. Add zod as an explicit dependency only where the runtime schemas live.
2. Define shared primitive schemas:
    - UUID
    - `YYYY-MM-DD`
    - ISO timestamp
    - IANA timezone
    - non-empty string
3. Define schemas for the highest-volume job types first:
    - `generate_daily_brief`
    - `onboarding_analysis`
    - `classify_chat_session`
    - `process_onto_braindump`
    - `schedule_daily_sms`
    - `agent_run`
4. Add schema tests for valid payloads, missing required fields, and invalid field types.
5. Replace hand-written validators with schema-backed wrappers where the behavior matches.

### Phase 3: Worker Route Extraction

1. Move auth and JSON error handling into middleware modules.
2. Move `/health` and read-only job lookup routes first.
3. Move queue creation routes next.
4. Move maintenance routes last.
5. Keep route handlers small and inject dependencies where tests need them.

### Phase 4: Enqueue Call Site Migration

Validate metadata before every direct queue write:

- Worker scheduler calls to `queue.add()`.
- Worker direct `add_queue_job` calls.
- Web server services that call `add_queue_job`.
- Web routes that re-enqueue `agent_run` jobs.
- Backfill scripts that queue chat classification and braindump processing.

The intended rule is: if code writes `p_metadata` or calls `queue.add()`, it should parse metadata through the shared queue contract first.

### Phase 5: Immediate Web Validation Sweep

Use `parseJsonRequest()` or `parseOptionalJsonRequest()` from `apps/web/src/lib/utils/request-validation.ts`.

Priority order:

1. Admin mutation endpoints that still call `request.json()` or `parseRequestBody()`.
2. Account, user settings, and preferences endpoints.
3. Common onto create/update endpoints.
4. Remaining mutation endpoints with high blast radius.

Tests should cover:

- Malformed JSON returns `400`.
- Missing required fields returns `422`.
- Invalid field types returns `422`.
- Valid payloads preserve current behavior.

## Derisking Notes

- Do not combine route extraction with business logic changes.
- Do not use zod transforms for database-derived defaults; keep normalization explicit in handler/service code.
- Keep schemas permissive enough for known legacy queued metadata during the first pass.
- Add strictness after telemetry or database sampling confirms no existing queued jobs would fail.
- Run focused tests after each route family migration instead of waiting for a broad final test pass.

## Verification

Targeted commands:

```bash
pnpm --filter @buildos/shared-types build
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/web test:run
pnpm --filter @buildos/web lint
```

Guardrails:

```bash
pnpm --filter @buildos/worker lint
pnpm --filter @buildos/web guardrails:server-routes
```
