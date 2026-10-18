<!-- tasker/126-chat-gets-the-facts-right.md -->

# 126 — Chat gets the facts right

**Status:** DONE — awaiting Claude check · **Priority:** P1 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

The model stops seeing archived goals as active, stops telling people the wrong day for evening events, stops claiming a saved task was "not yet created", stops caching a broken "you have 0 projects" context, and answers are no longer cut off when they mention an `<analysis>` tag.

## Files you own

- `packages/agentic-chat-runtime/src/tools/ontology-reads.ts`
- packages/agentic-chat-runtime/src/loop/write-ledger.ts (create targets / `extractIdFromArgs` only; leave the calendar reconnect handling ~:478 to tasker 130)
- `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- `apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`
- `packages/smart-llm/src/response-parsing.ts`
- `apps/web/src/lib/services/smart-llm/response-parsing.ts`
- the test files next to these

## Work, in this order

1. [x] **get_onto_project_details includes archived goals, plans, milestones and START HERE candidates**
    - Size S · now at `packages/agentic-chat-runtime/src/tools/ontology-reads.ts:625`
    - What goes wrong: A goal archived last week appears as active and is counted, while the list and search tools filter it out; the model contradicts itself across tools.
    - Fix: Add .is('archived_at', null) to the goals, plans, milestones and context-document queries.
    - Regression test: `packages/agentic-chat-runtime/src/tools/ontology-detail-reads.test.ts`
2. [x] **Lowercase English 'or' becomes boolean OR in search (regex on language)**
    - Size S · now at `packages/agentic-chat-runtime/src/tools/ontology-reads.ts:264`
    - What goes wrong: 'notes from Sam or Alex meeting' is split into a two-way OR search; the schema documents only uppercase 'A OR B'. Make it case-sensitive or take a structured array.
    - Fix: One case-sensitive `OR` operator helper for all five sites (model-authored query syntax), or a structured any_of: string[] argument.
    - Regression test: `packages/agentic-chat-runtime/src/tools/ontology-reads.test.ts`
3. [x] **A failed write falls back to project_id as its target, so the implicit contract can never be met**
    - Size S · now at `packages/agentic-chat-runtime/src/loop/write-ledger.ts:498`
    - What goes wrong: create_onto_task fails, then the retry succeeds: the failed entry stays an outcome targeting the project, and terminal-text-integrity appends 'Done: 0 of 1 creations. Not yet created: <project name>' to a correct answer.
    - Fix: Never take a create's entityId from args; limit extractIdFromArgs to the entity's own id key; implicit create outcomes get targetIds [].
    - Regression test: `packages/agentic-chat-runtime/src/loop/turn-contract.test.ts`
4. [x] **Degraded context is cached like a good snapshot (2 min in session, 15 min materialized)**
    - Size S · now at `apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.ts:150`
    - What goes wrong: The global RPC and its fallback both fail, so the model is told the user has 0 projects, and that persists across turns until the cache expires (materialized-context-cache.server.ts:156). Fix: don't cache when contextLoadSource !== 'rpc'.
    - Fix: Skip the snapshot write and null the cache token when contextLoadSource !== 'rpc'. (Lives in apps/web, not the runtime.)
    - Regression test: `apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.test.ts`
5. [x] **Live chat answer truncated after a literal <analysis>/<thinking> tag**
    - Size S · now at `packages/smart-llm/src/response-parsing.ts:385`
    - What goes wrong: filterThinkingTokens runs on every worker SSE chunk (sse.ts:103). A user asks about the <analysis> element, the model writes it literally, and every later chunk is dropped until a closing tag that never comes. A tag split across chunks leaks through. This is also a lexical filter on model prose.
    - Fix: Stop scanning visible content for tags; rely on the structured reasoning channel both paths already read. Fix the web copy too (apps/web/src/lib/services/smart-llm/response-parsing.ts:235).
    - Regression test: `packages/smart-llm/src/response-parsing.test.ts`
6. [x] **Real instants at exactly UTC midnight rendered as date-only**
    - Size M · now at `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts:3688`
    - What goes wrong: An event at 8 PM EDT (00:00Z) is printed with its UTC date and labelled '(tomorrow)', so the model tells the user the wrong day for evening events.
    - Fix: Decide date-only from structure (onto_events.all_day or a per-field dateOnly flag), not from the value's shape.
    - Regression test: `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts`

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

- `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/ontology-reads.test.ts src/tools/ontology-detail-reads.test.ts src/loop/turn-contract.test.ts src/loop/`
- `pnpm --filter @buildos/smart-llm exec vitest run src/response-parsing.test.ts`
- `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/materialized-context-cache.server.test.ts src/lib/services/agentic-chat-lite/prompt/`
- `pnpm --filter @buildos/agentic-chat-runtime run typecheck` and `pnpm --filter @buildos/smart-llm run typecheck`
- Packages are consumed through `dist`: after changing `@buildos/agentic-chat-runtime`, `@buildos/smart-llm`, run `pnpm --filter <pkg> build` before typechecking or testing an app that imports it. If two agents build the same package at once and the build fails strangely, rerun it.
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter web run check` once at the end (heavy). If a local dev server is running, run `touch apps/web/vite.config.ts` afterwards; `check` deletes the dev proxy types and every page 500s until Vite restarts.
- `pnpm --filter web run typecheck:tests`

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

