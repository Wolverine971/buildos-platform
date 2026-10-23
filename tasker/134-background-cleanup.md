<!-- tasker/134-background-cleanup.md -->

# 134 — Background cleanup: SMS crons, embedding deletes, worker redeploys, icon generation

**Status:** CHECKED by Claude 2026-10-18 — passes; migration rehearses clean with role probe · **Priority:** P3 · **Opened:** 2026-10-18 · **Size:** ~1 day
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

Less background churn: no SMS cron work while SMS is off, ~1,850 do-nothing embedding jobs a month gone, fewer worker redeploys (each one can interrupt a running job), and ~1k lines of unused icon generation removed while existing project icons keep showing.

## Files you own

- apps/worker/src/scheduler.ts (SMS cron registration only)
- apps/worker/railway.toml, railway.toml (watchPatterns only)
- one new migration in supabase/migrations/
- `apps/worker/src/workers/project-icon/`
- apps/worker/src/worker.ts (icon job registration only)
- apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts (icon auto-trigger only)
- packages/shared-types/src/queue-types.ts (icon job metadata only)
- apps/web/src/routes/api/onto/projects/[id]/icon/generations/\*\*, apps/web/src/lib/server/project-icon-generation.service.ts, and any "generate icon" UI
- the test files next to these

## Work, in this order

1. [x] **Gate the SMS crons on the SMS switch**
    - SMS sending is off in production (`PRIVATE_SMS_SENDING_ENABLED`, since 2026-07-31), yet `scheduler.ts` still registers the midnight SMS scheduler (~:332) and the hourly SMS-alert job that refreshes the SMS metrics materialized view (~:338). Register them only when SMS sending is enabled. No behavior change while SMS is off.
    - Leave the other crons alone; the cycles shadow, operatives scan and stranded sweep need owner calls.
2. [x] **Do embedding deletes inline in the trigger (write and rehearse; DJ applies)**
    - About 1,850 of 4,239 `embed_onto_entity` jobs in 30 days were delete jobs that removed nothing. In the SQL `enqueue_onto_entity_embedding` trigger function, the DELETE / `deleted_at` branch enqueues a job; make it delete the embedding row inline (one indexed DELETE inside the write transaction) instead. Read the worker's delete handling first so the inline delete matches it exactly.
    - New migration that redefines the function (copy the live definition from the latest migration that defines it). Run `pnpm db:rehearse`. **Do not apply it**; DJ applies.
3. [x] **Narrow the worker's Railway watchPatterns**
    - Both `railway.toml` and `apps/worker/railway.toml` redeploy the worker on any change under `packages/**`. Replace that with the worker's real workspace dependencies, derived from `apps/worker/package.json` (and their own workspace dependencies, transitively). Keep `apps/worker/**`, `patches/**`, `turbo.json`, `package.json` and `pnpm-lock.yaml`.
    - Print the derived list in your report, so DJ can see no package the worker builds from is missing.
4. [x] **Remove project icon generation (keep showing existing icons)**
    - Generation last ran 2026-02-17 (19 manual runs); the auto path is gated off (`PROJECT_ICON_GENERATION_ENABLED`), and emoji tiles replaced it. Remove: `apps/worker/src/workers/project-icon/`, its `generate_project_icon` registration in `worker.ts`, `queueAutoProjectIconGeneration` in `projectContextSnapshotWorker.ts`, the icon job metadata types, the web `icon/generations` routes, `project-icon-generation.service.ts`, and any UI that starts a generation.
    - **Keep** reading and rendering the existing `icon_svg` values: the projects page, `ProjectWorkspace.svelte`, the public project header and the graph loaders still show them. Leave the database columns and tables alone.

## Rules

