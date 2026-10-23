<!-- tasker/132-approved-changes-never-duplicate.md -->

# 132 — Approved changes never duplicate or lose edits

**Status:** CHECKED by Claude 2026-10-18 — items 1–11 pass · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~2 days  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

External agents stop hitting a permanent "already in progress" (2 stuck keys in prod today). A crash during an approval can no longer create the same doc twice. Two edits landing at once stop overwriting each other's fields. MCP clients stop being promised an "intelligent merge" that is really an append.

## Files you own

- packages/shared-agent-ops/src/gateway/\* (except op-execution-gateway.calendar.ts, which tasker 130 owns)
- `packages/shared-agent-ops/src/tables/table-repository.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`
- `apps/web/src/lib/server/agent-call/change-set-commit.test.ts`
- the `checkModelAlignment` callers listed in the last item
- `packages/shared-agent-ops/src/proposal-context/verify-operations.ts` and its tests (explicitly authorized on resumption)
- the new Tasker 132 migration (explicitly authorized on resumption)
- the test files next to these

## Work, in this order

1. [x] **First, as a separate pure move: split `op-execution-gateway.core.ts` by entity**
    - Move documents (~1,590 lines) to `op-execution-gateway.documents.ts`, `createProject` to `.projects.ts`, and `executeGatewayOp`/registry/stage-snapshot (~470 lines) to `.external.ts`. No behavior change: only moves and import updates, and every existing gateway test must still pass before you start the bug fixes. It is the hottest file in the repo (22 commits in 90 days), so a clean split makes the fixes reviewable.
2. [x] **Idempotency key stuck 'pending' forever means a permanent CONFLICT for external agents**
    - Size S · now at `packages/shared-agent-ops/src/gateway/write-audit.service.ts:171`
    - What goes wrong: If the process dies, or recordWriteExecutionSuccess/Failure throws (swallowed at core.ts:2663), the reservation row stays pending. Every retry with the same key gets 'already in progress' indefinitely; nothing reclaims stale reservations. Prod: 2 such rows since at least 2026-09-18.
    - Fix: If the conflicting row is pending and older than ~5 min, compare-and-swap it to failed and retry the reservation once.
    - Regression test: new packages/shared-agent-ops/src/gateway/write-audit.service.test.ts
3. [x] **Crash re-entry/recovery can duplicate creates**
    - Size M · now at `packages/shared-agent-ops/src/gateway/change-set.ts:666`
    - What goes wrong: The telemetry insert results (:535, :591, :608) are never checked, and runGatewayWriteOp gets no downstreamIdempotencyKey. If a write lands but its success row doesn't (60s Vercel kill, or a failed insert), D9b re-entry or recoverStalledCommit hands the change back to be re-applied, creating a duplicate task or doc. 0 interrupted commits in 120 days, so this is latent.
    - Fix: Pass agent-run:${runId}:${change.id} as downstreamIdempotencyKey and make doc/goal/plan/milestone/risk creates honor it (only tasks do today); if the success telemetry insert fails, stop and leave the run for recovery.
    - Regression test: `apps/web/src/lib/server/agent-call/change-set-commit.test.ts`
4. [x] **Second staged update to the same entity always fails stale; re-entry can record an applied change as rejected (partly fixed already)**
    - Size M · now at `packages/shared-agent-ops/src/gateway/change-set.ts:203`
    - What goes wrong: An agent stages update task X title, then update task X state. Only creates are merged (agentRunPolicy.ts:79), so after change 1 applies, change 2's before-snapshot mismatches (1 case in 120 days). Separately, on stalled re-entry the decision check runs before priorApplied, so a change that already landed but is now 'rejected' is counted as rejected.
    - Fix: Round 1 fixed the reported case. Left: (a) a later change to a field an earlier change in the set wrote — record each entity's post-apply row and compare against it; (b) relationship/archived-only updates fall back to a full-row compare — treat them as an empty write set; (c) move the priorApplied check above the decision check. Add a change-set-commit test for the scoped compare (round 1's test is in apps/worker/tests/changeSetDrift.test.ts).
    - Regression test: `apps/web/src/lib/server/agent-call/change-set-commit.test.ts`
