<!-- tasker/138-faster-write-turns.md -->

# 138 — Faster write turns

**Status:** DONE — awaiting Claude check · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~1 day lean, +1 day ambitious  
**Owner:** Codex implementation and self-check complete; Claude light check next · **Scope:** lean, authorized by DJ on 2026-10-19 after the investigation briefing

Source: speed item S1 in `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (DJ picked it on 2026-10-18). Claude measured production on 2026-10-18 (read-only); the numbers are below.

## What users get

Eligible reviewed writes finish from their receipts as soon as all requested work lands, saving one closing acting pass. Existing simple writes retain their direct lane. Routing limits and repeat-review behavior are unchanged in this lean implementation; the new telemetry will support later decisions.

## What production shows (30 days to 2026-10-18)

| Measure                                                                  | Value                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Reviewer passes (`llm_usage_logs.metadata.passRole = 'mutation_review'`) | 256; p50 4.3 s, p90 8.2 s; 1,410 s = 22% of all chat model time |
| ...from the prod battery's harness account                               | 215 (synthetic)                                                 |
| ...from real users                                                       | 41 (DJ 39, two other users 1 each)                              |
| Real write turns that went to review                                     | 26 of 107 real turns (24%)                                      |
| ...reviewed once                                                         | 18                                                              |
| ...reviewed 2–5 times                                                    | 8 (each loses ~9–21 s to review alone)                          |
| Acting passes per turn                                                   | 3.5 on reviewed turns vs 3.0 on the rest (acting p50 2.6 s)     |

So the 22% headline is mostly the battery. What a real user feels is about 4.3 s per reviewed write turn, plus one closing pass, plus the repeat reviews.

At investigation time, nothing recorded why a batch went to review. Item 1 adds that telemetry. Historical reasons remain unknown because the complete withheld proposals were not persisted; see the report below.

## Pick (DJ)

Selected: **lean**. DJ authorized implementation after the briefing, including the four usage-telemetry files added to the owned scope below. Item 4's evidence review is complete; no bucket qualified for widening.

- **Lean = items 1–4.** Record why each write is reviewed, close reviewed turns from the receipt (−1 acting pass, ~2.6 s), replace the regex check with a structured signal, and widen the direct lane only where the data proves review adds nothing.
- **Ambitious = lean + item 5.** Stop repeat reviews within one turn: diagnose the 8 multi-review turns, then fix whichever cause dominates. If it's bounces, fix the acting model's guidance on the top bounce reason. If it's successive batches, approve once per scope.

## Files you own

- `apps/worker/src/workers/agentic-chat/provider/write-routing.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-state.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts` (telemetry only)
- `apps/worker/src/workers/agentic-chat/provider/contracts.ts` (approved telemetry plumbing)
- `apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts` (approved telemetry plumbing)
- `apps/worker/src/workers/agentic-chat/provider/openrouter/types.ts` (approved telemetry plumbing)
- `apps/worker/src/workers/agentic-chat/provider/openrouter/telemetry.ts` (approved telemetry plumbing)
- `apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`
- `packages/agentic-chat-runtime/src/loop/completion-receipt.ts`
- The tests for these files under `apps/worker/tests/agenticChat*.test.ts` and next to the runtime files, the `catalog-fitness` snapshot, and the two tool-size budget tests (`apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts`, `apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts`)
- New: `scripts/agentic/write-review-reasons.ts` (read-only) and `docs/research/write-review-reasons-2026-10.md`

## Work, in this order

1. [x] **Record why each write goes to review** — DONE locally; existing verdict telemetry reused, historical limitations reported
    - Now: `takeWithheldMutationBatch` (`turn-state.ts` ~618) holds a batch whenever `assessDirectWriteBatch` (`write-routing.ts` ~117) doesn't return `simple`, but the `contract_required.reason` is never saved.
    - Fix, live: put the reason, the mutation tool names and the count on the reviewer pass's usage metadata (`writeRouteReason`, `writeRouteTools`, `writeRouteCount`). Also put the reviewer's verdict (approved / revise / refuse) where it can be counted.
    - Fix, history: write `scripts/agentic/write-review-reasons.ts`, a read-only script over the last 30 days of reviewed turns.
        - For each held batch, recompute the reason from the stored tool calls and turn events. Mark it "unknown" where context can't be rebuilt.
        - Join the reviewer's verdict.
        - Print reason × count × approve rate, separately for real users and the harness account (`agentic-e2e…`).
        - Save the table in `docs/research/write-review-reasons-2026-10.md`.
    - Regression test: a withheld batch's reviewer pass carries the reason, tools and count.
2. [x] **End a reviewed write turn from its receipt** — DONE; existing partial-work fallback preserved
    - Now: `directWriteReceiptText` (`turn-state.ts` ~1187) returns null whenever `reviewedBatchExecuted` or `requestExpectation` is set. So after an approved batch lands, another acting pass (p50 2.6 s) writes the closing text.
    - Fix: when the reviewed batch fully landed and the completion receipt (`completion-receipt.ts`) shows every contract outcome satisfied with nothing remaining, close with the receipt text, the same way simple direct writes already do. Keep the pass when outcomes remain, when anything failed or partially landed, when a read result is still unreported, or when the user's images are in play.
    - Regression tests: an approved single batch that satisfies the contract → 1 acting pass fewer, receipt text. A multi-stage request with outcomes left → the pass still runs. A partial landing → the existing `mutation_unfulfilled` fallback still runs (the original task incorrectly assumed another model pass).
3. [x] **Replace the regex check on the user's message with a structured signal** — DONE (`content_source: 'user_verbatim'`)
    - Now: `requestsSourcePreservationReview` (`write-routing.ts:252`) keyword-matches the user's message ("verbatim", "exact … text", "word for word") to force review of document writes. That classifies language with regex (AGENTS.md).
    - Fix: give the document create and update tools an optional structured argument the acting model sets when the user asks for text kept exactly. For example `content_source: 'user_verbatim'`; pick the name that fits the catalog. Route on that argument and delete the regex.
    - Keep the description short; both tool-size budget tests must still pass. Regenerate the `catalog-fitness` snapshot once at the end.
    - Regression tests: the argument set → contract lane. The same words in the message without the argument → no lexical routing. No regex on message text remains in `write-routing.ts`.
4. [x] **Widen the direct lane only where item 1's data proves review adds nothing** — SKIPPED widening; evidence review complete, no qualifying bucket
    - Read the item 1 table. A reason bucket qualifies only if both hold:
        - real users or the harness show ≥ 95% approval over ≥ 10 samples;
        - a wrong write in that bucket is undoable (the change has Undo or is a create).
    - Likely candidates:
        - `mixed_tool_batch` when the mutations are creates in the focused project: run the reads, then the creates go direct.
        - `mutation_count_exceeded` for 4–6 creates in the focused project.
    - **Do not** widen updates to an existing item picked from a read with several hits. That rule is on purpose ("three plausible 'email' tasks stay a clarification"); changing it is DJ's call. Put the numbers for it in the report instead.
    - If no bucket qualifies, change nothing and say so. That is a fine outcome.
    - Regression tests for every widened bucket, plus a test that the excluded multi-hit case still goes to review.
5. [x] **Ambitious only: stop repeat reviews within one turn** — SKIPPED (lean scope; 7 of 8 multi-review turns contain revisions)
    - Now: 8 of 26 real reviewed turns were reviewed 2–5 times.
    - Step 1: classify each multi-review turn from its turn events. A bounce means the reviewer asked for a revision and the model resubmitted; a successive batch means a new write after an approved one.
    - Step 2, depending on which dominates:
        - **Bounces:** find the top revision reason and fix the acting model's guidance or the tool schema so the first proposal passes. Don't loosen the reviewer.
        - **Successive batches:** after an approval, a later batch in the same turn that stays inside the approved scope runs without a second review. Same targets, same tool kinds, and within the approved contract's outcomes, bound by hash like today's approval. Anything new or outside that scope is reviewed as now.
    - Regression tests for the chosen fix. Replay the 8 turns' shapes as fixtures; no live calls.

## Rules

1. Read `AGENTS.md` first, and `apps/web/AGENTS.md` before touching anything under `apps/web`.
2. **Shared checkout.** Other agents are editing other files in this same checkout right now. Edit only the files under "Files you own" plus new test files next to them. Never revert, reformat, stash or check out changes you didn't make: no `git stash`, `git checkout -- <path>`, `git reset` or `git clean`. If a fix truly needs a file outside your list, stop that item and write it under "Blocked".
3. Before fixing each item, confirm the code still looks as described (line numbers drift). If not, mark it `NOT A BUG` or `ALREADY FIXED` with one line of evidence and move on.
4. Test first: write the regression test, run it and watch it fail, then fix and watch it pass. Say in the report that you saw it fail.
5. Narrow checks only; the laptop runs several agents at once. Use the commands under "Checks". Never run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and never pass `--maxWorkers`, `--pool` or `--no-isolate`. If `test-gate` refuses or queues a run, wait at least 60 s and retry once.
6. No paid or live model calls, no production database writes, and no Railway or Vercel changes. The item 1 script reads production through the existing read-only paths (for example `supabase db query --linked` with SELECTs only). It never writes. It never prints message text, only ids, tool names, reasons and counts.
7. Never decide what user or model text means with regex or keyword lists (AGENTS.md, "Never classify language with regex"). Route meaning through a structured channel: a tool argument, a Jev or turn-contract field, a `type_key`, a UI action. Item 3 removes one such check; don't add another.
8. Migrations: new file only (never edit an existing one), run `pnpm db:rehearse supabase/migrations/<file>.sql`, and **do not apply**. DJ applies. (None expected.)
9. Don't commit unless DJ asks. If he does, commit only your own files: `git commit -m "..." -- <your paths>`.

## Checks

- `pnpm --filter @buildos/worker exec vitest run tests/agenticChatDirectWriteReceipt.test.ts tests/agenticChatMutationBatchReview.test.ts tests/agenticChatReviewedTurnContract.test.ts tests/agenticChatReviewDecisionCompletion.test.ts tests/agenticChatReviewTelemetry.test.ts tests/agenticChatExternalContentReview.test.ts tests/agenticChatWorkerSurfaceBudget.test.ts`
- `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/completion-receipt.test.ts src/loop/turn-contract.test.ts src/catalog/`
- `pnpm --filter @buildos/agentic-chat-runtime build` (then the worker typecheck)
- `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts`
- `pnpm --filter @buildos/worker run typecheck` and `pnpm --filter @buildos/worker run typecheck:tests`

## Paid validation (not for the Codex agent)

The prod battery on `1499e4d54` (2026-10-18 night, run by Claude) is the "before" number: **48/52**, p50 **7.0 s**, p90 **16.7 s**, **$0.25 measured on DeepSeek V4.1 Flash**. After this ships and deploys, DJ may separately authorize an "after" run. Confirm the acting model in the run's env and estimate from that model's measured spend before requesting approval. Compare reviewer passes per write case, acting passes per turn, p50/p90 turn time and the scorecard; 52/52 is a target, not the measured baseline. No paid run was performed for this task.

## Self-check before you report

- `git status --porcelain`: every file _you_ touched is in "Files you own" or is a new test next to one. Other agents' files will show up there too; leave them alone.
- Re-read your whole diff once as a skeptical reviewer. For each change, name one more edge case and check it is handled or tested.
- Every regression test failed before its fix and passes now.
- Every command under "Checks" passed. Paste the pass counts.
- No new regex or keyword matching on user or model text, and the old one in `write-routing.ts` is gone. No paid calls. No production writes.

## Report (reply to DJ with this, and update this file)

1. Each work item: `DONE`, `NOT A BUG`, `ALREADY FIXED`, `SKIPPED (why)` or `BLOCKED (why)`, with one line on what changed.
2. The item 1 table (reason × count × approve rate, real vs harness), and which buckets item 4 widened or why none qualified.
3. Files changed.
4. Commands run, with pass/fail counts, and confirmation that each regression test failed first.
5. Anything DJ must decide (for example, the multi-hit update rule, with its numbers).

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Implementation report — 2026-10-19

1. **DONE:** host-only reviewer route reason, tool names, count and batch hash now reach usage metadata. Reviewer verdict observations were **ALREADY FIXED** in `provider/review/review-telemetry.ts`; the new script reuses them.
2. **DONE:** fulfilled reviewed writes close on ledger receipt text under the existing flag. Remaining outcomes, earlier domain reads, dropped mixed-batch reads, required user action, failed/missing receipts and live vision prevent this shortcut. Partial reviewed batches keep their existing unfinished-work fallback.
3. **DONE:** both document schemas expose the optional source-preservation argument, worker projection preserves it, the router reads it, and the prose regex is removed. The approved-correction fixture uses the new field. Catalog snapshot regenerated once.
4. **SKIPPED widening:** all historical routing reasons are unknown; no bucket supports the ≥95% / ≥10-sample threshold. Multi-hit updates retain review.
5. **SKIPPED:** ambitious changes were outside the selected scope. Seven of eight real multi-review turns contain revision requests; approval reuse is not justified.

The read-only report covers 2026-09-19 00:00 through 2026-10-19 00:00 America/New_York, end exclusive:

| Cohort     | Reason  | Passes | Approved | Revise | Refuse | Unknown verdict | Approval / known |
| ---------- | ------- | -----: | -------: | -----: | -----: | --------------: | ---------------: |
| Real users | unknown |     41 |       19 |     15 |      1 |               6 |            54.3% |
| Harness    | unknown |    224 |        2 |      1 |      0 |             221 |            66.7% |

Passes are not independent batch samples. Complete original proposals cannot be reconstructed from executed writes: rejected writes and dropped reads are missing, and most harness turn links were deleted. The script deliberately reports unknown rather than an approval-biased inference. Full method, coverage and rollout limits: [write-review report](../docs/research/write-review-reasons-2026-10.md).

### Changed files

- Eight worker production files: `provider/{contracts.ts,openrouter-client.ts,openrouter/types.ts,openrouter/telemetry.ts,turn-provider.ts,turn-state.ts,write-routing.ts}` and `mutations/tool-catalog.ts`.
- Runtime `src/catalog/definitions/ontology-write.ts` and documentation in `src/loop/completion-receipt.ts`.
- Five worker tests: `agenticChatDirectWriteReceipt`, `agenticChatOpenRouterClient`, `agenticChatTurnProvider`, `agenticChatWorkerSurfaceBudget`, `agenticChatWriteRouting` (`.test.ts`).
- Web `src/lib/services/agentic-chat/tools/core/__snapshots__/catalog-fitness.test.ts.snap`.
- New `scripts/agentic/write-review-reasons.ts` and `.test.ts`; new research report linked above; this task record.

All 20 files are within the original or user-approved scope. Unrelated shared-checkout changes were left alone.

### Checks and failure-first evidence

All heavy commands below used `test-gate run`; no worker-limit overrides or root suites were used.

| Check                                                                                                                            | Result                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Worker Vitest: seven files under Checks plus `agenticChatWriteRouting`, `agenticChatOpenRouterClient`, `agenticChatTurnProvider` | **408 passed**, 10 files                     |
| Runtime Vitest command under Checks                                                                                              | **180 passed**, 7 files                      |
| Runtime build command under Checks                                                                                               | **Passed**, ESM/CJS and declarations         |
| Web Vitest command under Checks, with `-u` once                                                                                  | **12 passed**, 2 files; one snapshot updated |
| Worker `typecheck`                                                                                                               | **Passed**                                   |
| Worker `typecheck:tests`                                                                                                         | **Passed**, 0/0 errors at baseline           |
| `node --import tsx --test scripts/agentic/write-review-reasons.test.ts`                                                          | **5 passed**                                 |
| GET-only report command in the research report                                                                                   | **Passed**, 265 reviewer passes analyzed     |
| Scoped `git diff --check` and diff review                                                                                        | **Passed**                                   |

Initial implementation total: **605 tests passed**. The broad worker run first had **407 passed / 1 failed** because the old exact-source fixture omitted the new field; updating that fixture resolved it. The first web run had **11 passed / 1 snapshot mismatch** from the intended two schema additions; the single snapshot regeneration resolved it. Follow-up validation is recorded below.

Observed failures before their fixes: withheld reviewer route metadata and durable usage metadata were absent; fulfilled reviewed writes used two acting passes instead of one; the structured source routing/schema tests failed (seven routing cases plus the projection check); the report test could not import the not-yet-created module. An additional mixed-proposal test caught premature completion after a dropped read, then passed with explicit withheld-read tracking. Existing guards and added safety cases also pass, but were not all failing on the baseline.

Skeptical diff review checked stale route metadata (reviewer-only emission), partial/missing receipts (continuation/fallback), dropped reads (new regression), live vision (existing guard preserved), schema projection/hash binding (covered), historical retries (deduplicated keys and unknown ambiguous verdicts), and report privacy (no prompts or argument bodies emitted). Both size budgets pass; the worker project surface is 72,440 / 72,460 bytes.

No new semantic regex, paid calls, production writes, deployments or commits. The expected saving is **one acting pass per eligible reviewed turn**; actual latency and model compliance with the source flag are unmeasured. No DJ decision is required for the completed lean implementation. Claude review and separately approved post-deployment validation remain next steps.

### Follow-up review — 2026-10-19

At DJ's request, checked the implementation again and fixed two issues within the existing scope:

- **Missing saved identity:** a success-shaped create result without an entity ID could still satisfy a count-only checklist. The reviewed receipt shortcut now requires an entity identity on every ledger entry. The new test failed with one acting pass and passes after the guard, preserving the closing pass. Adapter validation normally prevents this shape in production; no malformed production write was observed.
- **Delayed review observations:** format repairs reuse logical rounds and persist decision observations asynchronously. A delayed first-attempt decision could be assigned to the repair pass by timestamp. The report now marks all passes in such a repeated round unknown. The regression failed with an incorrectly attributed `invalid` verdict, then passed. The same read-only production window now shows 19 approvals, 15 revisions, one refusal and six unknowns for real users; the table above is corrected.
- Added an explicit image-bearing reviewed-turn test, which confirms images reach the acting model and preserve its closing pass. The existing guard needed no production change.

Validation: `test-gate run pnpm --filter @buildos/worker exec vitest run tests/agenticChatDirectWriteReceipt.test.ts tests/agenticChatReviewedTurnContract.test.ts tests/agenticChatTurnProvider.test.ts` — **202 passed**, three files. `node --import tsx --test scripts/agentic/write-review-reasons.test.ts` — **6 passed**. Worker `typecheck` and `typecheck:tests` passed; the latter initially caught and then verified correction of the new image fixture's message type. No new runtime/catalog changes required rebuilding or regenerating the snapshot. Production limits remain unchanged.

## Blocked

None for the lean implementation. Historical routing reconstruction is unavailable from retained evidence; direct-lane widening must await new telemetry. Paid validation is pending, not claimed passing.

## Log

- 2026-10-18: created by Claude after DJ picked "faster write turns". Production numbers measured read-only on 2026-10-18.
- 2026-10-19: Codex implemented the authorized lean scope after briefing DJ, added the read-only evidence report, preserved routing limits, and completed 605 free tests plus build/typechecks. Local changes are ready for Claude's check; no deployment or paid run.
- 2026-10-19: DJ requested a second review. Fixed missing-identity receipt completion and delayed-verdict attribution after observing both regressions fail; added image coverage. Follow-up checks passed 202 worker tests, six report tests and both worker typechecks. Existing staged work was left staged; follow-up edits were not staged or committed.
