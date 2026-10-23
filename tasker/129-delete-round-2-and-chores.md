<!-- tasker/129-delete-round-2-and-chores.md -->

# 129 — Delete round 2 and small chores

**Status:** CHECKED by Claude 2026-10-18 — items 1, 2, 4, 5, 6 pass; item 3 completed in tracker 137, awaiting Claude check · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

About 4k more dead lines gone, and production values become the code defaults, so a lost Railway variable can no longer silently switch live answer streaming or receipt text off.

## Files you own

- apps/worker/scripts/{test-scheduler.ts, project-loop-timeout-generations.mjs, project-loop-provider-throughput.mjs, jev-context-eval.ts, jev-global-context-eval.ts, project-review-rollup-replay.ts}
- packages/agentic-chat-runtime/src/context/context-loader.ts (the fallback loaders only)
- packages/shared-agent-ops/src/ontology/onto.ts, onto-api.ts (the deprecated FSM/template chain only)
- apps/worker/src/workers/agentic-chat/host/config.ts (two defaults) and its tests
- one new migration in supabase/migrations/
- point-in-time docs stamped by `pnpm fix:doc-health`

## Work, in this order

**Current disposition:** item 3 is DONE under tracker 137 (2026-10-18). Claude already checked
items 1, 2, 4, 5 and 6, including the repaired item-4 rehearsal; the earlier report below is
historical. The Question Tree migration remains unapplied for DJ.

1. [x] **Delete 6 stale one-off worker scripts (~3.3k lines)**
    - `apps/worker/scripts/test-scheduler.ts`, `project-loop-timeout-generations.mjs`, `project-loop-provider-throughput.mjs`, `jev-context-eval.ts`, `jev-global-context-eval.ts`, `project-review-rollup-replay.ts`. None is in a package.json script; the decisions they informed shipped Apr–Sept.
    - Before deleting each one, grep the repo for its name. Skip any that a package.json script, CI workflow or a non-archived runbook still uses, and note it here.
2. [x] **Delete the unreachable context-loader fallback loaders (~450 lines)**
    - `packages/agentic-chat-runtime/src/context/context-loader.ts`: `loadProjectContextData`, `loadLinkedEntities`, `loadEntityContextData` (~:2960-3342) and the branches that call them (~:3758-3828). `scope.ts:72-81` always routes project chats to the RPC, and the loader returns before reaching them (~:3740).
    - Prove unreachability first (trace every caller). This also removes an RLS-widening fallback that is one edit away from going live.
3. [x] **DONE — Delete the deprecated FSM/template chain**
    - `packages/shared-agent-ops/src/ontology/onto.ts` and `onto-api.ts`: the code marked `@deprecated` ("FSM is no longer used") with 0 external users. Keep every entity Zod schema; the scanner flagged some of them as unused by mistake.
4. [x] **BLOCKED — Migration that drops the Question Tree database objects (write and rehearse; DJ applies)**
    - The Question Tree code was deleted in round 1; its database objects are still in production. Write `supabase/migrations/<timestamp>_drop_question_tree_experiment.sql` that drops: tables `question_tree_runs`, `question_tree_nodes`, `question_tree_proposals`, `question_tree_events` (their triggers, indexes and policies go with them); functions `admit_question_tree_proposals`, `claim_question_tree_batch`, `complete_question_tree_run`, `control_question_tree_run`, `create_question_tree_run_with_job`, `enqueue_question_tree_advance`, `question_tree_assign_event_seq`, `question_tree_normalize_question`, `retry_question_tree_node` (use the exact signatures from `20260801040100`, `20260801040300` and `20260802010100`).
    - Check that no other function, view or job references them (grep `supabase/migrations` and `packages/shared-types/src/functions`). Leave the `admin_question_tree` job type value alone if a constraint or enum lists it.
    - Run `pnpm db:rehearse supabase/migrations/<file>.sql` and fix any finding. **Do not apply it.** Applying deletes 3 experiment runs from August; DJ applies it. After he does, `pnpm gen:all` regenerates the types.
5. [x] **Make the production values the code defaults**
    - In `apps/worker/src/workers/agentic-chat/host/config.ts`, `AGENTIC_CHAT_LIVE_TEXT_PREVIEW` and `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT` default to `false`, but production sets both to `true`. Flip both defaults to `true`, update the stale comments ("Off until the gate judges the copy"), and update the config tests. No production behavior changes.
