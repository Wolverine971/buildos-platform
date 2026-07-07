<!-- docs/technical/reviews/api-service-quality-audit-2026-07-03.md -->

# BuildOS API and Service Quality Audit

Date: 2026-07-03

Scope: SvelteKit API routes, admin endpoints, service-role usage, service modules, shared agent ops, and the Railway worker API/queue architecture.

## Summary

BuildOS has several strong backend conventions already in place:

- `safeGetSession` centralizes authenticated session loading and JWT validation.
- Security headers, cross-site form POST blocking, and consumption billing mutation guards live in `hooks.server.ts`.
- JSON API routes are expected to use `ApiResponse`.
- User-scoped routes generally use `locals.supabase` so RLS remains active.
- Admin/system work has a documented `createAdminSupabaseClient` path.
- Worker jobs use Supabase-backed queue RPCs with atomic claims and graceful drain behavior.
- Guardrails exist for oversized server routes and `onto_projects` select-column drift.

Direct guardrails passed during this audit:

- `node apps/web/scripts/check-server-route-size.cjs`
- `node apps/web/scripts/check-onto-project-select-columns.cjs`

The package-script form of those guardrails failed in this runtime because pnpm 11 attempted a non-interactive module purge. The direct Node scripts passed.

Implementation follow-up completed:

- Added a reusable schema-first request helper in `apps/web/src/lib/utils/request-validation.ts`.
- Migrated mutation endpoints across admin, auth/account, user settings, calendar/chat, SMS, voice-note, webhook, and onto route families away from direct `await request.json()` casts.
- Standardized malformed JSON responses as 400 and schema validation failures as 422.
- Left direct JSON reads only in protocol/parser routes that own their own body contract: agent-call bridge routes, Google Calendar MCP passthrough, and the agent V2 stream parser.
- Removed stale route-size allowlist entries after two onto routes dropped below the oversized-route threshold.

Post-sweep verification:

- `./node_modules/.bin/svelte-kit sync`
- `NODE_OPTIONS='--max-old-space-size=8192' ./node_modules/.bin/svelte-check`
- `node apps/web/scripts/check-server-route-size.cjs`
- `node apps/web/scripts/check-onto-project-select-columns.cjs`

## High-Priority Findings

### 1. Break down oversized endpoint orchestrators

The largest maintainability risk is endpoint concentration. `apps/web/src/routes/api/agent/v2/stream/+server.ts` is 4,581 lines and owns request parsing, context cache handling, prepared prompts, SSE streaming, tool event persistence, supervisor recovery, timing, and observability. The route-size allowlist still has 34 grandfathered oversized routes.

Recommended work:

- Keep route files as thin adapters.
- Move lifecycle orchestration into focused services.
- Keep persistence, context loading, prompt preparation, streaming, and observability behind separately testable modules.
- Remove stale route-size allowlist entries as files drop below the limit.

### 2. Standardize admin authorization

Admin routes use several authority sources:

- `user.is_admin` from `safeGetSession`.
- Direct lookup in `users.is_admin`.
- Direct lookup in `admin_users`.
- Local page-level `requireAdmin` helpers.

The database also has two admin functions with different backing sources: `is_admin()` checks `users.is_admin`, while `is_admin(user_id)` checks `admin_users`.

Recommended work:

- Add a shared `requireAdmin` or `withAdminRoute` helper.
- Pick the canonical admin source.
- Return consistent 401/403 responses.
- Use that helper before creating service-role clients.

### 3. Move mutation endpoints to schema-first request validation

Status: completed initial sweep on 2026-07-03. Keep this as the required pattern for new and modified mutation routes.

The modern agent stream request already had a zod-backed parser, but many mutation routes cast `await request.json()` directly or used `parseRequestBody<T>`, which only parses JSON and does not validate structure. This turned malformed payloads into 500s in places that should return 400 or 422.

Example: `apps/web/src/routes/api/admin/users/+server.ts` destructures `{ userId, updates }` and then calls `Object.keys(updates)`. A payload without `updates` throws and becomes an internal error.

Implemented work:

- Added `parseJsonRequest` and `parseOptionalJsonRequest` in `apps/web/src/lib/utils/request-validation.ts`.
- Migrated admin, user/account, onto, and other common mutation endpoints first.
- Return 400 for invalid JSON and 422 for structurally valid JSON that fails schema validation.
- Keep schemas near route families or in shared route validation modules.

### 4. Reduce untyped Supabase clients and broad selects

The scan found heavy `any` usage in service/gateway layers and hundreds of `.select('*')` calls. Some dynamic AI tooling requires flexible input, but shared data access and route-facing services should be typed against `Database` and should select explicit columns.

Recommended work:

- Introduce typed repository/loader functions for common tables.
- Replace `supabase: any` with `SupabaseClient<Database>` where practical.
- Replace `select('*')` in hot paths and cross-package gateway code with explicit columns.
- Add guardrails for the most failure-prone tables beyond `onto_projects`.

### 5. Make API response and error logging consistent

Most routes use `ApiResponse`, but some ordinary JSON endpoints still return raw `json()`. Protocol endpoints are fine as exceptions, but app JSON APIs should have consistent success/error envelopes. Error logging is also split between `console.error`, `createLogger`, `ErrorLoggerService`, and hook-level structured logging.

Recommended work:

- Keep protocol endpoints explicitly documented as `ApiResponse` exceptions.
- Add a route error helper with request context.
- Migrate ordinary JSON endpoints to `ApiResponse`.

### 6. Refactor worker HTTP entrypoint and job contracts

`apps/worker/src/index.ts` contains worker auth, validation, route handlers, and queue metadata construction in one large Express module. Job metadata is persisted as JSON, while validation is manual and split between web enqueue callers and worker processors.

Recommended work:

- Split worker routes into modules.
- Define zod schemas for queue metadata by job type.
- Reuse those schemas from web enqueue routes and worker processors.
- Add a worker route-size or module-size guardrail.

## Completed Validation Sweep

The first implementation pass replaced direct request parsing in mutation endpoints:

1. Added reusable zod helpers for JSON body parsing and schema failure responses.
2. Migrated high-risk admin endpoints.
3. Migrated account/user settings and preferences endpoints.
4. Migrated common onto create/update endpoints.
5. Verified the sweep with Svelte diagnostics, route-size guardrails, onto column guardrails, and a scan for remaining direct `request.json()` calls.

Remaining direct JSON reads are intentional protocol/parser exceptions:

- `apps/web/src/routes/api/agent-call/callers/+server.ts`
- `apps/web/src/routes/api/agent-call/buildos/+server.ts`
- `apps/web/src/routes/api/agent/google-calendar/+server.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
