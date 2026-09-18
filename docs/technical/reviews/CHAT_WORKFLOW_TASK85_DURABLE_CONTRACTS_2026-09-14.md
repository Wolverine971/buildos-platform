<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK85_DURABLE_CONTRACTS_2026-09-14.md -->

# Task 85: durable workflow contracts and storage

**Date:** 2026-09-14  
**Decision that started it:** DJ chose the ambitious path. Waive the 82/84
stabilization gate as a freeze prerequisite, freeze the contract, and build storage
and readers with every writer off. In parallel, repair 82's Case 14 grounding so one
combined 82+83+84+85 gate can run.

**Result:** The interface is frozen and implemented. The disposable Postgres contract
and the Postgres race test pass, and both Task 85 migrations are applied to the isolated
QA database. At the initial September 14 closeout nothing was committed or deployed and
no writer was enabled. On September 15, the three workflow migrations were applied to
production; the migration files remain untracked in the current dirty worktree and must be
included in the intended repository change. No writer is enabled. The combined gate ran on
2026-09-15 and failed at 46/52, on two issues from before 85 (see below).

## What exists now

The [contract](../../architecture/agentic-chat-workflow-v1-contract.md) is marked
**interface freeze ready**. Section 16 lists the implementation, and the amendments
decided while building it.

| Area                                                                                | File                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Raw v4 request branch, context/plan/step storage and RPCs                           | `supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql`                                                 |
| Dispatch ledger, answer cursor, synthesis, resume, recovery, terminal sync, cleanup | `supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql`                                       |
| Shared constants, types, hash builders, reservation formula, raw-input validator    | `packages/shared-types/src/agentic-chat-workflow-contract.ts` (exported from the package index)                           |
| Worker readers                                                                      | `apps/worker/src/workers/agentic-chat/executionInput.ts`                                                                  |
| Hosted-shape test fixture                                                           | `supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql`                                                               |
| SQL contract                                                                        | `supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql`                                                         |
| Races and TS/SQL byte equality                                                      | `apps/worker/tests/agenticChatWorkflowV1.postgres.test.ts`                                                                |
| Unit tests                                                                          | `packages/shared-types/src/agentic-chat-workflow-contract.test.ts`, `apps/worker/tests/agenticChatExecutionInput.test.ts` |

The fixture is generated from read-only QA catalog extracts. The nine worker tables,
their triggers, grants, and every reachable Agentic Chat function body are exact
hosted definitions. The v4 path is therefore tested against the same artifact
triggers the real database runs, not a simplified copy.

## Proof

