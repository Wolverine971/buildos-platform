<!-- tasker/135-first-send-faster.md -->

# 135 — First send faster

**Status:** CHECKED by Claude 2026-10-18 — passes; migration rehearses clean · **Priority:** P3 · **Opened:** 2026-10-18 · **Size:** ~half a day

**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

A new user's first chat message starts one database round trip sooner, and every send saves a serial lookup (~30-80 ms).

## Files you own

- `apps/web/src/routes/api/agent/v2/turns/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-inline-admission.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts`
- one new migration in supabase/migrations/
- the test files next to these

## Work, in this order

1. [x] **Return the created session row from the admission RPC**
    - On a first send, `turns/+server.ts` calls `create_agentic_chat_turn_with_job`, then `loadAdmittedWorkerSession` reads the session it just created. Write a migration that redefines the RPC (copy its live definition from the latest migration) to also return the created session row, additively. Make the route use it when present and fall back to `loadAdmittedWorkerSession` when absent, so web and database can deploy in either order.
    - Run `pnpm db:rehearse`. **Do not apply it**; DJ applies.
2. [x] **Run the transport-decision lookup in parallel with preparation**
    - `turns/+server.ts:~120` → `worker-turn-inline-admission.server.ts:~39` looks up an existing transport decision serially before preparing the turn; for a fresh `clientTurnId` it always misses. Start it in parallel and await it before building the RPC args. Keep the retry/idempotency behavior exactly as is.

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

- `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts src/routes/api/agent/v2/turns/` (plus any inline-admission test)
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
4. Anything DJ must do: Apply the admission RPC migration.

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Blocked

- None remaining from implementation validation. The original UUID/string type error was fixed, and the shared coordinator web-check rerun on 2026-10-18 passed with 0 errors and 0 warnings. Claude review and DJ's migration application remain handoff steps.

## Log

- 2026-10-18 (coordinator inspection): Ran `test-gate run 'pnpm --filter web run check'` once for the completed taskers; exit 0, **0 errors and 0 warnings**. Log: `/tmp/tasker-131-135-review-web-check.log`. This supersedes the pending-web-check statements in the original implementation report. Confirmed the explicit `string` annotation and compared the admission function with its source migration: only the in-transaction session refresh and additive receipt changed. No implementation files changed during this inspection; the migration remains unapplied. Status advanced to DONE — awaiting Claude check.

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18: Codex implemented both items after observing their web/SQL regressions fail. Focused suite: 97 passed; strengthened parser edge cases: 19 passed; migration rehearsal: 5 SQL assertions plus 4 standing checks passed with no new security/role failures; test typecheck: 0 errors. The one full web check found 1 owned type error, corrected afterwards; its rerun remains pending under the one-run limit, so status is not marked DONE. Migration remains unapplied; no commits, live model calls, or production writes.
- 2026-10-18 (Claude light check of 126–135): items 1–2 OK. The function keeps its signature, invoker security and grants. Old web ignores the new `session` key, and new web falls back when it's missing, so apply and deploy can happen in either order.

## Implementation report — 2026-10-18

1. **DONE — session receipt.** The ordinary admission RPC returns an additive `session` row on a sessionless new admission. It refreshes the row inside the transaction after message triggers update counters/timestamps. The server adapter validates session/owner identity and the route uses the row when available; older RPCs, unusable optional rows, and duplicate retries retain the best-effort owned lookup. The latest migration's function body was verified verbatim against the cached production schema before copying it. No migration was applied to production.
2. **DONE — parallel decision lookup.** Ordinary preparation starts alongside the owned transport lookup. A server-minted candidate is used for preparation, where the id is only copied into args; the resolved persisted-or-new id is bound when constructing the actual RPC arguments on both attempts. Transport failures retain priority and never admit. Explicit review intents keep their separate admission path. Preparation rejections are observed even if transport lookup returns first.

### Files changed

- `apps/web/src/routes/api/agent/v2/turns/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/server.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-inline-admission.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.check.sql` (new adjacent SQL regression)
- `supabase/migrations/20261018215559_agentic_chat_admission_session_receipt.sql` (new, unapplied)
- `tasker/135-first-send-faster.md`