6. [x] **Stamp the 9 unstamped point-in-time docs**
    - Run `pnpm fix:doc-health`, read the diff (it should only add the standard banner), and confirm `pnpm check:doc-health:strict` passes.

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

- `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/context/` and `pnpm --filter @buildos/agentic-chat-runtime run typecheck`
- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/ontology/` and `pnpm --filter @buildos/shared-agent-ops run typecheck`
- `pnpm --filter @buildos/worker exec vitest run tests/agenticChatConfig.test.ts` (or whichever test covers `loadAgenticChatConfig`)
- Packages are consumed through `dist`: after changing `@buildos/agentic-chat-runtime`, `@buildos/shared-agent-ops`, run `pnpm --filter <pkg> build` before typechecking or testing an app that imports it. If two agents build the same package at once and the build fails strangely, rerun it.
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter web run check` once at the end (heavy). If a local dev server is running, run `touch apps/web/vite.config.ts` afterwards; `check` deletes the dev proxy types and every page 500s until Vite restarts.
- `pnpm --filter web run typecheck:tests`
- `pnpm db:rehearse supabase/migrations/<your file>.sql`
- `pnpm check:doc-health:strict`

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
4. Anything DJ must do: Apply the Question Tree drop migration (`supabase db query --linked -f <file>`, then `supabase migration repair --status applied <version> --linked`), then `pnpm gen:all`.

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Blocked

- Item 3 resolved by tracker 137: removed the authorized unused `FSMDef` import and the
  externally unused FSM/template declaration chain. `FacetDefaults`, facets, ProjectSpec,
  document-tree and every entity Zod schema remain unchanged. Ontology tests pass 134/134
  both before and after deletion; shared-agent-ops typecheck passes. Consumer checks are
  recorded in tracker 137.
- Item 4 validation: the draft migration applies successfully to production's schema in
  disposable local Postgres, with no SECURITY findings, but the standing
  `account_deletion_purge.check.sql` fails at
  `supabase/tests/fixtures/account_deletion_purge_seed.sql:116`: its unconditional insert
  still targets `question_tree_runs` (the next insert also targets `question_tree_nodes`).
  That existing fixture is outside the owned files. It must be updated and the full rehearsal
  must pass before DJ applies the migration. No standing check was skipped or changed.

## Completed agent report — 2026-10-18

### 1. Work items

1. **DONE:** Deleted all six scripts (3,318 lines). Searched the whole repo, including hidden
   workflow/config paths, for every basename first. No package script, CI workflow, or active
   runbook uses them; surviving mentions are point-in-time research/design records and comments.
2. **DONE:** Removed all three fallback loaders, their calling branches, and six fallback-only
   declarations (461 net lines). The functions were closure-private: their only callers were the
   removed branches and the entity fallback itself. The only exported entry is
   `loadFastChatPromptContext`; production callers are the web preparation/prewarm adapters and
   the worker workflow adapter. `resolveRpcContextType` sends project scopes (including legacy
   aliases) and ontology scopes with a nonblank focused project to the RPC; successful loads
   return there and every failed/null project RPC returns before the old branches. One malformed
   exception was found: a whitespace-only ontology project ID skipped the RPC but reached the
   truthiness-based fallback. A new regression failed on that table read before deletion and now
   passes. Global and daily-brief loaders, RPC mapping, and entity schemas remain intact.
3. **DONE (tracker 137 follow-up, 2026-10-18):** Removed the now-authorized unused
   `FSMDef` import and 250 lines of externally unused FSM/template declarations from
   `onto.ts` / `onto-api.ts`. Every entity Zod schema and the used facet types remain intact.
   See tracker 137 for final downstream validation.
4. **BLOCKED (validation):** Wrote
   `supabase/migrations/20261018212708_drop_question_tree_experiment.sql`. It locally drops the
   four tables and nine listed functions, plus the two realtime trigger functions discovered in
   `20260801040200`. It surgically removes the obsolete statement from the deployed account-purge
   function without changing its other behavior, owner, grants, or search path. It preserves the
   queue enum. Rehearsal applied all 187 schema changes locally, found zero SECURITY/other
   findings, and passed 3/4 standing checks; the old fixture prevents the fourth from running.
   The role probe found zero new failures (anon has one pre-existing failing relation;
   authenticated has none). A production READ ONLY audit confirmed the purge function is the
   sole external function reference, with no views, materialized views, cron job table, or
   Question Tree queue rows. Production still has 3 runs, 229 nodes, 385 proposals and 997 events.
   **Do not apply until the fixture is fixed and the full rehearsal passes.**