| Check                                                                                                                                | Result                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `psql -f supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql` on a fresh database                                        | Passed; prints `agentic_chat_workflow_v1_contract_ok`                                       |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatExecutionInput.test.ts tests/agenticChatWorkflowV1.postgres.test.ts` | 18/18 passed                                                                                |
| `pnpm --filter @buildos/shared-types exec vitest run src/agentic-chat-workflow-contract.test.ts`                                     | 5/5 passed                                                                                  |
| `@buildos/shared-types` typecheck, build, and `@buildos/worker` typecheck                                                            | Clean                                                                                       |
| SQL contract inventory                                                                                                               | Classified `self-contained-disposable`, so `scripts/database/run-sql-contracts.mjs` runs it |

What the SQL contract proves, against 85's required-proof list:

- **v2/v3 compatibility.** Prepared v2 and v3 artifacts still insert through every
  real trigger and still claim. A v3 row still requires its lifecycle snapshot. A
  prepared row carrying a raw request is rejected. Workflow recovery refuses ordinary
  turns (`policy_denied`).
- **Admission.**
    - The caller's request hash is not authority; a mismatch is rejected before any
      insert.
    - Unnormalized text is rejected.
    - Duplicate replay returns `matching_duplicate`, and a changed payload returns
      `idempotency_conflict`.
    - `active_turn_conflict` still applies.
    - A project the user cannot read returns `access_denied`.
    - A session bound to another project raises an error.
    - History freezes oldest-first from the admission transaction.
- **No dispatch from a raw request alone.** Before context acceptance, planner claim
  is `not_ready` and reservation is `stale_claim`.
- **Context.** First checkpoint wins, with exactly one durable progress event. Replay
  in a later generation is `already_accepted`. Deadline expiry and revoked access
  fail closed.
- **Steps.**
    - Claim replay is idempotent, and a competing attempt gets `claim_conflict`.
    - A late result from another attempt is `stale_claim`.
    - Evidence that does not resolve against the accepted context is rejected.
    - Accepted results are immutable, and a stale plan hash is `plan_conflict`.
    - Retry consumes attempts, and attempts exhaust at two, including across recovery.
    - With no accepted specialist the editor is skipped; with one, the synthesis must be
      `partial`.
- **Spend ledger.**
    - Reservation uses the fixed max-rate formula (2,000 bytes with 1,200 tokens is
      2,348 micro-USD).
    - Output ceilings are enforced per step; rates above the admitted maximum and paid
      tools are refused.
    - Begin grants exactly one permit, and a lost begin response never grants another.
    - Settlement requires the dispatch token, is idempotent, and conflicts on a changed
      amount.
    - Uncertain spend can only be resolved by a provider-backed reconciliation, which is
      idempotent.
- **Answer.** Offset and answer-identity conflicts are detected, batch replay is
  idempotent, and batches after an accepted synthesis are refused. Terminal outcomes
  map to `complete`, `partial`, `failed`, and `cancelled`.
- **Recovery.**
    - Ordinary `recover_agentic_chat_turn` still returns `finalize_failed` for a
      post-start turn, without mutating it.
    - Workflow recovery releases the unused permit, holds the in-flight one as
      uncertain, clears the start boundary, and requeues.
    - The old owner is fenced immediately (`ownership_lost`) and after re-claim
      (`stale_generation`).
    - Resume republishes as sequence 1 of generation 2.
    - Cancellation blocks recovery and fences every workflow write.
- **Retention, immutability, grants.**
    - Run identity, accepted steps, and settled dispatches are immutable.
    - Settled receipts cannot be deleted within 30 days, and cleanup clamps to the
      30/90-day floors.
    - No workflow routine is executable by `anon` or `authenticated`, and service role
      can execute every one.
    - Workflow tables are private, with RLS enabled.

What the Postgres race test adds:

- TS and SQL agree byte-for-byte on normalization (including every JavaScript `trim`
  whitespace character and NFC), canonical JSON (control characters, Unicode,
  escapes), policy, plan steps, and output ceilings.
- A TS-hashed Unicode admission is accepted, and the stored artifact passes the TS
  validator; a one-character history edit fails it.
- Two concurrent duplicate admissions create one turn.
- Two concurrent context checkpoints produce one winner and one event.
- Four concurrent maximum-size reservations, after a 100,000 micro-USD overrun, stop
  at exactly two; exposure ends at 188,858, under the 200,000 non-synthesis ceiling.
- Two concurrent identical settlements produce one `settled` and one
  `already_settled`.

## Defects the proof caught before QA

- Two JSON validators had an operator-precedence bug: `a->'k' - ARRAY[...]` parses as
  `a -> ('k' - ARRAY[...])`. Every admission with a cache reference check, and every
  planner result, would have failed at runtime.
- The SQL trim class was written with raw invisible Unicode characters. It is now
  ASCII `\u` escapes, verified against JavaScript `trim`.

## QA database

Both migrations were applied only through the scratch workdir linked to the QA ref,
which is confirmed different from the repository's production link. Before applying,
QA had no queued or running turn and no pending or processing chat job. Afterward:

- the three tables exist;
- 42 workflow routines exist;
- none is executable by client roles, and the tables are private;
- both prepared-validator guards are patched;
- the terminal trigger exists and SQL normalization works;
- all 845 existing input artifacts are intact, with 0 v4 rows.

## Rollout and rollback

Forward:

1. Apply both Task 85 migrations to production before, or together with, the first web or
   worker deploy that reads or writes v4. **Done 2026-09-15**, together with the Task 83
   prompt-snapshot migration; all three migration-history rows were verified afterward.
2. Deploy the readers. `load()` refuses v4; `loadRawWorkflowInput()` exists but has no
   caller.
3. Enable raw admission for the isolated cohort with a fake provider (86).
4. Enable real dispatch after the durable dispatch adapter (87).
5. Enable the ordinary-chat review affordance (88).

Rollback: disable review visibility and v4 admission first, then dispatch. Keep
settlement, reconciliation, recovery, and terminal sync deployed until every v4 turn
is terminal and every dispatch is settled or released. Remove the schema only in a
later migration after proving no v4 rows remain. Never edit these migrations after
application; QA now has them.

## 82 grounding repair (run in parallel; September 15 addendum below)

82's subagent shipped only a Case 14 judge calibration. It found no support for the
concise prompt change, so that change was not made. Details are in its
[receipt](CHAT_WORKFLOW_CASE14_GROUNDING_2026-09-14.md).

- **Rubric change.** The rubric gains one general rule that fails "has not been revised
  since"-style conclusions drawn from a partial record. The rest of the rubric is
  byte-identical to the September 14 gate's.
- **Calibration.** Calibration caught 12/12 overclaims, with 16/16 legitimate
  statements passing. Spend was $0.672 using cheap models only.
- **Harness refactor.** `judge.ts` now imports its chain and options from
  `judge-request.ts`. The move should be behavior-neutral and is covered by a test.
- **Product defect at initial review.** After a truncated document read, the model could
  describe the unread part of the record. Fixed September 15 with a structured,
  worker-authored evidence-coverage record on acting and forced-final continuations.
- **Judge temperature at initial review.** The judge's explicit `temperature: 0` was replaced
  by 0.2 because `getJSONResponse` used `temperature || 0.2`. Fixed September 15 with
  `temperature ?? 0.2`; providers that do not support temperature still omit it by policy.

## Combined 82+83+84+85 gate (2026-09-15)

**Failed: 46/52 (88.5%), with 43 of 45 turns passing.** Evidence is in
`output/agentic-gate/2026-09-14-combined-82-85/`.

How it ran:

- The gate ran from a git worktree snapshot of the dirty tree, on AC power with
  `caffeinate -dims`.
- Provenance was verified for web, worker, and expected:
  `199a6ba44` plus dirty tree `84f41a66…`.
- Runtime was 28 minutes, from 03:42 to 04:10 UTC.

What held:

- Every timing limit passed:
    - Case 2 max 50.4s (limit 60s)
    - Case 4 max 25.5s (limit 30s)
    - Case 8 max 21.4s (limit 30s)
    - Case 14 max 38.2s (limit 40s), with at most 6 tool calls (limit 8)
- The latency failures from earlier gates did not recur: the 82+84 Case 8 at 34.8s,
  and the Tasker 90 Case 2 at 115.7s and Case 4 at 33.7s.
- Case 10 (calendar) passed 3/3.

**Failure 1: Case 7, repetition 3, transport failure.** A slow claim response
silently parks a turn for seven minutes. This is an existing 82/84 executor defect,
not an 85 change.

1. QA's API layer stalled for about 28 seconds. `claim_pending_jobs` took 6.3s and
   `claim_agentic_chat_turn` took 12.0s (11.9s upstream). `pg_stat_statements` shows
   neither statement ever ran longer than 3.9s, so the wait was in connection or
   pooler queueing, not SQL execution.
2. The executor wraps the claim in the 10s overhead deadline (`awaitTerminal`). At
   10s it returned `recovery_required` without logging, even though the database had
   committed the claim as generation 1.
3. The consumer is `processor_managed`, so the queue row was left for domain recovery.
   Stalled recovery acts only after 420s. It requeued the turn at 03:59:51, and
   generation 2 finished in 30s.
4. The harness allows 315s plus 30s of terminal reconciliation, so it failed first.

85 changed neither the claim nor the executor. Its only trigger runs inside statement
time, which stayed under 3.9s.

**Failure 2: Case 14, repetition 1, quality failure (judge 1/5).** The report inferred
"Only planning-stage setup has occurred so far" from the project's planning state,
and the judge also flagged "No work has started on site". 82's new rubric rule caught
this unsupported real-world claim. The other two repetitions passed. This is the open
grounding defect in 82's receipt, not an 85 change.

## Lean fixes and rerun (2026-09-15)

DJ chose the lean fix for both failures. Both are built and uncommitted.

- **Case 7.** `claimWithReadback` in `turn-executor.ts` re-claims once when the first
  claim fails or outlives its deadline.
    - Claim is idempotent for the same processing token. A committed, pre-start turn
      returns `matching_current_claim` with `executionMayStart: true`, so the turn
      simply continues.
    - If the readback also fails, stalled recovery remains the fallback. Both failures
      are now logged through `onTerminalControlError` instead of passing silently.
- **Case 14.** Final Response Contract bullet 2 gains one sentence: a project or task
  state label describes the record, not the site.
- **Validation.**
    - Worker executor and stalled-recovery tests passed 113/113, including two new
      claim tests.
    - Prompt builder tests passed 63/63.
    - Worker typecheck and test types are clean.

**The rerun is invalid as evidence: 40/52.** Output is in
`output/agentic-gate/2026-09-15-lean-fixes/`.

- **Second gate on QA.** Another `pnpm agentic:gate` started from the main checkout at
  12:22:40 UTC (`output/agentic-gate/2026-09-15T12-22-40-081Z/`), eight minutes into
  the rerun.
    - Its worker (tree `06ebffe0…`) executed 7 gate-user turns from 12:23 to 12:30,
      including Case 7 repetition 2, which then stalled until the 420s sweep.
    - It was stopped mid-battery without writing `gate.json`.
    - A 12:21:50 attempt before it had failed on the missing env file.
- **QA stayed degraded after that run stopped.**
    - Upstream p90 was 289ms (last night 96ms), the maximum was 43.5s (13.9s), and 84
      requests took over 5s (13).
    - There were 500s on `observe_agentic_chat_turn_cancellations` and
      `persist_agentic_chat_semantic_event`.
    - Case 13 repetition 2 failed after its first attempt waited 111s in the queue.
    - Case 14 repetition 3 hit `tool_execution_persist_timeout`.
    - Case 8 went over 30s twice.
- **What the run still shows.**
    - The claim readback never triggered: no admission claim failed.
    - Both Case 14 repetitions that reached the judge passed.
    - Case 7 repetition 1 failed after its document write was rejected (HTML-encoded
      `&`, outside the approved contract) and then ended with an internal `unknown`
      error. Its cause is not established.
- **QA hygiene.** 7,234 `embed_onto_entity` jobs are pending with no consumer, and each
  gate adds about 400.
- **Landmine.** The gate takes no lock on the QA database, so a second gate or worker
  can silently share its queue.

## Still owed

- **Live acceptance is unproven.** Focused repairs are verified, but DJ explicitly
  declined another combined gate on September 15; no rerun is planned and no 52/52
  claim is made.
- **Production application completed September 15.** Migrations `20260914165546`,
  `20260914203007`, and `20260914203008` are recorded in the production migration
  ledger. Production verification found all three RLS-enabled workflow tables, 40
  workflow functions, service-role-only function execution, and the terminal trigger.
- **Consumer implementation:** 86 admission and context preparation, 87 runner and
  dispatch adapter, 88 UI. Regenerate `packages/shared-types/src/database.schema.ts`
  when those consumers adopt the new tables/RPCs; until then the versioned workflow
  contract is the application boundary.
