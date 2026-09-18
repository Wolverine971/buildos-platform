<!-- tasker/89-chat-workflow-integration-acceptance.md -->

# 89 — Prove the integrated workflow and prepare the test handoff

**Created:** 2026-09-12  
**Status:** Test planning can proceed; final execution depends on 82–88. The 82/84 stabilization gate remains unaccepted: September 14 isolated result **45/52**, with Case 8 latency and Case 9/10/14 content/quality failures. See [Task 90 closeout](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md).

**September 14 validation:** The provider/reviewer repairs passed 392 focused tests, worker source/test types, and changed-runtime lint. DJ then authorized one full gate; it failed and was classified without an unchanged rerun. See the [complete receipt and next repairs](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md). Earlier scorecards remain preserved.

**Task 90 closeout:** DJ closed the investigation/focused repair handoff and
deferred calendar work to move on. This tracker now owns its remaining acceptance
record: the last complete gate failed at 45/52; subsequent repairs passed 371
focused worker tests and the final diagnostic passed 12/12 selected turns.
The manual revision-history overclaim remains with 82 despite a passing judge.
Preserve both failed and passing receipts, the source provenance, and the rollback
lane. Do not launch a full gate as part of closing Task 90 or silently exclude the
calendar case from future release criteria. See the
[closeout](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md) and
[phase 2 evidence](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_PHASE2_REPAIRS_2026-09-14.md).

**Task 83 closeout (September 14):** DJ closed bounded reviews and prompt
snapshots. Keep live QA turn `1bbcc9d0-fa6a-4a3b-9f6c-3333bb2dd7a0` alongside the
partial replay `594561f2`. It was a prepared hit that completed a two-specialist
review and saved snapshot `08e2227d`.

This tracker now owns 83's acceptance debt:

- Include the 83 change set in the next complete gate.
- Prove an intentional partial review live in the browser matrix. Truncation,
  compact retry, and partial labeling are currently proven only with deterministic
  fakes.

See the [Task 83 receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md).

**Owner:** Prefer the 81 coordinator; otherwise one dedicated test owner using its QA slot.  
**Depends on:** [81](81-chat-workflow-implementation-program.md) source/evidence manifest; 85 interface freeze for new fixtures.  
**Parallel with:** Implementation, for read-only review and fixture design only; live runs are serialized.

## Outcome

Produce a repeatable test path and an honest evidence packet proving that the pilot
works through ordinary chat, survives a real worker restart, stays read-only and
bounded, and preserves ordinary chat regressions. DJ can open the local app and
test the intended experience with clear instructions and known limitations.

This task is not permission to relax the gate, compensate for broken product code
in the harness, reset a normal database, or deploy to production. Failures go back
to their owning package; the current change set remains open until resolved.

## Start now: evidence and fixtures

1. Inventory existing harnesses, source-provenance checks and failure artifacts.
   Reuse `scripts/agentic/gate.ts`, `scripts/agentic/workflow-prototype.ts` and
   `apps/web/src/lib/tests/agentic-e2e/workflow-prototype.live.test.ts`.
2. Preserve the original failed turn `c2762391-d870-4e41-8a96-d2a84499a02e`, the
   post-fix partial replay `594561f2-85f2-4552-8d9a-96c6f0a3fc41`, and all failed
   gate scorecards. Supply relevant evidence privately to 82/83/84. A successful new
   turn cannot rewrite the original failed review or turn it into a completion claim.
3. Define fault injection at durable boundaries, not arbitrary sleep-based timing.
   Add disabled-by-default, test-only hooks only where existing fixtures cannot
   reliably observe a boundary. Coordinate product-side hooks with their owner;
   hooks must not weaken production authority, leak prompts or be browser-controlled.
4. After 85 freezes interfaces, implement bounded fake-provider fixtures. Coordinate
   harness edits with 82's correctness tests. Keep harness turn retries at zero in
   scored runs; explicit recovery inside the product is recorded as product behavior.

## Required acceptance matrix

| Journey / cut                                           | Required evidence                                                                                                                             | Primary owner if it fails |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| New raw review and preserved prepared/prewarmed review  | Valid worker/prewarmed snapshots as applicable, two accepted role reports, streamed editor text before synthesis ends, one saved final answer | 83/86/88                  |
| Duplicate/uncertain Send                                | One request, message, turn and job; changed intent conflicts                                                                                  | 85/86                     |
| Queue wait/context timeout/access revocation            | Truthful states, bounded failure, no unauthorized context/model use                                                                           | 85/86/88                  |
| Slow/missing subscribe, broadcast or ACK                | Computation progresses after durable acceptance; ordered reconnect; bounded memory                                                            | 84                        |
| Kill after one specialist is accepted                   | Restart reuses its result and frozen context; no second dispatch for that completed step                                                      | 85/87                     |
| Kill during an unfinished provider call                 | Prior reservation remains uncertain/charged; bounded retry cannot reset limits                                                                | 85/87                     |
| Duplicate queue delivery and late old worker            | One accepted result/terminal outcome; stale generation cannot commit                                                                          | 85/87                     |
| Stop during context, specialist and synthesis           | Future dispatch/commits fenced, one terminal state, no duplicate answer, incurred cost retained                                               | 86/87/88                  |
| Disconnect/remount/reconnect                            | Work continues within policy; UI restores accepted progress and text exactly once                                                             | 84/87/88                  |
| Kill during streamed synthesis / lost terminal response | Defined partial/reconciled outcome; no appended regenerated answer or duplicate terminal message                                              | 85/87/88                  |
| Specialist truncation/failure/no evidence               | Clear partial or failure, correct coverage disclosure, no fabricated findings                                                                 | 83/87/88                  |
| Dispatch fallback, concurrent reservation, exhaustion   | Every physical attempt counted, cap/headroom honored, uncertain exposure survives restart                                                     | 85/87                     |
| Ordinary chat and unsupported input                     | Existing prepared lane works; no sticky review mode; no new mutation-recovery permission                                                      | 82/86/88                  |
| All workflow cases                                      | Zero domain tools/writes; server cohort enforced; evidence and final answer agree                                                             | Coordinator               |