5. [x] **Unguarded read-modify-write of the whole props object loses concurrent edits (tasks, goals, plans, milestones, risks)**
    - Size M · now at `packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts:757`
    - What goes wrong: updateTask merges props from a stale read and writes with only .eq('id'), as does updateCoreEntity (core-entities.ts:772). A UI props save landing between the read and the write is overwritten. Unlike documents, there is no updated_at guard.
    - Fix: Merge props in SQL (props || patch) via the atomic RPC or a small new one, or guard with .eq('updated_at', …) plus one reload-and-retry.
    - Regression test: `packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.test.ts`
6. [x] **merge_llm is advertised but always rejected (worker) or silently appended (gateway) (partly fixed already)**
    - Size S · now at `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts:1435`
    - What goes wrong: The tool schema promises 'intelligently merge'. The worker normalizer rejects it (argument-normalizers.ts:42), wasting a model turn, and the external gateway concatenates instead. The merge op (agentic_chat_content_merge) has zero producers.
    - Fix: Worker chat no longer offers it (since 09-23). Still advertised to MCP clients as 'intelligently merge' while the gateway appends: drop merge_llm/merge_instructions from both enums and keep accepting merge_llm as an alias for append.
    - Regression test: `packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.test.ts`
7. [x] **Column changes over 1,000 row ops: unguarded schema save in non-atomic batches; retry re-plans against a half-applied schema**
    - Size M · now at `packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.ts:757`
    - What goes wrong: Retyping a column on a 1,500-row table: expectedRevision becomes null, batch 1 saves the new schema and recodes 1,000 rows, batch 2 hits ROW_CONFLICT. The retry re-plans 'retype/delete column X' against the changed schema, so the user gets an 'Unknown column' error over a partial rewrite. A concurrent column rename is also overwritten. Latent: prod has 2 tables, 139 rows.
    - Fix: Keep the revision guard on batch 1; on a later-batch failure with applied_batches, resume the remaining row ops instead of re-planning. Latent (2 tables, 139 rows in prod).
    - Regression test: `packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.test.ts`
8. [x] **Round-1 leftover: remove the ignored `checkModelAlignment` option**
    - Round 1 removed the lexical model-text check from `packages/shared-agent-ops/src/proposal-context/verify-operations.ts`; the option is now ignored. Remove it from the input type and from every caller: `apps/web/src/lib/server/inbox.service.ts`, `project-suggestion-integrity.service.ts`, `project-suggestion-actions.service.ts`, `freshness-radar.service.ts`; `apps/worker/src/workers/freshness-radar/drafts.ts`, `apps/worker/src/workers/project-loop/projectLoopWorker.ts`, `apps/worker/scripts/project-loop-replay.ts`; `packages/shared-agent-ops/src/project-cleanup.ts`, `inbox-index.ts`; plus the tests that pass or assert it.
    - Drop `MODEL_ENTITY_MISMATCH` from the diagnostic code union only if nothing reads stored diagnostics with that code (grep the web inbox UI).

## Follow-up from Claude's check (2026-10-18)

Items 1–8 passed review (the split is behavior-neutral: 45 declarations accounted for). Do items 9–11 only. For item 9 you may also add type annotations anywhere in `packages/shared-agent-ops/src/gateway/**` and `packages/agentic-chat-runtime/src/**`, except `catalog/definitions/calendar.ts` (tracker 130 is editing it). Item 10 adds the runtime test and `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`.