5. **DONE:** Both worker config defaults are now `true`, with current comments. Missing and
   empty env values use the production defaults; explicit `false` still disables either flag,
   and invalid booleans still throw. Both changed regression tests failed first.
6. **DONE:** `pnpm fix:doc-health` stamped exactly nine documents. Compared against a saved
   pre-stamp snapshot: only the four standard banner lines were inserted in each file. The
   strict check reports zero dead-schema, dead-path and unstamped findings across 1,736 docs.

### 2. Files changed

- Deleted:
    - `apps/worker/scripts/test-scheduler.ts`
    - `apps/worker/scripts/project-loop-timeout-generations.mjs`
    - `apps/worker/scripts/project-loop-provider-throughput.mjs`
    - `apps/worker/scripts/jev-context-eval.ts`
    - `apps/worker/scripts/jev-global-context-eval.ts`
    - `apps/worker/scripts/project-review-rollup-replay.ts`
- Modified: `packages/agentic-chat-runtime/src/context/context-loader.ts`.
- Added: `packages/agentic-chat-runtime/src/context/context-loader.rpc-boundary.test.ts`.
- Modified: `apps/worker/src/workers/agentic-chat/host/config.ts` and
  `apps/worker/tests/agenticChatConfig.test.ts`.
- Added: `supabase/migrations/20261018212708_drop_question_tree_experiment.sql` (unapplied).
- Stamped:
    - `docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md`
    - `docs/architecture/JEV_EMAIL_SCAN_2026-09-24.md`
    - `docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md`
    - `docs/technical/reviews/BUILDOS_MCP_PERMISSION_IMPLEMENTATION_2026-09-30.md`
    - `docs/technical/reviews/SUPABASE_CONTAINMENT_IMPLEMENTATION_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_FITNESS_AUDIT_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_FITNESS_DECISION_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_MIGRATION_STATUS_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_WORK_ORDER_AND_QUEUE_WAKE_2026-09-24.md`
- Updated this tracker. As required by Checks, touched `apps/web/vite.config.ts` after both
  SvelteKit-sync checks to restart the running dev server; its content has no diff.

### 3. Commands and self-check

Heavy validation ran serially through `test-gate run`; no worker-limit overrides were used.