## Blocked

- Validation only: `pnpm --filter web run check` was stopped (exit 137) after the machine reached ~44 GB of swap with two older checks still running. SIGTERM did not stop this agent's check; SIGKILL stopped only its own PID. No diagnostics were produced, so this check is **not passing**. `pnpm --filter web run typecheck:tests` was **not run** to avoid adding memory pressure. Rerun those two checks when capacity is available. All implementation items and focused regressions are complete.

## Log

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18: Codex completed all six fixes with observed failing regressions first. 615 focused tests pass; both package builds, both package typechecks, and both worker typechecks pass. Full web static checks remain pending due machine memory pressure (details below). Awaiting Claude check; no commit or deployment.

## Implementation report — 2026-10-18

All six defects were confirmed in the current checkout. Each bug's regression was observed failing before its final fix, then passing. Work stayed in the owned files and adjacent tests; the calendar reconnect portion of `write-ledger.ts` was left alone.

| Item | Result | Change and additional edge checked |
| --- | --- | --- |
| 1 | DONE | Filter archived goals, plans, milestones, and context documents before counting/selecting. The regression checks returned rows, counts, and START HERE selection. |
| 2 | DONE | Share one case-sensitive explicit `OR`/pipe syntax helper across all five sites. Lowercase/mixed-case conjunctions retain plain keyword matching; uppercase `OR`, pipes, and in-memory project matching are covered. |
| 3 | DONE | Create identities come only from receipts; other writes use only their own ID key (including table/edge aliases). Implicit creates have no pre-existing target IDs. Failed-then-successful retries fulfill the contract; a failed-only create remains unfulfilled. |
| 4 | DONE | Non-RPC loads have null cache tokens and never publish; already-cached degraded snapshots are rejected. Covers immediate/deferred writes, all non-RPC source values, next-turn recovery, and degradation during a generation-change reload. |
| 5 | DONE | Remove tag/bracket/punctuation-based reasoning detection from both parsers. Preserve literal visible content and reset the obsolete thinking state; structured reasoning parts remain hidden, including single-object content parts. Tests cover open/paired/split tags and later chunks. |
| 6 | DONE | Remove the UTC-midnight heuristic. Render instants in the viewer's zone; explicit all-day event metadata selects the event's civil-date zone (viewer zone when omitted). Carry this through focus, loaded work, digest, and intelligence signals; test the current clock at midnight and all-day events in Tokyo. No timestamp-shape inference. |

### Files changed

- `packages/agentic-chat-runtime/src/tools/ontology-reads.ts`
- `packages/agentic-chat-runtime/src/tools/ontology-reads.test.ts`
- `packages/agentic-chat-runtime/src/tools/ontology-detail-reads.test.ts`
- `packages/agentic-chat-runtime/src/loop/write-ledger.ts`
- `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- `packages/agentic-chat-runtime/src/loop/turn-contract.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.test.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts`
- `packages/smart-llm/src/response-parsing.ts`
- `packages/smart-llm/src/response-parsing.test.ts`
- `apps/web/src/lib/services/smart-llm/response-parsing.ts`
- `apps/web/src/lib/services/smart-llm/response-parsing.test.ts` (new)
- This tasker.

### Validation

Heavy commands use `test-gate`; no worker-cap overrides. Package builds preceded web validation. No paid/live model calls, production writes, migrations, deployments, or commits.

| Command | Result |
| --- | --- |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/ontology-reads.test.ts src/tools/ontology-detail-reads.test.ts src/loop/turn-contract.test.ts src/loop/` | PASS: 32 files, 451 tests |
| `pnpm --filter @buildos/smart-llm exec vitest run src/response-parsing.test.ts` | PASS: 1 file, 12 tests |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/materialized-context-cache.server.test.ts src/lib/services/agentic-chat-lite/prompt/ src/lib/services/smart-llm/response-parsing.test.ts` | PASS: 8 files, 152 tests |
| `pnpm --filter @buildos/agentic-chat-runtime build` | PASS |
| `pnpm --filter @buildos/smart-llm build` | PASS |
| `pnpm --filter @buildos/agentic-chat-runtime run typecheck` | PASS |
| `pnpm --filter @buildos/smart-llm run typecheck` | PASS |
| `pnpm --filter @buildos/worker run typecheck` | PASS |
| `pnpm --filter @buildos/worker run typecheck:tests` | PASS: 0/0 type errors |
| `pnpm --filter web run check` | STOPPED: exit 137, no diagnostics; memory pressure (see Blocked) |
| `pnpm --filter web run typecheck:tests` | NOT RUN: memory pressure (see Blocked) |

Regression failures observed: archive 1; corrected search tests 4; ledger/contract 3; cache 15; shared parser 9; web parser 10; prompt dates 5. Two additional Tokyo edge regressions failed before correcting event-zone handling. Final focused total: **615 passing tests, 0 failures**. Formatting and the owned-file diff were checked. A BuildOS Vite dev server was running, so `touch apps/web/vite.config.ts` was run after stopping the web check, as required above; its contents were not changed.

DJ action: none for implementation. The two web static checks need a later run when the machine has capacity; they have not been claimed as passing. Claude review is still pending.