9. [x] **The runtime's declaration build now runs out of memory — blocks every deploy**
    - Now: `pnpm --filter @buildos/agentic-chat-runtime build` builds CJS/ESM, then the DTS step dies with `ERR_WORKER_OUT_OF_MEMORY` at Node's default heap (4.3 GB here; 2 of 2 runs, peak RSS 3.5 GB). Trackers 129 and 130 built it at the default heap earlier today; this tracker's log records the first failure and the 6 GiB retry.
    - What goes wrong: Railway's worker build caps the heap at 2 GB (`apps/worker/railway.toml`, `nixpacks.toml`). Vercel (`turbo build --filter=@buildos/web...`) and CI (`pnpm verify`) build this package too. Pushing now breaks the worker deploy, the web deploy and CI.
    - Fix: find what grew declaration-build memory and fix the cause. Do not raise heap limits. The runtime imports `@buildos/shared-agent-ops/gateway/op-execution-gateway`, so start with the split modules. The usual culprit is an exported function or const whose inferred type is huge (a Supabase query-builder type, a giant union), fixed with an explicit type annotation or by not re-exporting an internal. `tsc -p packages/agentic-chat-runtime --declaration --emitDeclarationOnly --outDir <scratch> --extendedDiagnostics` reports memory and type counts. Bisect if needed. If the cause is not a 132 change, report which change it is, with evidence, and stop.
    - Done when: `NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @buildos/agentic-chat-runtime build` passes (the Railway cap). Report peak RSS before and after (`/usr/bin/time -l`).
    - **DONE 2026-10-18 (Codex):** Tasker 132's split made `updateDocument` exported. Its inferred declaration expanded the receipt spread and emitted `revert_patch: import("..").DocumentPatchV1`, pulling the entire shared package barrel into consumers of the gateway facade. A named, explicit return type using the already imported leaf `DocumentChangeSummaryV1` removes this dependency with no runtime change. Relative declaration reachability from the gateway shrank from 69 files / 356,892 bytes (root barrel reached) to 26 files / 224,425 bytes (root barrel absent).
    - **Measured RED → GREEN:** `test-gate run '/usr/bin/time -l env NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @buildos/agentic-chat-runtime build'` failed before the annotation with `ERR_WORKER_OUT_OF_MEMORY`, exit 1, peak RSS **2,089,287,680 bytes**, elapsed 9.45 s. After `test-gate run 'pnpm --filter @buildos/shared-agent-ops build'` passed, the identical 2 GiB command passed (CJS/ESM/DTS), exit 0, peak RSS **1,477,197,824 bytes**, elapsed 6.53 s: **29.3% lower peak RSS**. No heap increase, build-script change, checkout reset or parallel build. Logs and captured pre-fix declarations: `/tmp/tasker132-followup/01-runtime-before.log`, `02-shared-build.log`, `03-runtime-after.log`, `before/`.
10. [x] **Tests still expect the old document-merge fields**
    - `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.test.ts:110` asserts `update_onto_document` still has `merge_instructions`. Item 6 removed it on purpose, so change the assertion to `not.toHaveProperty`.
    - `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts:1955` still mentions `merge_instructions`; update the text.
    - Leave `catalog-fitness` alone. Its snapshot also changes, but tracker 130 regenerates it last.
    - **DONE 2026-10-18 (Codex):** Catalog test now requires only replace/append and rejects `merge_instructions`; prompt guidance says append and omits the retired argument. Catalog red: 1 failed / 6 passed → green: 7 passed. Prompt regression red: 1 failed / 72 skipped → full neighboring suite green: 73 passed. Logs `05`–`08` in `/tmp/tasker132-followup/`. No calendar/catalog-fitness edits.
