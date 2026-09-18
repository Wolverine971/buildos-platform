<!-- tasker/82-chat-workflow-regression-repairs.md -->

# 82 — Repair the current Agentic Chat regression gate

**Created:** 2026-09-12  
**Status:** Combined 82/84 acceptance remains blocked. The September 14 isolated gate scored **45/52**: Case 8 r3 exceeded 30s, Case 9 r2 omitted commissioned quoted text, Case 10 r3 violated the calendar buffer, and Case 14 r2 made an ungrounded claim. Cases 2/4 and Case 14 time/read limits pass; startup/final provenance match. See [Task 90 closeout](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md).

**September 14 validation:** The provider/reviewer repairs passed 392 focused tests, worker source/test types, and changed-runtime lint. DJ then authorized one full gate; it failed and was classified without an unchanged rerun. See the [complete receipt and next repairs](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md). Earlier scorecards remain preserved.
**Task 90 closeout (September 14):** DJ closed the testing handoff and directed work
to move on. Four further repairs passed 371 distinct focused worker tests and the
latest 12/12 selected live turns. See the [phase 2 evidence](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_PHASE2_REPAIRS_2026-09-14.md).

**September 15 grounding follow-up: implemented and focused-verified; live acceptance
remains unproven. DJ explicitly declined another gate run.**

- The shared judge-request refactor was sanity-checked against the gate harness. Its
  model route now uses the empty `custom` profile, so SmartLLM cannot append profile
  fallbacks behind the pinned Luna → Kimi K3 → Grok 4.6 chain. Its 48 focused
  judge/rubric/scenario tests pass, and web test types remain at 0/0 errors.
- `getJSONResponse` now preserves an explicit `temperature: 0` instead of replacing it
  with `0.2`. A second lower-level regression proves the custom judge chain stays exact.
  The SmartLLM regression file passes 36/36 and its package typecheck passes.
- A truncated `get_onto_document_details` result now produces a worker-authored,
  structured `agentic_chat_evidence_coverage_v1` system record. It identifies the exact
  preview-only document and forbids treating unread body/history as absent. The record
  remains present while acting read tools are available and when the read budget forces a
  tool-free final pass. The worker provider file passes 142/142; source and test typechecks
  pass.
- Full gate attempt `output/agentic-gate/2026-09-15T12-22-40-081Z/` was stopped after a
  retained turn proved a second, already-running gate worker on the isolated database had
  consumed work with a different `dirtyTreeSha256`. That invalidates provenance for both
  simultaneous runs. Per DJ's September 15 direction, do not run another gate. The focused
  repairs are ready, but no 52/52 live-acceptance claim is made.

**Case 14 grounding (September 14): ready for integration. Judge calibration plus the
September 15 structured coverage runtime fix; no static prompt change.**