| Command                                                                                                                      | Result                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/context/context-loader.rpc-boundary.test.ts` before removal | **1 failed**, on the unexpected `onto_projects` read, as intended                                      |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/context/` after removal                                     | **41 passed**, 5 files                                                                                 |
| `pnpm --filter @buildos/agentic-chat-runtime run typecheck`                                                                  | PASS, 0 errors                                                                                         |
| `pnpm --filter @buildos/shared-agent-ops exec vitest run src/ontology/`                                                      | **134 passed**, 12 files                                                                               |
| `pnpm --filter @buildos/shared-agent-ops run typecheck`                                                                      | PASS, 0 errors                                                                                         |
| `pnpm --filter @buildos/agentic-chat-runtime build`                                                                          | PASS, JS and declarations built before worker/app checks                                               |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatConfig.test.ts` before config fix                            | **2 failed / 19 passed**, both changed default tests failed as intended                                |
| Same worker config command after fix                                                                                         | **21 passed**, 1 file                                                                                  |
| `pnpm --filter @buildos/worker run typecheck`                                                                                | PASS, 0 errors                                                                                         |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                          | PASS, test type debt **0/0**                                                                           |
| `pnpm --filter web run check` (once)                                                                                         | PASS, **0 errors / 0 warnings**                                                                        |
| `pnpm --filter web run typecheck:tests`                                                                                      | PASS, test type debt **0/0**                                                                           |
| `pnpm db:rehearse supabase/migrations/20261018212708_drop_question_tree_experiment.sql`                                      | **FAIL overall:** local DDL succeeds, **3 standing checks pass / 1 fails** on the out-of-scope fixture |
| Same rehearsal with `--role-probe --json /tmp/task129-question-tree-rehearsal.json`                                          | Same **3 pass / 1 fail**; **0 role regressions**, **0 findings**                                       |
| `pnpm fix:doc-health`                                                                                                        | PASS, **9 stamped**, banner-only diff verified                                                         |
| `pnpm check:doc-health:strict`                                                                                               | PASS, **0 findings**, 1,736 documents                                                                  |
| Scoped `git diff --check` and new-file whitespace check                                                                      | PASS                                                                                                   |

The initial sandboxed rehearsal could not reach the schema source; the permitted retry refreshed
production's schema and completed the local checks above. A read-only dependency query first
reported that `cron.job` does not exist, then the corrected audit passed. No migration was applied
to production. Shared-agent-ops was not rebuilt because its files were left unchanged.

All **three changed/new regression tests were seen failing before their fixes and pass now**;
the final focused suites total **196 passing tests**. The migration fixture failure remains
explicitly unresolved; it is not a passing validation result.

Skeptical review and extra edge cases:

- Script deletion: checked package commands and hidden CI references, not just source imports.
- Loader: checked failed/empty authorizing RPCs and focused-table behavior in the existing suite;
  the added malformed-ID test proves no project-table read without an RPC scope.
- FSM chain: retained the unused-but-resolved import and the genuinely used facet-default type
  rather than leaving an unresolved export outside the owned files.
- Migration: drops the cyclic runs/nodes tables together without `CASCADE`, removes both
  otherwise-orphaned trigger functions, preserves the enum and purge grants, and fails if the
  expected purge statement has drifted. The role probe confirms no new client read failures.
- Defaults: empty values, explicit opt-outs, and invalid values are covered.
- Docs: compared every stamped file to its immediate pre-stamp contents; no body edits.

Re-read the full owned diff and inspected `git status --porcelain`. All authored changes are
owned files, the permitted adjacent test, or this tracker; other agents' work was left alone.
No new matching of user/model prose, paid/model calls, production writes, deployment changes,
commits, stashes, resets, or reversions.

### 4. DJ follow-up

1. Item 3 is complete under tracker 137; no further permission or implementation is needed.
   The used facet types and every entity schema are preserved.
2. Update the out-of-scope account-deletion fixture to stop seeding the retired experiment;
   rerun the full migration rehearsal with `--role-probe`. **Do not apply the draft until all
   standing checks pass.**
3. After that check passes, DJ applies and records only this file, then regenerates types:

```sh
supabase db query --linked -f supabase/migrations/20261018212708_drop_question_tree_experiment.sql
supabase migration repair --status applied 20261018212708 --linked
pnpm gen:all
```

## Log

- 2026-10-18: created from the code triage (Claude).

- 2026-10-18: Codex finished the scoped agent pass and self-check. Items 1, 2, 5 and 6 DONE; item 3 blocked by the out-of-scope FSMDef import, and item 4 drafted/rehearsed but blocked by the out-of-scope account-deletion fixture. 196 focused tests pass; all requested application/type/doc checks pass; migration standing checks are 3 passed / 1 failed. No migration applied or commit made; awaiting Claude check.
- 2026-10-18 (Claude light check of 126–135): items 1, 2, 5 and 6 OK. Item 4 unblocked: Claude made the Question Tree seed rows in `supabase/tests/fixtures/account_deletion_purge_seed.sql` conditional on the tables existing. The drop rehearsal now passes all 4 standing checks, and the check also passes before the drop. Two worker tests still expected the old defaults, and item 3's one-line blocker (unused `FSMDef` import) was left; both moved to tracker 137 items 1–2.

- 2026-10-18 (Codex, tracker 137 item 2): completed only delegated item 3. Global source-reference search confirmed no consumers beyond the unused import and obsolete chain; removed 251 lines across onto.ts, onto-api.ts and the unused import. Preserved entity/facet schemas and unrelated checked work. Ontology tests 134/134 before and after; shared typecheck passed. Final downstream checks are recorded in tracker 137.

- 2026-10-18 (Codex, tracker 137 final validation): item 3 downstream checks are complete. Shared/runtime builds and typechecks, worker source/test typechecks, web source/test typechecks all pass; web check has 0 errors / 0 warnings. Tracker 137 records 451 focused passing tests and the full self-check. Item 3 DONE — awaiting Claude check; other items unchanged.