Deterministic fixtures cover the full matrix. Real browser checks supplement them;
at minimum prove ordinary entry, a complete review, intentional partial review,
cancel, reconnect, and a real process kill after one accepted specialist. Record
process/source identity and real stale-detection delay. A fake in-memory restart
does not satisfy the real-worker criterion.

## Measure latency, usefulness and cost

Record these separate milestones with their clock/source:

- Client click and first visible submitting feedback.
- Request arrival, durable admission, response headers and queue claim.
- Context start/end and first server progress versus first visible client progress.
- First accepted specialist findings and first visible answer text.
- Synthesis end, durable terminal commit and visible terminal state.
- On failure/restart: last progress, process death, stale detection, requeue, reclaim
  and completion. Do not present recovery detection time as model latency.

Use correlated spans; never sum overlapping REST durations into elapsed latency.
Report actual median/range and individual rows for a small sample, not unsupported
p95/p99 claims. The historical replay's ~38.27-second click-to-terminal time is a
single backend-correlated observation, not a calibrated browser first-token baseline.

Run three matched pairs of workflow versus ordinary single-agent read-only questions
on equivalent seeded project snapshots with the same question/model configuration
where applicable. Capture grounded coverage, useful next actions, stated unknowns,
latency and total physical-provider cost, including planner/editor/fallbacks/retries.
Keep the sample small and label it exploratory. Do not claim the multi-agent path is
better if the extra cost/time yields no observable gain; record that result and
recommend keeping the explicit entry rather than making it the default.

The frozen execution caps from 85 are acceptance limits. New workflow latency is
measured, not an invented customer SLA. Existing Cedar timing/read thresholds remain
hard requirements. Any unpriced/uncertain cost must remain visible in the result.

## One QA lane and strict gate

Read [the gate setup](../docs/testing/agentic-chat-gate.md). Before every full run:

1. Identify and stop the known lab/other worker attached to the **isolated test DB**.
   Different ports do not isolate consumers. Do not stop unrelated production workers.
2. Verify private environment, schema, dedicated connected Calendar account and
   current source manifest. New migrations are applied only through the agreed
   isolated test workflow. Keep secrets out of logs and receipts.
3. Freeze the integration source, rebuild dependencies via the existing runner and
   run `pnpm agentic:gate` with `AGENTIC_GATE_ENV_FILE` and a fresh evidence directory.
   Do not run another gate, heavy suite or source mutation in parallel.
4. Require all expected turns/13 cases/three repetitions, **52/52**, matching web and
   executing-worker provenance, Case 2 <60s, Cases 4/8 <30s, Case 14 <40s and ≤8 calls.
   A missing Calendar/database prerequisite, skipped case, stale source or capture
   failure is blocked/failed, never a pass. Retain raw evidence and every scorecard.
5. If code changes after a failure, rerun the required gate for that change set before
   stacking the next. A diagnostic subset cannot substitute. Observe `test-gate`
   resource refusal: wait at least 60 seconds, retry once, then report the block.

After final acceptance, restart the local Workflow Lab/ordinary chat preview on the
verified source if DJ is still testing it. Record URL, cohort scope and how to stop
that exact runner before the next QA gate. Leave the user's unrelated services alone.

## Completion packet

Create `docs/testing/chat-workflow-pilot-acceptance.md` with:

- Source/provenance and migration versions; enabled environment/cohort, no secrets.
- One status row per acceptance case and links to private evidence locations.
- Full gate scorecard plus preserved earlier failures; browser and real restart proof.
- Admission/first-progress/first-answer/total timing and measured cost comparison.
- A short manual script: open project chat, select Review project, send the question,
  inspect findings, Stop another request, refresh and confirm saved state.
- Exact remaining limitations, any unresolved failures, local start/stop instructions
  and reader-before-writer rollback procedure. No production readiness claim.

Update durable architecture/prototype/build-list docs to match what actually passed.
Notify the coordinator which taskers can close under the folder maintenance rule.
Acceptance is complete only when the integrated pilot and mandatory gate pass;
documentation alone or “tests added” is not completion.
