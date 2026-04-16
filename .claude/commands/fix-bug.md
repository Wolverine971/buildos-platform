---
description: Investigate and fix a BuildOS bug with root-cause analysis and verification.
argument-hint: "[bug report or affected area]"
---

# Fix Bug — BuildOS

You are a senior engineer fixing a bug in the BuildOS platform (Svelte 5 runes, Turborepo, Supabase-backed queue). Find the root cause, propose the minimum fix, verify it.

## If invoked without context

Ask for:
- What's broken (symptom + affected surface: web / worker / shared)
- Error message or console output, if any
- Steps to reproduce

Otherwise: start.

## Process

### 1. Triage (fast)

- Identify the affected package (`apps/web`, `apps/worker`, `packages/*`).
- Check recent commits in that area: `git log --oneline -10 -- apps/[area]`.
- Grep the error message / stack frame before reading anything.

### 2. Targeted investigation

Pick the path that matches the bug — don't read all of these.

| Area | Where to look |
|------|---------------|
| UI / component | `apps/web/src/lib/components/`, `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` |
| API route | `apps/web/src/routes/api/`, `apps/web/docs/technical/api/` |
| Auth / billing gate | `apps/web/src/hooks.server.ts`, `apps/web/src/lib/server/consumption-billing*` |
| Worker job | `apps/worker/src/workers/[domain]/`, `apps/worker/docs/WORKER_JOBS_AND_FLOWS.md` |
| Queue plumbing | `apps/worker/src/lib/supabaseQueue.ts`, `docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` |
| Schema / DB | `packages/shared-types/src/database.schema.ts` (read this first, it's smaller), `database.types.ts` only if you need RPC shapes |
| LLM routing | `packages/smart-llm/` |
| SMS | `packages/twilio-service/`, `apps/worker/src/workers/smsWorker.ts` |

Common BuildOS traps to check before going deep:

- Svelte 5 runes: is `$state` / `$derived` / `$effect` used, or old reactive syntax?
- API response shape: does the route use `ApiResponse` from `$lib/utils/api-response`, or raw `json()`?
- Supabase client: `locals.supabase` (RLS) vs `createAdminSupabaseClient()` (service role). Mixing these is a frequent source of "works locally, fails in prod".
- Consumption billing guard: mutations return 402 when account is frozen.
- Queue job contract: job type registered in `src/worker.ts` and metadata shape declared in `packages/shared-types/src/queue-types.ts`.

### 3. Report root cause

```markdown
**Component**: web | worker | shared | package:<name>
**File**: path/to/file.ts:line
**Cause**: <one sentence on what's actually wrong>
**Why it slipped through**: <gap in tests / assumption / drift>
**Size**: quick (1-2 lines) | standard (few files) | structural (architecture touch)
```

### 4. Fix

- **Quick fix**: apply directly.
- **Standard**: propose the diff shape (files + what changes) and wait for confirmation.
- **Structural**: stop. Suggest `/create-plan` before touching code.

Follow BuildOS conventions: runes, semantic tokens with `dark:`, `ApiResponse`, proper types from `@buildos/shared-types`, `pnpm`.

### 5. Verify

From the affected app:

```bash
pnpm lint:fix
pnpm typecheck
pnpm test:run -- <nearest test file>
```

For UI fixes, run the dev server and reproduce the original bug.

State verification results explicitly — don't claim "fixed" from type-check alone.

### 6. Document (only if material)

- If the fix changes documented behavior, update the relevant doc under `apps/[app]/docs/features/[feature]/`.
- Otherwise the commit message is the record.

## Quick-reference paths

| Issue type   | First stop |
|--------------|------------|
| UI / style   | `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` |
| API          | `apps/web/docs/technical/api/` |
| Database     | `packages/shared-types/src/database.schema.ts` |
| Queue / jobs | `apps/worker/docs/WORKER_JOBS_AND_FLOWS.md` + `docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` |
| Topology     | `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` |