1. Read `AGENTS.md` first, and `apps/web/AGENTS.md` before touching anything under `apps/web`.
2. **Shared checkout.** Other agents are editing other files in this same checkout right now. Edit only the files under "Files you own" plus new test files next to them. Never revert, reformat, stash or check out changes you didn't make: no `git stash`, `git checkout -- <path>`, `git reset` or `git clean`. If a fix truly needs a file outside your list, stop that item and write it under "Blocked".
3. Before fixing each bug, confirm it still happens in the current code (line numbers drift). If it doesn't, mark it `NOT A BUG` or `ALREADY FIXED` with one line of evidence and move on.
4. Test first: write the regression test, run it and watch it fail, then fix and watch it pass. Say in the report that you saw it fail.
5. Narrow checks only; the laptop runs several agents at once. Use the commands under "Checks". Never run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and never pass `--maxWorkers`, `--pool` or `--no-isolate`. If `test-gate` refuses or queues a run, wait at least 60 s and retry once.
6. No paid or live model calls, no production database writes, and no Railway or Vercel changes.
7. Never decide what user or model text means with regex or keyword lists (AGENTS.md, "Never classify language with regex"). Route meaning through a structured channel: a tool argument, a Jev or turn-contract field, a `type_key`, a UI action.
8. Migrations: new file only (never edit an existing one), run `pnpm db:rehearse supabase/migrations/<file>.sql`, and **do not apply**. DJ applies.
9. Don't commit unless DJ asks. If he does, commit only your own files: `git commit -m "..." -- <your paths>`.

## Checks