- **Rubric.** The Case 14 rubric now scores as 1 any inference from a partial record to
  complete history. Turn `93390441-8559-4ee9-999a-f2ae569eac11` ("…so it has not been
  revised since") is the example. Bounded wording about records that were never read also
  scores 1.
- **Calibration.** On fictional fixtures the old rubric caught 1/6 overclaims. The calibrated
  rubric caught 12/12, and all 16/16 legitimate or evidence-supported statements passed.
- **Synthesis comparison.** A 72-turn fictional comparison did not support a prompt change.
  The concise variant did not reduce overclaims and repeated its example phrase. Both prompts
  described unread change logs after a truncated document read.
- **Implemented September 15.** The truncated-read defect now has a structured
  evidence-coverage continuation record with acting and forced-final adversarial regression
  tests. The trusted record excludes untrusted document prose, distinguishes returned
  metadata from unread body content, and permits facts explicitly returned by a later
  section read.
- **Acceptance.** Focused verification is complete. Live acceptance is unproven and another
  full gate is explicitly out of scope per DJ's September 15 direction.

See the [receipt](../docs/technical/reviews/CHAT_WORKFLOW_CASE14_GROUNDING_2026-09-14.md).

**Calendar — deferred by DJ:** retain Case 10's invalid buffered-slot result and the
overlap-query audit in that report. No further calendar work or test run is planned
until resumed. Passing focused samples are not a calendar repair.

**Priority:** Correctness follow-up and acceptance input. The bounded-review package
83 closed on 2026-09-14 ([receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md)).  
**Depends on:** [81](81-chat-workflow-implementation-program.md) baseline and retained evidence.  
**Parallel with:** 84 delivery work and 85 interface design.  
**Integration:** 82 + 84 form one stabilization change set; coordinator runs the full gate.

## Outcome and evidence

Make the ordinary chat regression battery pass reliably before expanding the workflow.
The latest complete gate, `output/agentic-gate/djflow-subscription-race-2026-09-12/`,
failed **44/52**, despite no startup hang or typed execution failure across 45 turns.
Read the [startup report](../docs/technical/reviews/DJFLOW_STARTUP_STALL_2026-09-12.md)
and the retained turn requests, provider passes, actual tool arguments, receipts,
database state, rubric, and verdict before choosing fixes.

| Failure               | Observed fact                                                                                      | Required behavior                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Case 2, repetition 2  | Tasks created, requested dependency links absent; `semantic_review_failed` with partial disclosure | Complete authorized relationships within bounds; partial failure must still disclose exactly what persisted   |
| Case 7, repetition 3  | Model's `create_onto_document` argument already contained `&amp;` in place of literal `&`          | Preserve user-requested literal content in the write and durable readback                                     |
| Case 14, repetition 1 | About 49.96s and 11 reads; factual judge passed                                                    | Under 40s and at most eight tool calls without skipping needed evidence                                       |
| Case 14, repetition 3 | About 21.95s/seven reads; judge rejected unbounded “No evidence that work has begun”               | Scope absence/unknown statements to inspected evidence and distinguish recorded status from inferred progress |

Do not treat HTML transport decoding as the Case 7 fix: the escaping originated in
the model's proposed content. Do not assume all eleven status reads were duplicates,
or that the judge rejects every legitimate unknown. Establish the actual evidence
coverage and failed review transition.

## Work

1. Write a short failure-to-source map using the original receipts. Reproduce each
   deterministic boundary in focused tests before editing its policy or implementation.
2. Repair task dependency continuation/review convergence. Preserve prior effect
   receipts so a repair cannot recreate tasks or claim unsaved links. Never bypass
   mutation review, expand writes, or turn failed approval into implicit approval.
3. Preserve exact document literals through proposal, reviewer, and persistence.
   Add adjacent coverage for intentional entity text, quotes, punctuation and
   Markdown so the fix cannot be unconditional HTML unescaping of user content.
4. Repair grounded status synthesis and the demonstrated read schedule. Batch only
   independent reads; retain required projection dependencies. Bound the plan from
   evidence coverage rather than stopping at an arbitrary count with missing facts.
5. Profile remaining latency by critical-path spans: provider work, effect
   reserve/begin, adapter execution, reconciliation, receipt persistence and delivery.
   Send delivery findings to 84. Do not add concurrent request durations as elapsed
   time, or combine effect transactions without lost-response and fencing proof.

Previously completed budget-absence assertions, Calendar judge evidence plumbing,
estimate-update guidance, provider header timeout, and startup subscription fix are
regression controls. Keep them; do not spend this task reimplementing them.

## Ownership

Own narrow fixes in:

- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` and its tests.
- `apps/worker/src/workers/agentic-chat/provider/review/` and relevant ordinary
  provider continuation code, only where the retained failure points.
- `apps/worker/tests/agenticChatMutationBatchReview.test.ts`,
  `agenticChatTurnProvider.test.ts`, and the relevant Cedar House correctness fixtures.

84 owns stream publishing. 87 owns workflow specialist prompts, inherited when 83 closed. Composition-file
changes go through 81's coordinator lock. Consult Taskers 65/67/70/80 before editing
their active prompt/reviewer surfaces; this package owns these named QA failures,
not their production deployments or cheaper-reviewer experiment.

## Validation and completion

Run focused files through `test-gate`; for example:

```sh
test-gate run pnpm --filter @buildos/worker exec vitest run tests/agenticChatMutationBatchReview.test.ts tests/agenticChatTurnProvider.test.ts
test-gate run pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts src/lib/tests/agentic-e2e/scenarios/cedar-house/budget-absence.test.ts
```

The coordinator then runs the [full gate](../docs/testing/agentic-chat-gate.md):
all expected turns, 13 cases, three repetitions, **52/52**, verified provenance,
Case 2 <60s, Cases 4/8 <30s, Case 14 <40s and at most eight tool calls. Keep the
original literal and grounding oracles. A genuine oracle defect requires retained
evidence plus an independent regression for both false pass and false failure;
do not lower a threshold, drop a repetition, or rerun a bad product answer for score.

Return the failure map, targeted diff, passing focused results, residual latency
attribution, and evidence references. Mark ready for integration first; accepted
only when the 82/84 stabilization gate passes. If one failure persists, keep this
change set open and report it rather than allowing architecture changes to stack.