11. [x] **A failed success receipt can mislabel a landed change as "not applied"** (medium-low)
    - Now: `packages/shared-agent-ops/src/gateway/change-set.ts`, `recoverStalledCommit` and `INTERRUPTED_COMMIT_CHANGE_ERROR`.
    - What goes wrong: the success-receipt insert fails after an earlier change in the set already landed. Recovery marks that change "Not applied… nothing changed for it". If the user re-proposes it, the new change gets a new id, which can create a duplicate.
    - Fix: before labelling a change not applied, look it up by its deterministic create id (item 3's key) and mark it applied when the row exists. Retrying the receipt insert once is optional.
    - Regression test: the receipt insert fails once after change 1 lands → recovery reports change 1 as applied → re-proposing creates nothing new.
    - **DONE 2026-10-18 (Codex):** Recovery reconciles missing success receipts against the same UUID derivation as insertion, in one lookup per entity table. Covers documents, goals, plans, milestones, risks, newly created task documents, and tasks via their persisted idempotency key. Existing-document attachment is excluded; the document's presence alone cannot prove an attachment ran. A lookup error leaves recovery unfinished instead of claiming nothing changed. Eight new regressions failed first (18 existing passed), then all 26 commit tests passed after the fix. Tests use real deterministic inserts, preserve later human edits, prove repeated commit does not write, and re-propose only unrun work with no duplicate of the landed entity. Logs `09`–`12` in `/tmp/tasker132-followup/`. Other operation types still rely on successful telemetry; this does not add semantic deduplication across independent proposals.

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

- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/gateway/ src/proposal-context/ src/tables/`
- `pnpm --filter web exec vitest run src/lib/server/agent-call/ src/lib/server/project-suggestion-actions.service.test.ts src/lib/server/freshness-radar.service.test.ts src/lib/server/inbox*`
- `pnpm --filter @buildos/worker exec vitest run tests/changeSetDrift.test.ts tests/freshnessRadarWorker.test.ts`
- `pnpm --filter @buildos/shared-agent-ops run typecheck` and `pnpm --filter @buildos/agentic-chat-runtime run typecheck`
- Packages are consumed through `dist`: after changing `@buildos/shared-agent-ops`, `@buildos/agentic-chat-runtime`, run `pnpm --filter <pkg> build` before typechecking or testing an app that imports it. If two agents build the same package at once and the build fails strangely, rerun it.
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter web run check` once at the end (heavy). If a local dev server is running, run `touch apps/web/vite.config.ts` afterwards; `check` deletes the dev proxy types and every page 500s until Vite restarts.
- `pnpm --filter web run typecheck:tests`
- Item 9: `NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @buildos/agentic-chat-runtime build`, then `pnpm --filter @buildos/agentic-chat-runtime run typecheck`
- Item 10: `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/catalog/definitions/ontology-write.test.ts`
- Item 11: `pnpm --filter @buildos/shared-agent-ops exec vitest run src/gateway/` and `pnpm --filter @buildos/shared-agent-ops run typecheck`

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
4. Anything DJ must do (none expected).

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Report — 2026-10-18

1. **DONE — pure gateway split.** Moved document handlers, project create/graph, relationship reads and external dispatch/registry/snapshot logic into focused modules, retaining compatibility exports. All 45 original declarations are accounted for. The pure move passed all 185 existing gateway tests before behavioral changes.
2. **DONE — stale pending reservations.** After five minutes, CAS the exact pending row/version to failed and retry reservation once. Racing success or timestamp refresh is preserved; CAS errors stop execution.
3. **DONE — crash-safe creates and receipts.** Commits carry stable `agent-run:${runId}:${change.id}` downstream keys. Main document/goal/plan/milestone/risk creates and task-document create-or-attach use deterministic UUIDv5 IDs and scoped replay reads; retries preserve later human edits. Every commit receipt insert is checked; failure leaves the run for recovery.
4. **DONE — sequential edits and re-entry.** Advance the comparison baseline only for fields/props keys this set actually saved, restoring it from prior receipts on re-entry. Empty update write sets compare nothing. Previously applied changes remain approved even if a later request rejects them.
5. **DONE — props concurrency.** Direct task and goal/plan/milestone/risk writes use timestamp CAS with one full reload/rebuild/retry. Atomic task relationship/assignee updates carry the expected timestamp into the existing SQL function, which checks it under the row lock before any writes. Persistent contention returns CONFLICT. The new migration preserves the function signature, invoker security, access checks, lock ordering and grants.
6. **DONE — document merge contract.** Both schemas advertise only replace/append and no unused guidance. Cached `merge_llm` requests normalize to append before strict validation; direct handler compatibility remains. Literal content stays literal.
7. **DONE — large table schema batches.** Keep the initial schema revision guard and carry revisions through later batches. On partial conflict, reload and derive only unfinished row patches against the original schema; never re-save the partially applied schema. A concurrent schema change stops with partial-progress details. Receipts survive recovery and later failures; partial writes are never labeled wholly rolled back.
8. **DONE — ignored option cleanup.** Removed `checkModelAlignment` from the input type and every caller/test. Kept `MODEL_ENTITY_MISMATCH` for stored diagnostic compatibility and existing diagnostic consumers; no lexical model-text check was reintroduced.

### Files changed

42 owned files (including neighboring tests, the explicitly authorized migration/verifier files, and this tracker). Other agents' changes were preserved. Vite config's timestamp was touched after web validation for dev reload; its contents were not edited.

- `apps/web/src/lib/server/agent-call/change-set-commit.test.ts`
- `apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts`
- `apps/web/src/lib/server/freshness-radar.service.test.ts`
- `apps/web/src/lib/server/freshness-radar.service.ts`
- `apps/web/src/lib/server/inbox.service.ts`
- `apps/web/src/lib/server/project-suggestion-actions.service.test.ts`
- `apps/web/src/lib/server/project-suggestion-actions.service.ts`
- `apps/web/src/lib/server/project-suggestion-integrity.service.ts`
- `apps/worker/scripts/project-loop-replay.ts`
- `apps/worker/src/workers/freshness-radar/drafts.ts`
- `apps/worker/src/workers/project-loop/projectLoopWorker.ts`
- `apps/worker/tests/freshnessRadarWorker.test.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`
- `packages/shared-agent-ops/src/gateway/change-set.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.config.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.core-entities.test.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.core-entities.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.create-idempotency.test.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.create-idempotency.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.test.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.external.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.projects.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.relationships.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.test.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.test.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.validation.ts`
- `packages/shared-agent-ops/src/gateway/task-props-version-guard.check.sql`
- `packages/shared-agent-ops/src/gateway/write-audit.service.test.ts`
- `packages/shared-agent-ops/src/gateway/write-audit.service.ts`
- `packages/shared-agent-ops/src/inbox-index.ts`
- `packages/shared-agent-ops/src/project-cleanup.ts`
- `packages/shared-agent-ops/src/proposal-context/verify-operations.cleanup.test.ts`
- `packages/shared-agent-ops/src/proposal-context/verify-operations.test.ts`
- `packages/shared-agent-ops/src/proposal-context/verify-operations.ts`
- `packages/shared-agent-ops/src/tables/table-repository.test.ts`
- `packages/shared-agent-ops/src/tables/table-repository.ts`
- `supabase/migrations/20261018233421_task_props_version_guard.sql`
- `tasker/132-approved-changes-never-duplicate.md`

### Final validation

Heavy commands ran sequentially through `test-gate run '<command>'`; no worker-limit overrides. Final focused total: **712 tests passed, 0 failed**. Logs: `/tmp/tasker132/`.

| Exact command inside test-gate                                                                                                                                                                                                                                 | Final result                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @buildos/shared-agent-ops exec vitest run src/gateway/ src/proposal-context/ src/tables/`                                                                                                                                                       | PASS — 36 files, 389 tests.                                                                                                                                                                                                                                                      |
| `pnpm --filter web exec vitest run src/lib/server/agent-call/ src/lib/server/project-suggestion-actions.service.test.ts src/lib/server/freshness-radar.service.test.ts src/lib/server/inbox.service.test.ts src/lib/server/inbox-chat-session.service.test.ts` | PASS — 18 files, 293 tests. Both inbox test files explicitly expand the requested wildcard.                                                                                                                                                                                      |
| `pnpm --filter @buildos/worker exec vitest run tests/changeSetDrift.test.ts tests/freshnessRadarWorker.test.ts`                                                                                                                                                | PASS — 2 files, 30 tests.                                                                                                                                                                                                                                                        |
| `pnpm --filter @buildos/shared-agent-ops run typecheck`                                                                                                                                                                                                        | PASS, exit 0.                                                                                                                                                                                                                                                                    |
| `pnpm --filter @buildos/shared-agent-ops build`                                                                                                                                                                                                                | PASS, bundles + declarations, exit 0.                                                                                                                                                                                                                                            |
| `pnpm --filter @buildos/agentic-chat-runtime run typecheck`                                                                                                                                                                                                    | PASS, exit 0.                                                                                                                                                                                                                                                                    |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @buildos/agentic-chat-runtime build`                                                                                                                                                                     | PASS, bundles + declarations, exit 0. The normal build first failed in the declaration worker at the default 4 GiB heap limit. The bounded 6 GiB retry passed; test-gate remained active with real macOS memory checks, and no other validation from this chat ran concurrently. |
| `pnpm --filter @buildos/worker run typecheck`                                                                                                                                                                                                                  | PASS, exit 0.                                                                                                                                                                                                                                                                    |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                                                                                            | PASS — 0/0 errors.                                                                                                                                                                                                                                                               |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                                                                                        | PASS — 0/0 errors.                                                                                                                                                                                                                                                               |
| `pnpm --filter web run check`                                                                                                                                                                                                                                  | PASS — 0 errors, 0 warnings; run once at the end.                                                                                                                                                                                                                                |
| `pnpm db:rehearse supabase/migrations/20261018233421_task_props_version_guard.sql --check packages/shared-agent-ops/src/gateway/task-props-version-guard.check.sql --role-probe`                                                                               | PASS — custom CAS/rollback/legacy-call assertions plus all four standing checks. Only the task-update function body changed. No SECURITY findings. Role probe: anon 1 pre-existing failure before/after; authenticated 0 before/after; no new failures.                          |

`git diff --check` passed for all owned paths. Status and the entire owned diff were reviewed. No paid/live model calls, production writes, migration apply, deployment, commit, or subagent work.

### Regression-first evidence and additional edges

- Split: `pnpm --filter @buildos/shared-agent-ops exec vitest run src/gateway/` passed twice, each 24 files / 185 tests, before behavioral fixes.
- Stale reservation: `... vitest run src/gateway/write-audit.service.test.ts` first failed 4 / passed 3, then passed all 7. Racing completion and refreshed timestamps, CAS errors, and bounded retry are covered.
- Main creates: `... vitest run src/gateway/op-execution-gateway.create-idempotency.test.ts` first failed all 5. The next create/document/core-entity run passed 28 tests. Replays preserve human edits; different keys create different rows. Task-document path added on resumption (below); its link uses the existing idempotent edge RPC.
- Commit receipts/keys: `pnpm --filter web exec vitest run src/lib/server/agent-call/change-set-commit.test.ts` first failed 3 / passed 9. After that fix, six new sequential regressions failed / 12 passed; all 18 then passed. Unrelated drift remains protected, props baselines are key-scoped, and re-entry restores prior results.
- Direct props: `... vitest run src/gateway/op-execution-gateway.tasks.test.ts src/gateway/op-execution-gateway.core-entities.test.ts` first failed 6 / passed 34. The first turn's two green attempts were refused by test-gate, with a 60.04-second wait before the sole retry, and work stopped. On this authorized resumption, all 40 passed. Persistent contention stops after one retry; unrelated database errors do not retry.
- Task-document/atomic-props/merge contract: `... vitest run src/gateway/op-execution-gateway.create-idempotency.test.ts src/gateway/op-execution-gateway.documents.test.ts src/gateway/op-execution-gateway.tasks.test.ts` first failed 5 / passed 51, then passed all 56 after fixes. The SQL check failed against an empty migration on the production schema, proving stale props overwrote newer values; after adding the guard, it passed and confirmed no task or assignee write on conflict. The first sandboxed rehearsal could not initialize local PostgreSQL shared memory; the authorized local rehearsal ran outside the sandbox, never writing production.
- Tables: `... vitest run src/gateway/op-execution-gateway.tables.test.ts src/tables/table-repository.test.ts` first failed 4 / passed 34. After fixes, 37 passed and one expectation was corrected to the existing number-to-text format (`9,999`). Then an extra third-batch rollback regression failed / 38 passed; the fix removed the erroneous whole-operation rollback marker. All 39 table tests passed in the final shared suite. Coverage includes 1,500-row delete/retype, concurrent schema rename, fresh row values/versions, initial guard, cumulative progress on a 2,500-row failure, and complete receipts for undo.
- Ignored option: `pnpm --filter web exec vitest run src/lib/server/freshness-radar.service.test.ts` first failed 1 / passed 25 on an assertion that the obsolete option is absent. It passed in the final web run. Global search leaves only that negative assertion, no callers or type members.
- First full web run: 291 passed / 2 failed because neighboring integration assertions still required merge guidance and treated a months-old pending fixture as fresh. Updated those assertions for the intended contract; final 293/293 pass.

### DJ action

Apply and record **only** `supabase/migrations/20261018233421_task_props_version_guard.sql` before deploying the gateway changes. It is rehearsed but deliberately unapplied. The existing production RPC ignores the new guard until this migration is applied.

```sh
supabase db query --linked -f supabase/migrations/20261018233421_task_props_version_guard.sql
supabase migration repair --status applied 20261018233421 --linked
```

Do not replay the unrelated earlier local migrations reported by rehearsal. Claude's light check remains outstanding.

## Log

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18 (Codex, first pass): pure split and items 2–4 validated. Item-5 green run was refused twice by test-gate after a 60.04-second wait; stopped as instructed and reported incomplete work.
- 2026-10-18 (Codex, resumed): DJ explicitly authorized the new migration and verifier input/tests. Finished all eight items and the task-document/atomic-props follow-ups. Regressions failed before their fixes; final tests, typechecks, builds and migration rehearsal pass. Runtime declaration build needed one bounded 6 GiB heap retry. No migration applied and no commit. DONE — awaiting Claude check.
- 2026-10-18 (Claude light check of 126–135): items 1–8 pass review. Full verify (`turbo build`/`test:run`) found the runtime declaration build out of memory at the default heap, which blocks every deploy, plus 2 stale tests. Reopened with items 9–11. The migration `20261018233421` rehearses clean; apply order doesn't matter (the guard works once the migration and the code are both live).

- 2026-10-18 (Codex follow-up, item 9): fixed the Tasker 132 declaration dependency expansion with one return-type annotation. Identical timed runtime builds under the 2 GiB cap went from OOM / 2,089,287,680-byte peak RSS to PASS / 1,477,197,824-byte peak RSS. Recorded promptly for other chats; continuing items 10–11.
- 2026-10-18 (Codex follow-up complete): items 9–11 DONE. Final runtime build passes at 2 GiB (1,488,109,568-byte peak RSS); 800 focused tests, all required typechecks/builds, and the single final web check pass. Regressions failed first. Vite config timestamp refreshed after web check; contents unchanged. No paid calls, migration applied, production writes, deployment, commit or subagents. DONE — awaiting Claude check.
- 2026-10-18 (Claude check of the follow-ups): items 9–11 pass.
    - Item 9: one return-type annotation on `updateDocument`. The runtime builds under the 2 GB Railway cap, and the full `turbo build` passes.
    - Item 11: recovery rebuilds each create id from the same `agent-run:<run>:<change>` key the commit path uses (`change-set.ts:725`).
    - The full test suite and all type checks pass.

## Follow-up report — 2026-10-18 (items 9–11)

- **9 DONE:** fixed the declaration dependency expansion caused by the document-handler split. No heap increase. The final runtime build still passes at 2 GiB, with **1,488,109,568-byte peak RSS** and 5.33 s elapsed. Initial before/after evidence is recorded under item 9 above.
- **10 DONE:** aligned the catalog regression and prompt guidance with replace/append. Catalog-fitness and calendar files remain with tracker 130.
- **11 DONE:** reconcile landed creates before returning a proposal to review or marking changes not applied. The shared UUID helper preserves the existing namespace and byte-for-byte hash inputs. Recovery only reads entity rows, batches by table, and retains the terminal CAS against concurrent re-entry. This addresses durable creates; other operation types still depend on success telemetry, and independent proposals are not semantically deduplicated.

### Follow-up files changed

Seven source/test files plus this tracker; earlier items 1–8 and other chats' changes are preserved.

- `packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.ts`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.create-idempotency.ts`
- `packages/shared-agent-ops/src/gateway/change-set.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.test.ts`
- `apps/web/src/lib/server/agent-call/change-set-commit.test.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts`
- `tasker/132-approved-changes-never-duplicate.md`

### Follow-up validation

All heavy commands ran sequentially through `test-gate run '<command>'`, with real host memory checks and no worker overrides. **800 tests passed, 0 failed across 58 files** (unique final suites; focused reruns not double-counted). Logs: `/tmp/tasker132-followup/`.

| Exact command inside test-gate                                                                                                                                                                                                                                 | Result                                                                                   | Log                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm --filter @buildos/shared-agent-ops exec vitest run src/gateway/ src/proposal-context/ src/tables/`                                                                                                                                                       | PASS — 36 files, 389 tests                                                               | `13-shared-tests.log`        |
| `pnpm --filter web exec vitest run src/lib/server/agent-call/ src/lib/server/project-suggestion-actions.service.test.ts src/lib/server/freshness-radar.service.test.ts src/lib/server/inbox.service.test.ts src/lib/server/inbox-chat-session.service.test.ts` | PASS — 18 files, 301 tests                                                               | `15-web-tests.log`           |
| `pnpm --filter @buildos/worker exec vitest run tests/changeSetDrift.test.ts tests/freshnessRadarWorker.test.ts`                                                                                                                                                | PASS — 2 files, 30 tests                                                                 | `16-worker-tests.log`        |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/catalog/definitions/ontology-write.test.ts`                                                                                                                                                   | PASS — 1 file, 7 tests                                                                   | `07-merge-catalog-green.log` |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts`                                                                                                                                                        | PASS — 1 file, 73 tests                                                                  | `08-merge-prompt-green.log`  |
| `pnpm --filter @buildos/shared-agent-ops build`                                                                                                                                                                                                                | PASS — bundles and declarations, exit 0                                                  | `11-shared-build.log`        |
| `/usr/bin/time -l env NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @buildos/agentic-chat-runtime build`                                                                                                                                                | PASS — CJS/ESM/DTS, exit 0; final peak RSS 1,488,109,568 bytes                           | `14-runtime-final-build.log` |
| `pnpm --filter @buildos/shared-agent-ops run typecheck`                                                                                                                                                                                                        | PASS, exit 0                                                                             | `17-shared-types.log`        |
| `pnpm --filter @buildos/agentic-chat-runtime run typecheck`                                                                                                                                                                                                    | PASS, exit 0                                                                             | `18-runtime-types.log`       |
| `pnpm --filter @buildos/worker run typecheck`                                                                                                                                                                                                                  | PASS, exit 0                                                                             | `19-worker-types.log`        |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                                                                                            | PASS — 0/0 errors                                                                        | `20-worker-test-types.log`   |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                                                                                        | PASS — 0/0 errors                                                                        | `21-web-test-types.log`      |
| `pnpm --filter web run check`                                                                                                                                                                                                                                  | PASS — 0 errors, 0 warnings; single final invocation, Vite timestamp refreshed afterward | `22-web-check.log`           |

Regression-first evidence: item 9's timed build failed with OOM before the annotation and passed afterward at the same cap. Item 10's catalog first failed 1/7; the new prompt assertion first failed 1 with 72 skipped, then all 73 passed. Item 11 first failed 6/24, then the expanded task/task-document cases failed 8/26; after the fix all 26 passed (`12-recovery-green.log`) and passed again in the required web suite.

Self-review: read the full follow-up diff and checked owned-file status and whitespace. Additional edges: the explicit document result type retains optional edit receipts (shared build/types and both apps' typechecks pass); non-document tools still omit merge options; recovery preserves later human edits, handles mixed success receipts and durable task rows, stops on lookup failure, and keeps the existing CAS race tests green. Existing-document attachment is deliberately excluded from create-row inference. No natural-language classification was added. No paid calls, production writes, migration application, deployment, reset, commit, or subagent work.

DJ action remains the earlier migration application/recording step for `20261018233421_task_props_version_guard.sql`. No new migration was needed for items 9–11; the earlier rehearsal evidence remains unchanged. Claude's light check is next.