- `pnpm --filter @buildos/worker exec vitest run tests/` limited to the scheduler, snapshot-worker and queue-contract tests you touched
- `pnpm --filter web exec vitest run` limited to the project page and route tests you touched
- `pnpm --filter @buildos/shared-types build` then the typechecks below
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter web run check` once at the end (heavy). If a local dev server is running, run `touch apps/web/vite.config.ts` afterwards; `check` deletes the dev proxy types and every page 500s until Vite restarts.
- `pnpm --filter web run typecheck:tests`
- `pnpm db:rehearse supabase/migrations/<your file>.sql`

## Self-check before you report

- `git status --porcelain`: every file _you_ touched is in "Files you own" or is a new test next to one. Other agents' files will show up there too; leave them alone.
- Re-read your whole diff once as a skeptical reviewer. For each fix, name one more edge case and check it is handled or tested.
- Every regression test failed before its fix and passes now.
- Every command under "Checks" passed. Paste the pass counts.
- No new regex or keyword matching on user or model text. No paid calls. No migration applied.

## Report (reply to DJ with this, and update this file)

1. Each work item: `DONE`, `NOT A BUG`, `ALREADY FIXED`, `SKIPPED (why)` or `BLOCKED (why)`, with one line on what changed.
2. Files changed.
3. Commands run, with pass/fail counts, and confirmation that each regression test failed first.
4. Anything DJ must do: Apply the embedding-trigger migration.

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

### Completion report — 2026-10-18

1. Work items (confirmed against current code before editing):
    - **DONE — SMS crons:** both midnight reminders and hourly metrics/alerts register only when `SMS_SENDING_ENABLED` is true; startup logging reflects this. Other registrations and Tasker 128's brief protections are unchanged.
    - **DONE — embedding deletes:** new migration `20261018215551_inline_onto_embedding_deletes.sql` removes every matching embedding chunk by `(entity_type, entity_id)` before digest/owner/project lookup. The original function body was verified against the cached production schema. Live-write queueing and best-effort failure handling remain. Removed legacy public/client EXECUTE grants on this trigger-only definer; signed-in trigger writes and role probes pass. **Unapplied.**
    - **DONE — Railway watch patterns:** replaced `packages/**` in both files with the complete recursive workspace dependency list below. All existing worker/build/config inputs remain watched.
    - **DONE — icon generation:** removed worker implementation/registration, snapshot auto-trigger, icon metadata/results, web queue service, and all three generation endpoints with their obsolete tests. Generation UI was **ALREADY FIXED**: no component calls those endpoints or starts generation. Existing `icon_svg` readers/renderers, graph routes, database columns/tables/enums, and emoji selection are unchanged.

    Derived package patterns (from worker dependencies plus recursive dependencies/devDependencies/optionalDependencies/peerDependencies, with cycle protection):

    ```text
    packages/agentic-chat-runtime/**
    packages/shared-agent-ops/**
    packages/shared-types/**
    packages/shared-utils/**
    packages/smart-llm/**
    packages/supabase-client/**
    packages/twilio-service/**
    ```

    Other retained patterns: `apps/worker/**`, `patches/**`, `turbo.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `railway.toml`, and `nixpacks.toml`. The unrelated `packages/buildos-mcp-server/**` no longer triggers this worker's deployment.

2. Files changed:
    - Modified: `apps/worker/src/scheduler.ts`, `apps/worker/src/worker.ts`, `apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts`, `packages/shared-types/src/queue-types.ts`, `apps/worker/railway.toml`, `railway.toml`, `apps/worker/tests/queueContracts.test.ts`, and this tracker.
    - Added: `apps/worker/tests/schedulerSms.test.ts`, `apps/worker/tests/projectIconRetirement.test.ts`, `apps/worker/tests/embeddingDelete.check.sql`, `apps/web/src/routes/api/onto/projects/[id]/icon/generations/retirement.test.ts`, and `supabase/migrations/20261018215551_inline_onto_embedding_deletes.sql`.
    - Deleted: `apps/worker/src/workers/project-icon/projectIconWorker.ts` and `apps/web/src/lib/server/project-icon-generation.service.ts`.
    - Deleted under `apps/web/src/routes/api/onto/projects/[id]/icon/generations/`: `+server.ts`, `server.test.ts`, `[generationId]/+server.ts`, `[generationId]/server.test.ts`, `[generationId]/select/+server.ts`, and `[generationId]/select/server.test.ts`.

3. Validation commands/results (heavy runs serialized through `test-gate run`; no paid calls):

    | Exact command                                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                 |
    | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `test-gate run pnpm --filter @buildos/worker exec vitest run tests/schedulerSms.test.ts`                                                                               | Before: **1 failed / 1 passed**. After: **2 passed / 0 failed**.                                                                                                                                                                                                                                                                                                                                                                       |
    | `test-gate run pnpm db:rehearse supabase/migrations/20261018215551_inline_onto_embedding_deletes.sql --check apps/worker/tests/embeddingDelete.check.sql`              | Empty migration, before fix: **1 failed / 4 passed checks**, expected `soft delete must remove all embedding chunks inline`.                                                                                                                                                                                                                                                                                                           |
    | `test-gate run pnpm db:rehearse supabase/migrations/20261018215551_inline_onto_embedding_deletes.sql --check apps/worker/tests/embeddingDelete.check.sql --role-probe` | After: **5 checks passed / 0 failed**, no SECURITY findings. Role probes: anon **1 existing failure before/after**, authenticated **0 before/after**, **0 regressions**.                                                                                                                                                                                                                                                               |
    | `test-gate run pnpm --filter @buildos/worker exec vitest run tests/queueContracts.test.ts`                                                                             | Before: **2 failed / 26 passed**. After: **28 passed / 0 failed**.                                                                                                                                                                                                                                                                                                                                                                     |
    | `test-gate run pnpm --filter @buildos/worker exec vitest run tests/projectIconRetirement.test.ts`                                                                      | Before: **2 failed / 0 passed** (processor still present; snapshot touched generation table).                                                                                                                                                                                                                                                                                                                                          |
    | `test-gate run pnpm --filter @buildos/worker exec vitest run tests/schedulerSms.test.ts tests/projectIconRetirement.test.ts tests/queueContracts.test.ts`              | Final worker regression run: **32 passed / 0 failed; 3 files passed**.                                                                                                                                                                                                                                                                                                                                                                 |
    | `test-gate run "pnpm --filter web exec vitest run 'src/routes/api/onto/projects/[id]/icon/generations/retirement.test.ts'"`                                            | Before: **4 failed / 1 passed**. After: **5 passed / 0 failed**. Existing SVG rendering passed both times.                                                                                                                                                                                                                                                                                                                             |
    | `test-gate run pnpm --filter @buildos/shared-types build`                                                                                                              | **PASS**: CJS, ESM and declaration outputs built.                                                                                                                                                                                                                                                                                                                                                                                      |
    | `test-gate run pnpm --filter @buildos/worker run typecheck`                                                                                                            | **PASS, 0 errors**.                                                                                                                                                                                                                                                                                                                                                                                                                    |
    | `test-gate run pnpm --filter @buildos/worker run typecheck:tests`                                                                                                      | **PASS, 0/0 errors at baseline**.                                                                                                                                                                                                                                                                                                                                                                                                      |
    | `test-gate run pnpm --filter web run check`                                                                                                                            | **FAIL: 1 error, 0 warnings** in out-of-scope `apps/web/src/routes/api/agent/v2/turns/+server.ts:217`: plain `string` assigned to UUID template-literal type. The other task subsequently changed the declaration to `let decisionId: string = randomUUID()`; this run does not validate that later edit. Ran once as requested. Touched `apps/web/vite.config.ts` afterward because local dev servers were active; no content change. |
    | `test-gate run pnpm --filter web run typecheck:tests`                                                                                                                  | **PASS, 0/0 errors at baseline**. Touched Vite config again after this command regenerated types.                                                                                                                                                                                                                                                                                                                                      |

    Every bug/removal regression was observed failing before its corresponding fix. Preservation cases intentionally passed before and after. Initial rehearsal launch failed on sandbox shared memory (exit 2); approved local rerun worked. The first SQL fixture hit the existing embedding/project consistency guard, then was corrected to seed real source entities before the meaningful regression failure. Initial `test-gate` invocation omitted `run` (exit 64, no tests); initial web launch lost bracket-path quoting (exit 1, no tests), corrected by quoting the complete gate command. Supabase CLI help initially hit its sandboxed telemetry-file write; approved CLI invocation created only the local migration. No automatic approval rejection occurred.

4. DJ action: obtain a clean web check after the other task's concurrent route type fix, then request Claude's review. After review, apply **only** `supabase/migrations/20261018215551_inline_onto_embedding_deletes.sql` and record version `20261018215551` using the repository's one-file apply/repair procedure. This chat made no hosted database writes, deployment changes, or commits.

Self-review: scoped diff and untracked additions reviewed; extra cases checked were enabled SMS plus unchanged unrelated cron registrations, multiple chunks/other entity types/ownerless deletes/signed-in writes, complete transitive package coverage, and snapshot execution with the retired flag enabled plus preserved SVG rendering. No new matching of user/model meaning; the only new regex parses a TOML string array.

## Blocked

- None remaining from implementation validation. The earlier route type error was fixed by Tasker 135, and the shared coordinator rerun on 2026-10-18 passed with 0 errors and 0 warnings. Claude review and DJ's migration application remain handoff steps.

## Log

- 2026-10-18 (coordinator inspection): Ran `test-gate run 'pnpm --filter web run check'` once for the completed taskers; exit 0, **0 errors and 0 warnings**. Log: `/tmp/tasker-131-135-review-web-check.log`. This supersedes the pending-web-check statements in the original report. Independently derived the worker's seven transitive workspace dependencies and confirmed both watch lists match. No implementation files changed during this inspection; the embedding migration remains unapplied. Status advanced to DONE — awaiting Claude check.

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18: Confirmed Tasker 128 is DONE awaiting Claude check and its scheduler/worker fixes are present. Reproduced all four cleanup issues before fixing; SMS and worker contracts now pass 32 tests. Embedding migration passed its regression, all four standing checks, and role probes with no new failures; left unapplied. Final web/build/type checks in progress, serialized through test-gate.

- 2026-10-18: Implementation and self-review complete: all four work items checked; 32 worker tests, 5 web tests, shared-types build, both worker typechecks, web test typecheck, and 5 rehearsal checks passed. Required Svelte check ran once and failed on an out-of-scope chat-route UUID/string assignment; its owner subsequently added the string annotation. Clean Svelte revalidation remains pending, so status is IMPLEMENTED rather than DONE. Existing icons and database schema storage remain; migration is unapplied; no commits, paid calls, or deployment changes.
- 2026-10-18 (Claude light check of 126–135): items 1–4 OK. The migration passes its own check (a write as a signed-in user still fires the trigger) plus the role probe. `icon_svg` still renders everywhere. The low stray-chunk follow-up moved to tracker 137 item 5.