### Validation evidence

All heavy commands ran sequentially through `test-gate run '<command>'`, with its worker limits. Queued runs obtained a slot; none bypassed the gate. No extra agents, paid/live model calls, production writes, deployments, or commits.

| Exact command inside `test-gate run`                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts src/routes/api/agent/v2/turns/server.test.ts`                                                 | Item 1 red: **58 passed, 2 failed** (adapter dropped the session; route ignored the receipt). After fix: **60 passed, 0 failed**.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm --filter web exec vitest run src/routes/api/agent/v2/turns/server.test.ts`                                                                                                                | Item 2 red: **41 passed, 2 failed** (preparation had not started while either new-turn or duplicate lookup was pending).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts src/routes/api/agent/v2/turns/`                                                               | After both fixes: **97 passed, 0 failed**, 7 files. Includes the two concurrency regressions, review routing, duplicate/conflict behavior, and race retries.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts`                                                                                              | Self-review strengthened the two wrong-owner/wrong-session fixtures so they are otherwise valid: **19 passed, 0 failed**.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm db:rehearse supabase/migrations/20261018215559_agentic_chat_admission_session_receipt.sql --check apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.check.sql --role-probe` | **Final pass:** 5 admission/session assertions plus all 4 standing checks; 0 new SECURITY findings or role failures. Anon had 1 existing read failure before and after; authenticated had 0 before/after. First attempt failed on the fixture helper's missing EXECUTE grant; after fixing the fixture, the missing-session regression failed against the unchanged RPC. Two intermediate runs caught/diagnosed a stale pre-trigger session row, then the in-transaction refresh passed. Each failed rehearsal had 1 failed custom check and all 4 standing checks passing. |
| `pnpm --filter web run check`                                                                                                                                                                   | **Failed: 1 error, 0 warnings**, solely the route's UUID-template-literal/string assignment. Fixed with an explicit `string` annotation; no runtime change. Full rerun **not run** under the tracker's one-run limit. Log: `/tmp/tasker135-web-check.log`.                                                                                                                                                                                                                                                                                                                  |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                         | **Passed: 0/0 errors**, after the route annotation fix. Log: `/tmp/tasker135-test-types.log`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

The two item-1 web regressions, the SQL session regression, and both item-2 concurrency regressions were each observed failing before their fixes and passing afterwards. Additional compatibility and failure-order coverage protects unchanged behavior. Focused tests prove the removed round trip and concurrency ordering; no live latency measurement was performed.

### Self-review and handoff

- Tasker 125 was rechecked: CHECKED by Claude; its byte-identical sessionless replay remains implemented in `worker-transport-client.ts`. This task preserves duplicate-first admission and the fallback row read used by that replay.
- Re-read the full TypeScript/test diff and compared the complete copied RPC with its latest definition: only the session refresh and additive receipt changed; grants, rate limits, duplicate resolution, prepared claims, and queue behavior remain intact.
- Item 1 extra edge: message triggers change session counters/timestamps; the SQL regression compares the entire returned row to stored state. Old database, duplicate, failed fallback, and wrong-owner/session rows are covered.
- Item 2 extra edge: preparation can reject before or after a transport conflict; both orders are covered, with no unhandled rejection or admission. A prepared-claim retry reuses the resolved id and performs only one transport lookup.
- Static checks were sequential. During the full web check, memory briefly fell below the gate cutoff; it finished before any stop signal was sent. No processes were killed. The dev server was running, so `touch apps/web/vite.config.ts` restored proxy types after both static commands (mtime only; no content change).
- `git status --porcelain` reviewed; other agents' changes left untouched. Owned-file `git diff --check` passed. No new regex/keyword classification of user or model meaning.
- **DJ/Claude:** rerun `pnpm --filter web run check` when the machine is ready; touch `apps/web/vite.config.ts` afterwards if dev is running. This remaining check prevents a DONE status. After review, apply only `20261018215559_agentic_chat_admission_session_receipt.sql` and record version `20261018215559` as applied. Web and database may deploy in either order. Claude's light check is still required.
